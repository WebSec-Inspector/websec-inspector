-- Apply before starting the new backend and worker on an existing database.
-- Repeatable: existing findings and their IDs are preserved.

ALTER TABLE findings
    ADD COLUMN IF NOT EXISTS title text,
    ADD COLUMN IF NOT EXISTS confidence varchar(255),
    ADD COLUMN IF NOT EXISTS affected_url text,
    ADD COLUMN IF NOT EXISTS affected_parameter text,
    ADD COLUMN IF NOT EXISTS evidence text,
    ADD COLUMN IF NOT EXISTS cwe_id varchar(255),
    ADD COLUMN IF NOT EXISTS wasc_id varchar(255),
    ADD COLUMN IF NOT EXISTS technical_reference text,
    ADD COLUMN IF NOT EXISTS execution_timestamp timestamptz;

ALTER TABLE findings
    ALTER COLUMN title TYPE text,
    ALTER COLUMN description TYPE text,
    ALTER COLUMN recommendation TYPE text,
    ALTER COLUMN affected_url TYPE text,
    ALTER COLUMN affected_parameter TYPE text,
    ALTER COLUMN evidence TYPE text,
    ALTER COLUMN technical_reference TYPE text;

-- Hibernate's old enum check may reject INFORMATIONAL even with ddl-auto=update.
DO $$
DECLARE old_check record;
BEGIN
    FOR old_check IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'findings'::regclass AND c.contype = 'c'
          AND a.attname = 'severity' AND cardinality(c.conkey) = 1
    LOOP
        EXECUTE format('ALTER TABLE findings DROP CONSTRAINT %I', old_check.conname);
    END LOOP;
END $$;

ALTER TABLE findings ADD CONSTRAINT findings_severity_check
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFORMATIONAL'));

