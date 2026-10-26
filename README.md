# Smart QR Print — server with WhatsApp confirm/decline

Flow: customer picks "Pay cash" → server creates a token → WhatsApp message with **Confirm / Decline** buttons goes to the owner → owner taps a button → webhook updates the order → `agent.js` on the counter PC prints it.

## 1. Run it
```
npm install
cp .env.example .env     # fill in values
npm start                # serves the app + API on :3000
npm run agent            # on the PC with the printer (macOS/Linux, CUPS)
```
Open the site, unlock the owner workspace; it asks once for OWNER_KEY. Pricing, UPI ID and your UPI QR image are saved on the server, so customers on their phones see them.

## 2. WhatsApp Cloud API (one-time, in Meta's dashboard)
1. developers.facebook.com → Create App → add the **WhatsApp** product.
2. WhatsApp → API Setup: copy **Phone number ID** → `WA_PHONE_ID`, and a **token** → `WA_TOKEN` (the test token expires in 24h; for production create a System User permanent token).
3. Add the owner's number as a recipient and verify it. Set the same number in `OWNER_WA`.
4. App Settings → Basic: copy **App Secret** → `WA_APP_SECRET`.
5. WhatsApp → Configuration → Webhook: Callback URL `https://YOUR-DOMAIN/webhook`, Verify token = `WA_VERIFY_TOKEN`, then subscribe to **messages**.
   The URL must be public HTTPS (deploy to Render/Railway/VPS, or use `ngrok http 3000` while testing).
6. **24-hour rule:** free-form button messages only reach the owner if the owner messaged the business number in the last 24h. For always-on alerts, create a template (Category: Utility) with body
   `New cash order. Token #{{1}} — {{2}} — collect ₹{{3}}`
   and two **Quick reply** buttons (`Confirm`, `Decline`). Once approved, set `WA_TEMPLATE=<template name>`.

The owner can also just type `CONFIRM 1234` or `DECLINE 1234`. Only messages from `OWNER_WA` are accepted, and every webhook call is signature-checked.

## Notes
- Storage is `orders.json` / `settings.json` (fine for one counter). Swap `load/save` for Supabase if you want multi-counter.
- `agent.js` uses `lp` (PDF and images). DOCX needs conversion first (e.g. LibreOffice headless). On Windows, replace the `lp` call with the `pdf-to-printer` package.
- UPI payments are still self-reported ("I've paid"). Auto-verification needs a payment gateway (Razorpay etc.).

## Demo mode: lock after 2 weeks, then hand over the full version
**Best setup — you host the demo.** Deploy this server on your own hosting with `DEMO_DAYS=14` and a `DEV_KEY`. The client only gets a URL. After 14 days every API call returns "locked" and the app shows a lock screen. Open `https://YOUR-DEMO-URL/dev.html`, enter `DEV_KEY` and you can **Lock now / Unlock / +7 or +14 days / Activate full** at any time.

**If the client likes it:** deploy a fresh copy for them with **no `DEMO_DAYS`** (fully unrestricted) and their own `.env` (their WhatsApp, UPI, keys). To keep their demo data, copy `orders.json`, `settings.json` and `uploads/` across. Then delete your demo deployment.

**If the client must host the demo themselves:** set `LICENSE_URL` to a JSON file you control, e.g. `{"active":true,"mode":"demo","expires":"2026-11-07"}`. The server re-checks it hourly. Set `"active":false` to lock, or `"mode":"full"` to unlock permanently. If the server can't reach it for 72 hours it locks itself.

**Limits:** anyone with the source code on their own machine can edit it. Client-hosted demos only deter casual use; for real control, host the demo yourself, or give the client a build with the license check compiled/obfuscated and keep the source until they pay.

## Customer & order workflow
- Customer scans the shop QR (print it from **Pricing & payments** or **QR counter poster**), sees prices, uploads PDFs / DOCX / many photos.
- Photos: pick 1, 2, 4, 6 or 9 per page, reorder slots, zoom each photo, switch Colour / B&W, and see the page preview. The composed pages are what get printed.
- Every order (cash or UPI) arrives in the dashboard as **Pending review** with its order ID (refreshes every 3 s). **Approve & print** sends it to the printer agent; **Reject** or the 🗑 / "Clear completed & rejected" buttons remove fake or unwanted orders.

## Printer detection
`agent.js` (run it on the PC the printer is plugged into) checks the connected printers every 5 s and reports them to the server. The dashboard sidebar shows **Printer connected / No printer connected**. While no printer is online: the shop QR **cannot be generated or printed**, and customers can't place orders (the server refuses them and the page shows "Shop printer is offline"). Pick your B&W and colour printers and send a **Test print** from **Pricing & payments → Printers**.
- Windows: run `npm install` (installs `pdf-to-printer`); virtual printers (PDF/XPS/OneNote/Fax) are ignored. macOS/Linux: uses CUPS (`lpstat`, `lp`). Detection reflects what the operating system reports; a printer that is switched off but still shows as ready in the OS can't be told apart.
- Photo orders are converted to one PDF in the customer's browser, so every job is a PDF. DOCX still needs converting first.

## Licensing (14-day trial, then a license key)
- First start = 14-day trial (`DEMO_DAYS`). A badge shows days left; after that the whole app locks and shows a **Paste license key** box.
- You (developer) make unique keys with `developer-tools/keygen.js` (separate zip - never give it to clients). Keys are signed, so a client can't invent one; each key has its own ID and licensee name, and can be lifetime or time-limited.
- The client pastes the key on the lock screen (or the trial badge) and enters their OWNER_KEY once. No internet check is needed.
- To switch a key off: put its id in your `LICENSE_URL` JSON, `{"active":true,"revoked":["<id>"]}`. `/dev.html` (DEV_KEY) can still lock/unlock/extend any install.
- Limit: deleting `license.json` restarts the trial on a copy the client hosts. Host trials yourself, or ship trial copies with `LICENSE_URL` set.

## DukaanPass subscription link (optional)
Set `SUB_SUPABASE_URL`, `SUB_SUPABASE_KEY`, `SUB_EMAIL`, `SUB_PASSWORD` in `.env` (the last two are the shop owner's DukaanPass login). The server then checks the owner's plan in DukaanPass every 10 minutes: active **trial** or **premium** = unlocked, expired = the same lock screen appears, renewing/approval in DukaanPass unlocks it within 10 minutes (the Subscription page also refreshes it instantly). If it cannot reach DukaanPass for 72 hours it locks. A developer-issued license key and `/dev.html` lock still work on top. No UI or dashboard files were changed.

## Subscription page (built in)
Open **`/subscription.html`** (sidebar → **★ Subscription**). It is part of this same website and uses the same DukaanPass database: plans, sign in / sign up, shop details, trial code, UPI QR + transaction ID, "My plan" (days left), and — for the admin account — payment approval, clients, subscriptions, trial codes and payment settings. Nothing else in the dashboard changed. The original DukaanPass source is kept untouched in `./subscription-app/` (its SQL migrations define the database). "Continue with Google" is not included on this page (it needs the original site's domain).

**Run:** `npm install` then `npm start` → open http://localhost:3000 (the dashboard). Subscription is in the sidebar (★ Subscription), also at `/subscription`, and the lock screen shows an "Open Subscription page" button when a plan has expired.
