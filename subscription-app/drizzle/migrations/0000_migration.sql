create type public.app_role as enum ('admin', 'client');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "Users read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- First user to sign up becomes admin; everyone else is a client
create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'client');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_role after insert on auth.users
  for each row execute function public.handle_new_user_role();

-- Clients
create table public.clients (
  user_id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  shop_name text not null check (char_length(shop_name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 255),
  phone text not null check (char_length(phone) between 7 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.clients to authenticated;
grant all on public.clients to service_role;
alter table public.clients enable row level security;
create policy "Own client row read" on public.clients for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Own client row insert" on public.clients for insert to authenticated
  with check (user_id = auth.uid());
create policy "Own client row update" on public.clients for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Settings (single row)
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  upi_id text not null default 'yourname@upi',
  payee_name text not null default 'Your Business',
  premium_price int not null default 199,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
grant select, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "Settings readable" on public.app_settings for select to authenticated using (true);
create policy "Admin updates settings" on public.app_settings for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Trial codes (admin only)
create table public.trial_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 4 and 40),
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.trial_codes to authenticated;
grant all on public.trial_codes to service_role;
alter table public.trial_codes enable row level security;
create policy "Admin manages codes" on public.trial_codes for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan text not null check (plan in ('trial','premium')),
  status text not null default 'active' check (status in ('active','cancelled')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  trial_code_id uuid references public.trial_codes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.subscriptions (user_id, expires_at desc);
grant select, update on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "Own subs read" on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Admin updates subs" on public.subscriptions for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount int not null,
  utr text not null check (char_length(utr) between 6 and 40),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index payments_utr_unique on public.payments (lower(utr));
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "Own payments read" on public.payments for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Client submits payment proof (amount comes from settings, not the client)
create or replace function public.submit_payment(_utr text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare _id uuid; _price int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from clients where user_id = auth.uid()) then raise exception 'Add your details first'; end if;
  if _utr is null or char_length(trim(_utr)) < 6 or char_length(trim(_utr)) > 40 then raise exception 'Invalid transaction ID'; end if;
  if exists (select 1 from payments where user_id = auth.uid() and status = 'pending') then
    raise exception 'You already have a payment awaiting verification';
  end if;
  select premium_price into _price from app_settings where id = 1;
  insert into payments (user_id, amount, utr) values (auth.uid(), _price, trim(_utr)) returning id into _id;
  return _id;
exception when unique_violation then raise exception 'This transaction ID was already submitted';
end $$;

-- Client redeems trial code: one trial per client
create or replace function public.redeem_trial_code(_code text)
returns timestamptz language plpgsql security definer set search_path = public
as $$
declare _c trial_codes%rowtype; _exp timestamptz;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from clients where user_id = auth.uid()) then raise exception 'Add your details first'; end if;
  if exists (select 1 from subscriptions where user_id = auth.uid() and plan = 'trial') then
    raise exception 'Free trial already used';
  end if;
  select * into _c from trial_codes where code = trim(_code) for update;
  if not found or not _c.active or _c.used_count >= _c.max_uses then raise exception 'Invalid or expired code'; end if;
  update trial_codes set used_count = used_count + 1 where id = _c.id;
  _exp := now() + interval '14 days';
  insert into subscriptions (user_id, plan, expires_at, trial_code_id) values (auth.uid(), 'trial', _exp, _c.id);
  return _exp;
end $$;

-- Admin approves / rejects payments
create or replace function public.review_payment(_payment_id uuid, _approve boolean, _note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare _p payments%rowtype; _start timestamptz; _sub uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  select * into _p from payments where id = _payment_id for update;
  if not found or _p.status <> 'pending' then raise exception 'Payment not pending'; end if;
  if _approve then
    select greatest(now(), coalesce(max(expires_at), now())) into _start
      from subscriptions where user_id = _p.user_id and status = 'active';
    insert into subscriptions (user_id, plan, starts_at, expires_at)
      values (_p.user_id, 'premium', _start, _start + interval '1 month') returning id into _sub;
    update payments set status = 'approved', subscription_id = _sub, reviewed_at = now(), admin_note = _note where id = _p.id;
  else
    update payments set status = 'rejected', reviewed_at = now(), admin_note = _note where id = _p.id;
  end if;
end $$;

revoke execute on function public.submit_payment(text) from anon;
revoke execute on function public.redeem_trial_code(text) from anon;
revoke execute on function public.review_payment(uuid, boolean, text) from anon;