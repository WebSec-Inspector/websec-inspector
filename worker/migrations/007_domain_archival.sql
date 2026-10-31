-- Logical archive. Keep the unique (hostname,user_id) key and all history.
ALTER TABLE domains
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS domains_active_hostname_idx
    ON domains (is_active, hostname);
