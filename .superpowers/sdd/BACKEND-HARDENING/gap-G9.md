### G9: Admin Wallet/Ledger View

**PRD:** FR-10 (Admin Override)

**Current state:** No admin endpoint for viewing user wallets and ledger entries.

**Required:**

1. `POST /rpc/admin.getWallet` — admin views any user's wallet
2. `POST /rpc/admin.listLedgerEntries` — admin views ledger entries for any wallet
   - Paginated with cursor
   - Filterable by: entry type, date range, booking ID

**Acceptance tests:**

- Admin views student wallet → sees balance, held, available
- Admin views ledger entries → paginated, filterable
- Non-admin attempts → 403

---

### G10: Before/After Override Preview
