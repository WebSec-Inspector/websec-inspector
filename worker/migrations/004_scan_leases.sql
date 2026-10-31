ALTER TABLE scans
    ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    ADD COLUMN IF NOT EXISTS worker_token uuid,
    ADD COLUMN IF NOT EXISTS lease_until timestamptz,
    ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
    ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
    ADD COLUMN IF NOT EXISTS failure_code varchar(64);
CREATE INDEX IF NOT EXISTS scans_pending_work ON scans(status,next_attempt_at,lease_until)
    WHERE deleted_at IS NULL AND status IN ('QUEUED','RUNNING');
