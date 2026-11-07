"""Durable scan claims. Redis notifications are hints; PostgreSQL owns state."""
from dataclasses import dataclass
import os
import uuid

try:
    from .finding_service import write_findings
except ImportError:
    from finding_service import write_findings


class LeaseLost(RuntimeError):
    pass


@dataclass(frozen=True)
class Claim:
    scan_id: int
    token: str
    attempt: int


def acquire_scanner(conn):
    """One dedicated ZAP instance, one worker owner; released when conn closes."""
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(hashtext(current_database()),hashtext('websec-zap-worker'))")
            return cur.fetchone()[0]


def claim_next(conn, lease_seconds=60, max_attempts=3):
    with conn:
        with conn.cursor() as cur:
            cur.execute("""UPDATE scans SET status='FAILED',finished_at=now(),worker_token=NULL,
                lease_until=NULL,failure_code='ATTEMPTS_EXHAUSTED'
                WHERE deleted_at IS NULL AND attempt_count >= %s AND
                (status='QUEUED' OR (status='RUNNING' AND (lease_until IS NULL OR lease_until < now())))""", (max_attempts,))
            cur.execute("""SELECT id,attempt_count FROM scans WHERE deleted_at IS NULL
                AND attempt_count < %s AND
                ((status='QUEUED' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
                 OR (status='RUNNING' AND (lease_until IS NULL OR lease_until < now())))
                ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1""", (max_attempts,))
            row = cur.fetchone()
            if row is None:
                return None
            token = str(uuid.uuid4())
            cur.execute("""UPDATE scans SET status='RUNNING',worker_token=%s,
                attempt_count=attempt_count+1,started_at=COALESCE(started_at,now()),
                heartbeat_at=now(),lease_until=now()+(%s * interval '1 second'),
                next_attempt_at=NULL,finished_at=NULL,failure_code=NULL WHERE id=%s""", (token,lease_seconds,row[0]))
            return Claim(row[0],token,row[1]+1)


def heartbeat(conn, claim, lease_seconds=60):
    with conn:
        with conn.cursor() as cur:
            cur.execute("""UPDATE scans SET heartbeat_at=now(),lease_until=now()+(%s * interval '1 second')
                WHERE id=%s AND worker_token=%s AND status='RUNNING' AND deleted_at IS NULL
                AND lease_until > now() RETURNING id""", (lease_seconds,claim.scan_id,claim.token))
            if cur.fetchone() is None:
                raise LeaseLost('Scan attempt no longer owns its lease')


def complete(conn, claim, findings):
    with conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT id FROM scans WHERE id=%s AND worker_token=%s
                AND status='RUNNING' AND deleted_at IS NULL AND lease_until > now() FOR UPDATE""", (claim.scan_id,claim.token))
            if cur.fetchone() is None:
                raise LeaseLost('Cannot complete a stale scan attempt')
            write_findings(cur,claim.scan_id,findings)
            cur.execute("""UPDATE scans SET status='COMPLETED',finished_at=now(),
                worker_token=NULL,lease_until=NULL,failure_code=NULL WHERE id=%s""", (claim.scan_id,))
            email_status='PENDING' if os.getenv('REPORT_EMAIL_ENABLED','false').lower()=='true' else 'NOT_REQUESTED'
            cur.execute("INSERT INTO reports(scan_id,pdf_url,status,email_status) VALUES (%s,'','PENDING',%s) ON CONFLICT (scan_id) DO NOTHING",(claim.scan_id,email_status))


def fail(conn, claim, code, retryable=True, max_attempts=3):
    status = 'QUEUED' if retryable and claim.attempt < max_attempts else 'FAILED'
    with conn:
        with conn.cursor() as cur:
            cur.execute("""UPDATE scans SET status=%s,worker_token=NULL,lease_until=NULL,
                failure_code=%s,next_attempt_at=now()+(%s * interval '1 second'),
                finished_at=CASE WHEN %s='FAILED' THEN now() ELSE NULL END
                WHERE id=%s AND worker_token=%s AND status='RUNNING' AND lease_until > now()
                RETURNING id""", (status,code,30*claim.attempt,status,claim.scan_id,claim.token))
            if cur.fetchone() is None:
                raise LeaseLost('Cannot fail a stale scan attempt')
