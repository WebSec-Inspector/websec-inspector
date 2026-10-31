CREATE TABLE verification_challenges (
    id uuid PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users(id),
    token varchar(255) NOT NULL UNIQUE,
    domain_id bigint UNIQUE REFERENCES domains(id),
    created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX verification_one_pending_per_user ON verification_challenges(user_id)
    WHERE domain_id IS NULL;
