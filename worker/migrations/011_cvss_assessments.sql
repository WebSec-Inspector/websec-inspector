CREATE TABLE IF NOT EXISTS finding_cvss_assessments (
    id bigserial PRIMARY KEY,
    finding_id bigint NOT NULL UNIQUE REFERENCES findings(id) ON DELETE CASCADE,
    version varchar(255) NOT NULL,
    vector varchar(255) NOT NULL,
    base_score double precision NOT NULL CHECK (base_score >= 0 AND base_score <= 10),
    severity varchar(255) NOT NULL CHECK (severity IN ('NONE','LOW','MEDIUM','HIGH','CRITICAL')),
    justification text NOT NULL,
    assessed_by bigint NOT NULL REFERENCES users(id),
    assessed_at timestamptz NOT NULL DEFAULT now(),
    revision bigint NOT NULL CHECK (revision > 0)
);
CREATE TABLE IF NOT EXISTS finding_cvss_history (
    id bigserial PRIMARY KEY,
    finding_id bigint NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
    version varchar(255) NOT NULL,
    vector varchar(255) NOT NULL,
    base_score double precision NOT NULL CHECK (base_score >= 0 AND base_score <= 10),
    severity varchar(255) NOT NULL CHECK (severity IN ('NONE','LOW','MEDIUM','HIGH','CRITICAL')),
    justification text NOT NULL,
    assessed_by bigint NOT NULL REFERENCES users(id),
    assessed_at timestamptz NOT NULL DEFAULT now(),
    revision bigint NOT NULL CHECK (revision > 0),
    UNIQUE(finding_id,revision)
);
