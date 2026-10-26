import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";

const safePath = (p?: string) => {
  if (!p) return "/account";
  try {
    const u = new URL(p, window.location.origin);
    return u.origin === window.location.origin ? u.pathname + u.search : "/account";
  } catch { return "/account"; }
};

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: typeof s["redirect"] === "string" ? (s["redirect"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: "Sign in — DukaanPass" },
      { name: "description", content: "Sign in or create an account to manage your subscription." },
      { property: "og:title", content: "Sign in — DukaanPass" },
      { property: "og:description", content: "Sign in to manage your subscription." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({ email: z.string().trim().email().max(255), password: z.string().min(6).max(72) });

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return void toast.error("Enter a valid email and a password of 6+ characters");
    setBusy(true);
    const target = safePath(redirect);
    if (mode === "up") {
      const { error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: window.location.origin + target } });
      setBusy(false);
      if (error) return void toast.error(error.message);
      toast.success("Check your email to confirm your account, then sign in.");
      setMode("in");
    } else {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      setBusy(false);
      if (error) return void toast.error(error.message);
      navigate({ to: target });
    }
  };

  const google = async () => {
    sessionStorage.setItem("post_auth", safePath(redirect));
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) return void toast.error("Google sign-in failed");
    if (r.redirected) return;
    navigate({ to: safePath(redirect) });
  };

  // returning from Google redirect
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const p = sessionStorage.getItem("post_auth");
      if (data.session && p) { sessionStorage.removeItem("post_auth"); navigate({ to: p }); }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-2xl border bg-card p-8 shadow-card">
          <h1 className="text-3xl font-semibold text-primary">{mode === "in" ? "Welcome back" : "Create account"}</h1>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <Button className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Sign up"}</Button>
          </form>
          <Button variant="outline" className="mt-3 w-full" onClick={google}>Continue with Google</Button>
          <button className="mt-6 w-full text-sm text-muted-foreground underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </div>
      </main>
    </div>
  );
}
