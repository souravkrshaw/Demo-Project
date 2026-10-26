import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";
import { upiLink, fmtDate } from "@/lib/subscription";

export const Route = createFileRoute("/_authenticated/subscribe")({
  validateSearch: (s: Record<string, unknown>) => ({ plan: (s["plan"] === "trial" ? "trial" : "premium") as "trial" | "premium" }),
  head: () => ({ meta: [{ title: "Subscribe — DukaanPass" }, { name: "description", content: "Enter your details and activate your plan." }] }),
  component: Subscribe,
});

const details = z.object({
  name: z.string().trim().min(1, "Name required").max(100),
  shop_name: z.string().trim().min(1, "Shop name required").max(120),
  email: z.string().trim().email("Invalid email").max(255),
  phone: z.string().trim().regex(/^\+?[0-9 ]{10,15}$/, "Enter a valid phone number"),
});

function Subscribe() {
  const { plan } = Route.useSearch();
  const navigate = useNavigate();
  const [step, setStep] = useState<"details" | "action">("details");
  const [form, setForm] = useState({ name: "", shop_name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [utr, setUtr] = useState("");
  const [qr, setQr] = useState<string>("");
  const [settings, setSettings] = useState<{ upi_id: string; payee_name: string; premium_price: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: c } = await supabase.from("clients").select("*").eq("user_id", u.user!.id).maybeSingle();
      if (c) setForm({ name: c.name, shop_name: c.shop_name, email: c.email, phone: c.phone });
      else setForm((f) => ({ ...f, email: u.user?.email ?? "" }));
      const { data: s } = await supabase.from("app_settings").select("upi_id,payee_name,premium_price").eq("id", 1).single();
      setSettings(s);
    })();
  }, []);

  useEffect(() => {
    if (step === "action" && plan === "premium" && settings) {
      QRCode.toDataURL(upiLink(settings.upi_id, settings.payee_name, settings.premium_price, `Premium ${form.shop_name}`.slice(0, 50)), { width: 280, margin: 1 }).then(setQr);
    }
  }, [step, plan, settings, form.shop_name]);

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = details.safeParse(form);
    if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Check your details");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("clients").upsert({ user_id: u.user!.id, ...p.data, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setStep("action");
  };

  const redeem = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("redeem_trial_code", { _code: code });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(`Trial active until ${fmtDate(data as string)}`);
    navigate({ to: "/account" });
  };

  const submitPayment = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("submit_payment", { _utr: utr });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Payment submitted. We'll activate your plan once it's verified.");
    navigate({ to: "/account" });
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {plan === "trial" ? "Free Trial · 14 days" : `Premium · ₹${settings?.premium_price ?? 199}/month`}
        </p>
        <div className="mt-3 rounded-2xl border bg-card p-8 shadow-card">
          {step === "details" ? (
            <form onSubmit={saveDetails} className="space-y-4">
              <h1 className="text-2xl font-semibold text-primary">Your details</h1>
              {([["name", "Your name"], ["shop_name", "Shop name"], ["email", "Email"], ["phone", "Phone number"]] as const).map(([k, l]) => (
                <div key={k}>
                  <Label htmlFor={k}>{l}</Label>
                  <Input id={k} type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required />
                </div>
              ))}
              <Button className="w-full" disabled={busy}>Continue</Button>
            </form>
          ) : plan === "trial" ? (
            <div className="space-y-4">
              <h1 className="text-2xl font-semibold text-primary">Enter your trial code</h1>
              <p className="text-sm text-muted-foreground">Ask the admin for your secret code to unlock 14 days of free access.</p>
              <Input placeholder="SECRET-CODE" value={code} onChange={(e) => setCode(e.target.value)} />
              <Button className="w-full" disabled={busy || !code.trim()} onClick={redeem}>Activate trial</Button>
            </div>
          ) : (
            <div className="space-y-5 text-center">
              <h1 className="text-2xl font-semibold text-primary">Scan to pay ₹{settings?.premium_price}</h1>
              {qr ? <img src={qr} alt="UPI payment QR code" className="mx-auto rounded-xl border p-2" /> : <div className="mx-auto h-[280px] w-[280px] animate-pulse rounded-xl bg-muted" />}
              <p className="text-sm text-muted-foreground">Pay to <span className="font-semibold text-foreground">{settings?.upi_id}</span> ({settings?.payee_name}) using any UPI app.</p>
              <div className="text-left">
                <Label htmlFor="utr">UPI transaction ID (UTR)</Label>
                <Input id="utr" placeholder="12-digit reference from your UPI app" value={utr} onChange={(e) => setUtr(e.target.value)} />
              </div>
              <Button className="w-full" disabled={busy || utr.trim().length < 6} onClick={submitPayment}>I have paid — submit for verification</Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
