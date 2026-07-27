-- Composite index for ledger entries paginated by wallet + created_at
CREATE INDEX IF NOT EXISTS ledger_walletId_createdAt_idx ON ledger_entry (wallet_id, created_at);

-- Composite index for payment records filtered by user + status
CREATE INDEX IF NOT EXISTS payment_userId_status_idx ON payment_record (user_id, status);