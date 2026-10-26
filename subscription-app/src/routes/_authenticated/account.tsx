import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/SiteHeader";
import { currentAccess, accessUntil, daysLeft, fmtDate, type Sub } from "@/lib/subscription";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "My plan — DukaanPass" }, { name: "description", content: "Your subscription status and expiry." }] }),
  component: Account,
});

type Pay = { id: string; amount: number; utr: string; status: string; created_at: string; admin_note: string | null };

function Account() {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [pays, setPays] = useState<Pay[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user!.id;
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase.from("subscriptions").select("id,plan,status,starts_at,expires_at").eq("user_id", id).order("expires_at", { ascending: false }),
        supabase.from("payments").select("id,amount,utr,status,created_at,admin_note").eq("user_id", id).order("created_at", { ascending: false }),
      ]);
      setSubs(s ?? []); setPays(p ?? []);
    })();
  }, []);

  if (!subs) return <div className="min-h-screen"><SiteHeader /></div>;
  const access = currentAccess(subs);
  const until = accessUntil(subs);
  const left = daysLeft(until);
  const pending = pays.find((p) => p.status === "pending");

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
        {access ? (
          <div className="rounded-2xl bg-premium p-8 text-primary-foreground shadow-card">
            <p className="text-sm uppercase tracking-widest opacity-80">{access.plan === "trial" ? "Free Trial" : "Premium"} · Active</p>
            <h1 className="mt-2 text-4xl font-semibold">{left} day{left === 1 ? "" : "s"} remaining</h1>
            {(() => {
              const total = Math.max(1, Math.round((+new Date(access.expires_at) - +new Date(access.starts_at)) / 86_400_000));
              const used = Math.min(total, Math.max(0, total - daysLeft(new Date(access.expires_at))));
              return (
                <>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-primary-foreground/20">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(used / total) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs opacity-80">Day {Math.max(1, used)} of {total}</p>
                </>
              );
            })()}
            <dl className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-primary-foreground/10 p-4 text-sm sm:grid-cols-4">
              <div><dt className="opacity-70">Billing cycle</dt><dd className="font-semibold">{access.plan === "trial" ? "14-day trial" : "Monthly"}</dd></div>
              <div><dt className="opacity-70">Cycle started</dt><dd className="font-semibold">{fmtDate(access.starts_at)}</dd></div>
              <div><dt className="opacity-70">Cycle ends</dt><dd className="font-semibold">{fmtDate(access.expires_at)}</dd></div>
              <div><dt className="opacity-70">{access.plan === "trial" ? "After trial" : "Next payment"}</dt><dd className="font-semibold">₹199 / month</dd></div>
            </dl>
            {until && +until > +new Date(access.expires_at) && <p className="mt-3 text-xs opacity-80">Renewal already paid — access continues until {fmtDate(until)}.</p>}
            {left <= 5 && <Button asChild className="mt-6 bg-accent text-accent-foreground hover:bg-accent/90"><Link to="/subscribe" search={{ plan: "premium" }}>{access.plan === "trial" ? "Upgrade to Premium" : "Renew now"}</Link></Button>}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-destructive/40 bg-card p-8 text-center shadow-card">
            <Lock className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-3xl font-semibold">Your access is locked</h1>
            <p className="mt-2 text-muted-foreground">
              {pending ? "Your payment is being verified. Access unlocks as soon as it's approved." : subs.length ? "Your subscription has expired. Renew to continue." : "You don't have an active plan yet."}
            </p>
            {!pending && (
              <div className="mt-6 flex justify-center gap-3">
                <Button asChild><Link to="/subscribe" search={{ plan: "premium" }}>Get Premium ₹199</Link></Button>
                {!subs.some((s) => s.plan === "trial") && <Button asChild variant="outline"><Link to="/subscribe" search={{ plan: "trial" }}>Use trial code</Link></Button>}
              </div>
            )}
          </div>
        )}

        <section className="rounded-2xl border bg-card p-6 shadow-card">
          <h2 className="text-xl font-semibold">Payments</h2>
          {pays.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p> : (
            <ul className="mt-4 divide-y text-sm">
              {pays.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <span>₹{p.amount} · UTR {p.utr} · {fmtDate(p.created_at)}{p.admin_note ? ` · ${p.admin_note}` : ""}</span>
                  <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>{p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
