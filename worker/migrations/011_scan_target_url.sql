-- Preserva a URL solicitada; o worker não deve reconstruir o alvo a partir do hostname.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS target_url varchar(2048);
ALTER TABLE scans ADD COLUMN IF NOT EXISTS submitted_url varchar(2048);
-- Scans legados nunca guardaram a URL: preenche com o alvo que o worker inferia.
-- submitted_url fica NULL para eles, pois o texto original nunca foi registrado.
UPDATE scans s SET target_url = CASE WHEN d.hostname = 'juice-shop'
        THEN 'http://juice-shop:3000' ELSE 'https://' || d.hostname END
    FROM domains d WHERE d.id = s.domain_id AND s.target_url IS NULL;
ALTER TABLE scans ALTER COLUMN target_url SET NOT NULL;
