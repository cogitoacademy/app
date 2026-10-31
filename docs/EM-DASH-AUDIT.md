# UI em-dash audit

Scope: user-visible TypeScript/TSX strings in apps/web/src and packages/ui. Code comments, backend code, and historical documentation are excluded.

| Context | Replacement |
| --- | --- |
| Wallet badge and dashboard available/held/total Marks loading | Marks icon plus inline Selia spinner; accessible Loading Marks label |
| Booking and class checkout missing prices | Pricing unavailable |
| Tutor pricing modality without a price | Not available |
| Missing profile, achievement, bank and tax details | Not provided |
| Missing payout amounts / invalid payout dates | Not available |
| Missing admin payout dates | Not recorded |
| Missing class modality | Not specified |
| Time picker placeholder or invalid time | Select time |
| Missing session feedback | No feedback provided |
| Missing profile-history image | Empty thumbnail with accessible No image label |
| Missing linked booking | Not linked |
| Missing commission receipt date | Not received |
| Missing knowledge-bank grant note | No note |
| Contact request status separator | Center dot |
| Greetings, notices and error messages | Full stops |
| Marketing and page metadata | Colon |

Specialization labels already use center dots from the preceding change. Referral detail filtering now uses the new missing-value label consistently. Real zero balances remain zero. No endpoint, environment, or database changes.

Validation: web typecheck, focused Marks/greetings/error-message tests, whitespace check. Browser rendering has not been verified.
