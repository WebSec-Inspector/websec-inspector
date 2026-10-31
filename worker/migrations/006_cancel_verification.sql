DO $$
DECLARE old_check record;
BEGIN
    FOR old_check IN
        SELECT c.conname FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
        WHERE c.conrelid='scans'::regclass AND c.contype='c'
          AND a.attname='status' AND cardinality(c.conkey)=1
    LOOP
        EXECUTE format('ALTER TABLE scans DROP CONSTRAINT %I',old_check.conname);
    END LOOP;
END $$;
ALTER TABLE scans ADD CONSTRAINT scans_status_check
    CHECK(status IN ('PENDING_VERIFICATION','QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'));
