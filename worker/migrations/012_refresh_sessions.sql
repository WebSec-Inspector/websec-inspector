-- Opaque refresh secrets never persist: keep consumed hashes until the family expires.
CREATE TABLE IF NOT EXISTS refresh_families (
    id uuid PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS refresh_families_expiry_idx ON refresh_families(expires_at);
CREATE INDEX IF NOT EXISTS refresh_families_user_idx ON refresh_families(user_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id uuid PRIMARY KEY,
    family_id uuid NOT NULL REFERENCES refresh_families(id) ON DELETE CASCADE,
    token_hash varchar(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens(family_id);
