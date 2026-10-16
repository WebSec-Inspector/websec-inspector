"""Persistence operations for normalized scan findings."""


def save_findings(conn, scan_id: int, findings: list[dict]) -> list[dict]:
    """Atomically replace the findings for a scan and return the saved data."""
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM scans WHERE id = %s", (scan_id,))
            if cur.fetchone() is None:
                raise ValueError(f"Scan {scan_id} does not exist")

            cur.execute("DELETE FROM findings WHERE scan_id = %s", (scan_id,))
            for finding in findings:
                cur.execute(
                    """
                    INSERT INTO findings (
                        scan_id, owasp_category, description, cvss_score, severity,
                        recommendation, title, confidence, affected_url,
                        affected_parameter, evidence, cwe_id, wasc_id,
                        technical_reference, execution_timestamp
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        scan_id,
                        finding["owasp_category"],
                        finding["description"],
                        finding["cvss_score"],
                        finding["severity"],
                        finding["recommendation"],
                        finding["title"],
                        finding["confidence"],
                        finding["affected_url"],
                        finding["affected_parameter"],
                        finding["evidence"],
                        finding["cwe_id"],
                        finding["wasc_id"],
                        finding["technical_reference"],
                        finding["execution_timestamp"],
                    ),
                )
    return findings