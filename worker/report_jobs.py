"""Fenced PDF jobs. No ZAP calls or SMTP side effects in this queue."""
from dataclasses import dataclass
import logging
from pathlib import Path
import uuid

try:
    from .report_service import generate_pdf_report
except ImportError:
    from report_service import generate_pdf_report

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReportClaim:
    id: int
    scan_id: int
    token: str


def claim_report(conn):
    with conn:
        with conn.cursor() as cur:
            cur.execute("""UPDATE reports SET status='FAILED',worker_token=NULL,lease_until=NULL,
                failure_code='PDF_ATTEMPTS_EXHAUSTED' WHERE attempt_count>=3 AND
                (status='PENDING' OR (status='GENERATING' AND lease_until < now()))""")
            cur.execute("""SELECT r.id,r.scan_id FROM reports r JOIN scans s ON s.id=r.scan_id
                WHERE s.status='COMPLETED' AND s.deleted_at IS NULL AND r.attempt_count<3
                AND (r.status='PENDING' OR (r.status='GENERATING' AND r.lease_until < now()))
                ORDER BY r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1""")
            row=cur.fetchone()
            if row is None:return None
            token=str(uuid.uuid4())
            cur.execute("""UPDATE reports SET status='GENERATING',worker_token=%s,
                lease_until=now()+interval '20 minutes',attempt_count=attempt_count+1,
                failure_code=NULL WHERE id=%s""",(token,row[0]))
            return ReportClaim(row[0],row[1],token)


def finish_report(conn,claim,key=None):
    with conn:
        with conn.cursor() as cur:
            cur.execute("""UPDATE reports r SET status=%s,pdf_url=COALESCE(%s,pdf_url),
                generated_at=CASE WHEN %s IS NOT NULL THEN now() ELSE generated_at END,
                failure_code=%s,worker_token=NULL,lease_until=NULL
                WHERE r.id=%s AND r.worker_token=%s AND r.status='GENERATING' AND r.lease_until>now()
                AND EXISTS (SELECT 1 FROM scans s WHERE s.id=r.scan_id AND s.status='COMPLETED' AND s.deleted_at IS NULL)
                RETURNING r.id""",('READY' if key else 'FAILED',key,key,
                     None if key else 'PDF_GENERATION_FAILED',claim.id,claim.token))
            return cur.fetchone() is not None


def process_next_report(conn):
    claim=claim_report(conn)
    if claim is None:return False
    path=None
    try:
        from psycopg2.extras import RealDictCursor
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""SELECT d.hostname,s.status,s.started_at,s.finished_at
                    FROM scans s JOIN domains d ON d.id=s.domain_id WHERE s.id=%s""",(claim.scan_id,))
                metadata=dict(cur.fetchone())
                # This matches the scanner's current target construction. Original URL
                # support remains tracked in #28; never pretend that URL was preserved.
                hostname=metadata['hostname']
                metadata['target']='http://juice-shop:3000' if hostname=='juice-shop' else 'https://'+hostname
                cur.execute('SELECT * FROM findings WHERE scan_id=%s ORDER BY id',(claim.scan_id,))
                findings=[dict(row) for row in cur.fetchall()]
        key=f'scan-{claim.scan_id}-{claim.token}.pdf'
        path=generate_pdf_report(claim.scan_id,hostname,findings,metadata=metadata,file_key=key)
        if not finish_report(conn,claim,key):
            Path(path).unlink(missing_ok=True)
    except Exception as exc:
        conn.rollback()
        if path:Path(path).unlink(missing_ok=True)
        finish_report(conn,claim)
        log.warning('PDF generation failed for scan %s: %s',claim.scan_id,type(exc).__name__)
    return True
