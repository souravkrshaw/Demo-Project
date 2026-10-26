import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Plans — 14-day Free Trial or Premium ₹199/month" },
      { name: "description", content: "Start a 14-day free trial with an invite code or go Premium for ₹199/month, paid instantly by UPI." },
      { property: "og:title", content: "Plans — Free Trial or Premium ₹199/month" },
      { property: "og:description", content: "14-day free trial with an invite code, or Premium at ₹199/month via UPI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pricing,
});

function Pricing() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent-foreground/70">Pricing</p>
          <h1 className="mt-3 text-4xl font-semibold text-primary md:text-5xl">Pick the plan that fits your shop</h1>
          <p className="mt-4 text-muted-foreground">Try it free for two weeks, or go Premium and pay instantly with any UPI app.</p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl border bg-card p-8 shadow-card">
            <h2 className="text-2xl font-semibold">Free Trial</h2>
            <p className="mt-1 text-sm text-muted-foreground">Invite-only access</p>
            <p className="mt-6 font-display text-5xl font-semibold">₹0<span className="ml-1 text-base font-sans font-normal text-muted-foreground">/ 14 days</span></p>
            <ul className="mt-6 space-y-3 text-sm">
              {["Full access for 14 days", "Activated with a secret code", "No payment needed"].map((f) => (
                <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-success" />{f}</li>
              ))}
            </ul>
            <Button asChild variant="outline" size="lg" className="mt-8">
              <Link to="/subscribe" search={{ plan: "trial" }}>Start free trial</Link>
            </Button>
          </div>

          <div className="relative flex flex-col rounded-2xl bg-premium p-8 text-primary-foreground shadow-card">
            <span className="absolute right-6 top-6 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">Popular</span>
            <h2 className="text-2xl font-semibold">Premium Plan</h2>
            <p className="mt-1 text-sm opacity-80">Everything, every month</p>
            <p className="mt-6 font-display text-5xl font-semibold">₹199<span className="ml-1 text-base font-sans font-normal opacity-80">/ month</span></p>
            <ul className="mt-6 space-y-3 text-sm">
              {["Full access, renewed monthly", "Pay by UPI QR in seconds", "Reminder before it expires"].map((f) => (
                <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-accent" />{f}</li>
              ))}
            </ul>
            <Button asChild size="lg" className="mt-8 bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/subscribe" search={{ plan: "premium" }}>Get Premium</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
