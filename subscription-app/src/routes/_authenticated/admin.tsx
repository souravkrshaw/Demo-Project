import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SiteHeader } from "@/components/SiteHeader";
import { currentAccess, accessUntil, daysLeft, fmtDate, type Sub } from "@/lib/subscription";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin dashboard — DukaanPass" }, { name: "description", content: "Manage clients, trial codes, subscriptions and payments." }] }),
  component: Admin,
});

type Client = { user_id: string; name: string; shop_name: string; email: string; phone: string; created_at: string };
type Code = { id: string; code: string; max_uses: number; used_count: number; active: boolean; created_at: string };
type Pay = { id: string; user_id: string; amount: number; utr: string; status: string; created_at: string; admin_note: string | null };
type FullSub = Sub & { user_id: string };

function Admin() {
  const { isAdmin, loading } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [subs, setSubs] = useState<FullSub[]>([]);
  const [settings, setSettings] = useState({ upi_id: "", payee_name: "", premium_price: 199 });
  const [newCode, setNewCode] = useState({ code: "", max_uses: 1 });
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const [c, k, p, s, st] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("trial_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("id,user_id,plan,status,starts_at,expires_at").order("expires_at", { ascending: false }),
      supabase.from("app_settings").select("upi_id,payee_name,premium_price").eq("id", 1).single(),
    ]);
    setClients(c.data ?? []); setCodes(k.data ?? []); setPays(p.data ?? []); setSubs(s.data ?? []);
    if (st.data) setSettings(st.data);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const byUser = useMemo(() => Object.fromEntries(clients.map((c) => [c.user_id, c])), [clients]);
  const subsFor = (uid: string) => subs.filter((s) => s.user_id === uid);

  if (loading) return <div className="min-h-screen"><SiteHeader /></div>;
  if (!isAdmin) return (
    <div className="min-h-screen"><SiteHeader />
      <p className="p-12 text-center text-muted-foreground">You don't have access to this page. <Link to="/" className="underline">Go home</Link></p>
    </div>
  );

  const review = async (id: string, approve: boolean) => {
    const note = approve ? null : (window.prompt("Reason for rejecting (shown to client):") ?? null);
    const { error } = await supabase.rpc("review_payment", { _payment_id: id, _approve: approve, ...(note ? { _note: note } : {}) });
    if (error) return void toast.error(error.message);
    toast.success(approve ? "Payment approved — 1 month activated" : "Payment rejected");
    load();
  };

  const addCode = async () => {
    const code = newCode.code.trim() || Math.random().toString(36).slice(2, 10).toUpperCase();
    const { error } = await supabase.from("trial_codes").insert({ code, max_uses: Math.max(1, newCode.max_uses) });
    if (error) return void toast.error(error.message);
    setNewCode({ code: "", max_uses: 1 }); toast.success(`Code ${code} created`); load();
  };

  const toggleCode = async (c: Code) => {
    await supabase.from("trial_codes").update({ active: !c.active }).eq("id", c.id); load();
  };
  const deleteCode = async (c: Code) => {
    if (!confirm(`Delete code ${c.code}?`)) return;
    await supabase.from("trial_codes").delete().eq("id", c.id); load();
  };

  const cancelSub = async (s: FullSub) => {
    if (!confirm("Cancel this subscription? Client access will be locked.")) return;
    await supabase.from("subscriptions").update({ status: "cancelled" }).eq("id", s.id); load();
  };
  const extendSub = async (s: FullSub) => {
    const days = Number(window.prompt("Extend by how many days?", "7"));
    if (!days || days < 1) return;
    const base = new Date(Math.max(+new Date(s.expires_at), Date.now()));
    await supabase.from("subscriptions").update({ expires_at: new Date(+base + days * 86_400_000).toISOString(), status: "active" }).eq("id", s.id);
    load();
  };

  const saveSettings = async () => {
    if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(settings.upi_id.trim())) return void toast.error("Enter a valid UPI ID, e.g. name@okhdfcbank");
    const { error } = await supabase.from("app_settings").update({ ...settings, upi_id: settings.upi_id.trim(), updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return void toast.error(error.message);
    toast.success("Payment settings saved");
  };

  const pendingCount = pays.filter((p) => p.status === "pending").length;
  const activeCount = clients.filter((c) => currentAccess(subsFor(c.user_id))).length;
  const revenue = pays.filter((p) => p.status === "approved").reduce((a, p) => a + p.amount, 0);
  const filteredClients = clients.filter((c) => [c.name, c.shop_name, c.email, c.phone].join(" ").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-semibold text-primary">Admin dashboard</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          {[["Clients", clients.length], ["Active access", activeCount], ["Pending payments", pendingCount], ["Revenue", `₹${revenue}`]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border bg-card p-5 shadow-card">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{l}</p>
              <p className="mt-1 font-display text-3xl font-semibold">{v}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="payments" className="mt-8">
          <TabsList>
            <TabsTrigger value="payments">Payments {pendingCount > 0 && <Badge className="ml-2">{pendingCount}</Badge>}</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="subs">Subscriptions</TabsTrigger>
            <TabsTrigger value="codes">Trial codes</TabsTrigger>
            <TabsTrigger value="settings">Payment settings</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="rounded-xl border bg-card p-4">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Amount</TableHead><TableHead>UTR</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {pays.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{new Date(p.created_at).toLocaleString("en-IN")}</TableCell>
                    <TableCell>{byUser[p.user_id]?.shop_name ?? "—"}<div className="text-xs text-muted-foreground">{byUser[p.user_id]?.phone}</div></TableCell>
                    <TableCell>₹{p.amount}</TableCell>
                    <TableCell className="font-mono">{p.utr}</TableCell>
                    <TableCell><Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell>
                    <TableCell className="space-x-2 text-right">
                      {p.status === "pending" && <>
                        <Button size="sm" onClick={() => review(p.id, true)}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => review(p.id, false)}>Reject</Button>
                      </>}
                    </TableCell>
                  </TableRow>
                ))}
                {pays.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No payments yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="clients" className="rounded-xl border bg-card p-4">
            <Input placeholder="Search name, shop, email, phone" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-sm" />
            <Table>
              <TableHeader><TableRow><TableHead>Shop</TableHead><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Access</TableHead><TableHead>Expires</TableHead></TableRow></TableHeader>
              <TableBody>
                {filteredClients.map((c) => {
                  const s = subsFor(c.user_id); const a = currentAccess(s); const u = accessUntil(s);
                  return (
                    <TableRow key={c.user_id}>
                      <TableCell className="font-medium">{c.shop_name}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.email}<div className="text-xs text-muted-foreground">{c.phone}</div></TableCell>
                      <TableCell>{a ? <Badge>{a.plan}</Badge> : <Badge variant="destructive">locked</Badge>}</TableCell>
                      <TableCell>{u ? `${fmtDate(u)} (${daysLeft(u)}d)` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="subs" className="rounded-xl border bg-card p-4">
            <Table>
              <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Plan</TableHead><TableHead>Start</TableHead><TableHead>Expiry</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {subs.map((s) => {
                  const expired = new Date(s.expires_at) <= new Date();
                  const status = s.status === "cancelled" ? "cancelled" : expired ? "expired" : "active";
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{byUser[s.user_id]?.shop_name ?? "—"}</TableCell>
                      <TableCell className="capitalize">{s.plan}</TableCell>
                      <TableCell>{fmtDate(s.starts_at)}</TableCell>
                      <TableCell>{fmtDate(s.expires_at)}</TableCell>
                      <TableCell><Badge variant={status === "active" ? "default" : "destructive"}>{status}</Badge></TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => extendSub(s)}>Extend</Button>
                        {s.status === "active" && <Button size="sm" variant="ghost" onClick={() => cancelSub(s)}>Cancel</Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="codes" className="rounded-xl border bg-card p-4">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div><Label>Code (leave blank to auto-generate)</Label><Input value={newCode.code} onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })} /></div>
              <div><Label>Max uses</Label><Input type="number" min={1} className="w-28" value={newCode.max_uses} onChange={(e) => setNewCode({ ...newCode, max_uses: Number(e.target.value) })} /></div>
              <Button onClick={addCode}>Create code</Button>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Used</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.code}</TableCell>
                    <TableCell>{c.used_count} / {c.max_uses}</TableCell>
                    <TableCell><Switch checked={c.active} onCheckedChange={() => toggleCode(c)} /></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => deleteCode(c)}>Delete</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="settings" className="max-w-md space-y-4 rounded-xl border bg-card p-6">
            <div><Label>Your UPI ID</Label><Input value={settings.upi_id} onChange={(e) => setSettings({ ...settings, upi_id: e.target.value })} placeholder="yourname@okhdfcbank" /></div>
            <div><Label>Payee name (shown in UPI app)</Label><Input value={settings.payee_name} onChange={(e) => setSettings({ ...settings, payee_name: e.target.value })} /></div>
            <div><Label>Premium price (₹/month)</Label><Input type="number" min={1} value={settings.premium_price} onChange={(e) => setSettings({ ...settings, premium_price: Number(e.target.value) })} /></div>
            <Button onClick={saveSettings}>Save</Button>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
