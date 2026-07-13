CREATE INDEX IF NOT EXISTS booking_participant_userId_state_idx ON booking_participant (user_id, confirmation_state);
CREATE INDEX IF NOT EXISTS ledger_createdAt_idx ON ledger_entry (created_at);