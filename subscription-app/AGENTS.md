<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Subscription access is derived from `subscriptions.expires_at` at read time (src/lib/subscription.ts), not a cron-updated status — keeps lock state always correct.
- Trial redemption, payment submission and payment approval go through SECURITY DEFINER SQL functions so clients cannot set prices, dates or statuses themselves.
