# Tutor Payout Report

Status: Complete

## Scope

Add an operational tutor payout report that combines historical transfers with each tutor's current unpaid honorarium. The admin workspace can filter the report by transfer date, focus on tutors who still need payment, sort the results, open payout details, mark a complete payout as paid, and download the visible result as a CSV compatible with Excel and Google Sheets.

## Delivered behavior

- Report columns include tutor name, bank, account number, account holder, gross honorarium, deduction/transfer fee, transferred amount, transfer status, and transfer date.
- The report date range applies to paid transfer history. Current unpaid balances remain visible so a shorter historical window cannot hide an amount that still needs operational follow-up.
- The admin page defaults to the pending/needs-payment view and provides 7-, 30-, and 90-day shortcuts, status filtering, sorting, and CSV export.
- The custom range controls use the shared Selia date picker rather than browser-native date inputs, with the selected start and end dates constraining each other.
- Paid payout rows snapshot the account number and account holder used at transfer time. Legacy rows fall back to the current tutor profile when those snapshot fields are absent.
- Payouts with incomplete bank details remain visible but cannot be marked as paid until the account information is complete.

## Data and API changes

- Added nullable tutor payout profile fields for bank account number and account holder name.
- Added `POST /rpc/admin/payouts/tutor/report` with optional `dateFrom` and `dateTo` ISO date filters.
- Extended paid payout records with account snapshots when they are marked paid.
- Added the booking payout repository queries and service aggregation needed to produce paid and pending report rows.

## Verification

- `bunx turbo run check-types --filter=web --filter=@cogito-app/api --filter=@cogito-app/db`
- Targeted API unit tests for booking service/repository and admin service/handler: 378 passing, 0 failing.
