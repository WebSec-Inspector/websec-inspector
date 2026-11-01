ALTER TABLE reports ADD COLUMN IF NOT EXISTS status varchar(255) NOT NULL DEFAULT 'PENDING';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS generation_version integer NOT NULL DEFAULT 1;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS worker_token uuid;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS failure_code varchar(255);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='reports'::regclass AND conname='reports_status_check') THEN
        ALTER TABLE reports ADD CONSTRAINT reports_status_check CHECK (status IN ('PENDING','GENERATING','READY','FAILED'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS reports_pending_idx ON reports(status,lease_until,id);
