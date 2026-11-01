"""Durable owner-addressed delivery. SMTP acceptance is not an inbox receipt."""
from dataclasses import dataclass
import logging
import os
from pathlib import Path
import uuid

try:
    from .email_service import enabled, send_pdf, DeliveryError
except ImportError:
    from email_service import enabled, send_pdf, DeliveryError

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmailClaim:
    report_id: int
    scan_id: int
    version: int
    file_key: str
    recipient: str
    token: str
    attempt: int


def claim_email(conn):
    if not enabled():
        return None
    with conn:
        with conn.cursor() as cur:
            cur.execute("""UPDATE reports SET email_status='FAILED',email_failure_code='EMAIL_ATTEMPTS_EXHAUSTED',
                email_worker_token=NULL,email_lease_until=NULL WHERE email_attempt_count>=3 AND
                (email_status='PENDING' OR (email_status='SENDING' AND email_lease_until<now()))""")
            cur.execute("""SELECT r.id,r.scan_id,r.generation_version,r.pdf_url,u.email,r.email_attempt_count
                FROM reports r JOIN scans s ON s.id=r.scan_id JOIN domains d ON d.id=s.domain_id JOIN users u ON u.id=d.user_id
                WHERE r.status='READY' AND s.status='COMPLETED' AND s.deleted_at IS NULL AND r.email_attempt_count<3
                AND ((r.email_status='PENDING' AND (r.email_next_attempt_at IS NULL OR r.email_next_attempt_at<=now()))
                    OR (r.email_status='SENDING' AND r.email_lease_until<now()))
                ORDER BY r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1""")
            row = cur.fetchone()
            if row is None:
                return None
            token = str(uuid.uuid4())
            cur.execute("""UPDATE reports SET email_status='SENDING',email_worker_token=%s,
                email_lease_until=now()+interval '10 minutes',email_attempt_count=email_attempt_count+1,
                email_recipient=%s,email_failure_code=NULL,email_next_attempt_at=NULL WHERE id=%s""",(token,row[4],row[0]))
            return EmailClaim(*row[:5],token,row[5]+1)


def finish_email(conn, claim, error=None):
    retry = error is not None and error.retryable and claim.attempt < 3
    status = 'SENT' if error is None else 'PENDING' if retry else 'FAILED'
    with conn:
        with conn.cursor() as cur:
            cur.execute("""UPDATE reports SET email_status=%s,
                sent_at=CASE WHEN %s='SENT' THEN now() ELSE sent_at END,
                email_failure_code=%s,email_worker_token=NULL,email_lease_until=NULL,
                email_next_attempt_at=CASE WHEN %s THEN now()+(%s*interval '1 second') ELSE NULL END
                WHERE id=%s AND email_worker_token=%s AND email_status='SENDING' AND email_lease_until>now()
                RETURNING id""",(status,status,error.code if error else None,retry,60*claim.attempt,
                                   claim.report_id,claim.token))
            return cur.fetchone() is not None


def process_next_email(conn):
    claim = claim_email(conn)
    if claim is None:
        return False
    try:
        # Recheck the lease and visibility immediately before the external side effect.
        with conn:
            with conn.cursor() as cur:
                cur.execute("""SELECT 1 FROM reports r JOIN scans s ON s.id=r.scan_id
                    WHERE r.id=%s AND r.email_worker_token=%s AND r.email_status='SENDING'
                    AND r.email_lease_until>now() AND s.deleted_at IS NULL AND s.status='COMPLETED'
                    AND r.status='READY' AND r.pdf_url=%s""",(claim.report_id,claim.token,claim.file_key))
                if cur.fetchone() is None:
                    raise DeliveryError('REPORT_UNAVAILABLE')
        root = Path(os.getenv('REPORTS_DIR','/data/reports')).resolve()
        key = claim.file_key
        if not key or '/' in key or '\\' in key or Path(key).name != key or not key.endswith('.pdf'):
            raise DeliveryError('ATTACHMENT_INVALID')
        file = root/key
        if file.is_symlink() or file.resolve().parent != root:
            raise DeliveryError('ATTACHMENT_INVALID')
        send_pdf(claim.report_id,claim.scan_id,claim.version,file,claim.recipient)
    except DeliveryError as error:
        finish_email(conn,claim,error)
        log.warning('Report %s email attempt %s: %s',claim.report_id,claim.attempt,error.code)
    except Exception:
        conn.rollback()
        finish_email(conn,claim,DeliveryError('EMAIL_INTERNAL_ERROR',retryable=True))
        log.warning('Report %s email attempt %s failed',claim.report_id,claim.attempt)
    else:
        finish_email(conn,claim)
    return True
