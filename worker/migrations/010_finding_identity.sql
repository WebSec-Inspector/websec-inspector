-- Never infer legacy rule identity from CWE, title or description.
ALTER TABLE findings ADD COLUMN IF NOT EXISTS zap_rule_id varchar(255);
ALTER TABLE findings ADD COLUMN IF NOT EXISTS http_method varchar(255);
