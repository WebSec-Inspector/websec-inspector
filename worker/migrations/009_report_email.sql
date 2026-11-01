ALTER TABLE reports ADD COLUMN IF NOT EXISTS email_status varchar(255) NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS email_attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS email_worker_token uuid;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS email_lease_until timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS email_next_attempt_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS email_failure_code varchar(255);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS email_recipient varchar(255);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='reports'::regclass AND conname='reports_email_status_check') THEN
        ALTER TABLE reports ADD CONSTRAINT reports_email_status_check CHECK (email_status IN ('NOT_REQUESTED','PENDING','SENDING','SENT','FAILED'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS reports_email_pending_idx ON reports(email_status,email_next_attempt_at,email_lease_until,id);
