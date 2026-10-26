export type Sub = {
  id: string;
  plan: string;
  status: string;
  starts_at: string;
  expires_at: string;
};

/** Returns the subscription currently granting access, or null if access is locked. */
export function currentAccess(subs: Sub[], now: Date = new Date()): Sub | null {
  const live = subs
    .filter(
      (s) =>
        s.status === "active" &&
        new Date(s.starts_at) <= now &&
        new Date(s.expires_at) > now,
    )
    .sort((a, b) => +new Date(b.expires_at) - +new Date(a.expires_at));
  return live[0] ?? null;
}

/** Latest expiry across all active subscriptions (includes queued renewals). */
export function accessUntil(subs: Sub[], now: Date = new Date()): Date | null {
  const ends = subs
    .filter((s) => s.status === "active" && new Date(s.expires_at) > now)
    .map((s) => new Date(s.expires_at));
  if (!ends.length) return null;
  return new Date(Math.max(...ends.map((d) => +d)));
}

export function daysLeft(until: Date | null, now: Date = new Date()): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((+until - +now) / 86_400_000));
}

export function upiLink(upiId: string, payee: string, amount: number, note: string) {
  const p = new URLSearchParams({ pa: upiId, pn: payee, am: String(amount), cu: "INR", tn: note });
  return `upi://pay?${p.toString()}`;
}

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
