-- Apply with psql -v ON_ERROR_STOP=1 before enabling public registration.
-- Repeatable migration for legacy USER/ADMIN and already-normalized databases.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE old_check record;
BEGIN
    -- Abort without changing data or constraints if an unexpected role exists.
    IF EXISTS (
        SELECT 1 FROM users
        WHERE role IS NULL OR role NOT IN ('USER', 'ADMIN', 'CLIENTE', 'GERENTE', 'ADMINISTRADOR')
    ) THEN
        RAISE EXCEPTION 'Unknown existing user role; role migration aborted';
    END IF;

    -- The historical Hibernate enum CHECK rejects CLIENTE/ADMINISTRADOR.
    -- Discover it by column rather than relying on a generated constraint name.
    FOR old_check IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'users'::regclass AND c.contype = 'c'
          AND a.attname = 'role' AND cardinality(c.conkey) = 1
    LOOP
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', old_check.conname);
    END LOOP;
END $$;

UPDATE users SET role = 'CLIENTE' WHERE role = 'USER';
UPDATE users SET role = 'ADMINISTRADOR' WHERE role = 'ADMIN';

ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('CLIENTE', 'GERENTE', 'ADMINISTRADOR'));

COMMIT;
