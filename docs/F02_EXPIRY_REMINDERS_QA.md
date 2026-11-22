# F02 — Smart expiry notification QA checklist

## Current supported capabilities

| Test | Expected result |
|---|---|
| Active gift card expires in 30/15/7/3/1 days | Exactly one in-app alert for the current configured threshold |
| Card expires today | Expiry-day alert |
| Card remains active after expiry | Past-due alert until dismissed or card is used |
| Card is used, balance is zero, or no valid expiry | No new expiry alert |
| Global reminders disabled | No active reminder alerts |
| Disable a particular card | That card stops producing expiry alerts |
| Customize a card's timing | Card-specific schedule overrides global schedule |
| Click Mark read | Unread indicator decreases; alert remains visible |
| Snooze 1 day | That alert is hidden until next local calendar day |
| Dismiss alert | It disappears for the current date/urgency stage |
| Card expiry or reminder stage changes | A new relevant alert may appear |
| Open card via alert | Card detail overlay opens, without revealing redemption code |
| Account A vs Account B on same browser | Distinct reminder settings and acknowledgement history |
| Local storage blocked/unavailable | Reminders still calculate with default settings; persistence is unavailable |
| Authentication notifications | Existing Supabase access-request notifications are preserved |
| Preview with demo cards | Alert examples use current dates and no real account data |

## Scope and rollout notes

- Preview: `preview/functional-wallet.html` (sample-data-only).
- Engine: `assets/expiry-reminders.js`.
- Screen/controller: `assets/wallet-expiry-ui.js` and `assets/wallet-expiry-ui.css`.
- User data (preference records and reminder action IDs only) are scoped to a
  logged-in user's UUID in browser localStorage. No redemption codes or balances
  are saved by this feature.
- Reminders are **in-app**, refreshed on wallet focus, visibility changes,
  Supabase state refresh and an active foreground interval.
- This feature does NOT send email, schedule push messages, or operate while the
  app is closed. Cross-device sync is NOT supported yet.
- A real Supabase staging run is still required to validate account switching,
  login/logout and coexistence with existing server-side notifications.
- Keep the draft PR unmerged until F07 and F02 staging gates are satisfied.
