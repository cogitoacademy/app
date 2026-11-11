# Referral campaign before / after

Captured 11 November 2026 with the real `KolCampaignsSection` and Selia components on the same isolated local fixture (`http://localhost:5186/__campaign-evidence.html`).

- Before: component source from `8e743020` (before partner metadata).
- After: component source from `4e51d81e` (campaign type, partner, bank/account/holder and notes).
- Desktop form: 1440 x 1200; desktop list: 1440 x 480; mobile form: 390 x 1900. Mobile uses a tall capture viewport to include the entire form.
- Shared frame, styles, and campaign data; no application sidebar in this focused component fixture. The before component reuses the current field parser, without submitting the form; this comparison establishes rendered structure, not historical backend behavior.
- Dummy fixture: Rafsi Albar - November 2026, RAFSI2026, BCA (example), 0012345678, Rafsi Albar (example). Names/account values are examples. The exact same saved campaign is supplied to both versions; the before UI cannot display its partner/bank fields.
- Campaign list RPC is stubbed in browser fetch; no auth session, live API, DB write, invite, email, account signup or bank transfer was performed for these screenshots. Temporary fixture source was removed after capture.
- The saved table has horizontal scrolling. Mobile responsiveness and recipient display are separately covered by the synthetic browser suite; PostgreSQL round-trip evidence is separate below.

| Area                   | Before                                     | After                                    |
| ---------------------- | ------------------------------------------ | ---------------------------------------- |
| Form desktop           | [Before](before-campaign-form-desktop.png) | [After](after-campaign-form-desktop.png) |
| Form mobile            | [Before](before-campaign-form-mobile.png)  | [After](after-campaign-form-mobile.png)  |
| Saved campaign desktop | [Before](before-campaign-list-desktop.png) | [After](after-campaign-list-desktop.png) |

Validation already completed on this branch: 61 focused unit/RPC/policy tests, 23 PostgreSQL integration tests on verified `127.0.0.1:6769/cogito-test`, 16 synthetic Edge workflows and web typecheck pass. Migration `0093_referral_campaign_partner.sql` was generated and applied only on that local test target. Real payment-provider callbacks, bank transfers and production schema acceptance remain unverified.
