"""Recoverable scan worker. PostgreSQL owns work; Redis only wakes pollers."""
import logging
import os
import time
from urllib.error import URLError

import psycopg2
import redis

from report_service import generate_pdf_report, send_report_email
from zap_parser import parse_zap_alerts, ZapParsingError
from zap_runner import run_scan
from scan_jobs import acquire_scanner, claim_next, complete, fail, heartbeat, LeaseLost

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("scan_worker")
QUEUE_KEY = "scan-queue"
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
    "dbname": os.getenv("DB_NAME", "websec"),
    "user": os.getenv("DB_USER", "websec"),
    "password": os.getenv("DB_PASSWORD", "websec"),
    "connect_timeout": 10,
    "keepalives": 1, "keepalives_idle": 15, "keepalives_interval": 5, "keepalives_count": 3,
    "options": "-c statement_timeout=10000 -c lock_timeout=5000",
}


def get_connection():
    return psycopg2.connect(**DB_CONFIG)


def fetch_scan_target(conn, scan_id):
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT d.hostname FROM scans s JOIN domains d ON d.id=s.domain_id WHERE s.id=%s AND s.deleted_at IS NULL",(scan_id,))
            row = cur.fetchone()
            if row is None:
                raise ValueError(f"Scan {scan_id} nao encontrado")
            return row[0]


def process_scan(conn, claim):
    log.info("Processing scan %s attempt %s",claim.scan_id,claim.attempt)
    try:
        hostname = fetch_scan_target(conn,claim.scan_id)
        # Original URL preservation is tracked separately in #28.
        target = 'http://juice-shop:3000' if hostname == 'juice-shop' else f'https://{hostname}'
        alerts = run_scan(target,lambda: heartbeat(conn,claim))
        findings = parse_zap_alerts(alerts)
        complete(conn,claim,findings)
    except LeaseLost:
        log.warning("Discarded stale attempt for scan %s",claim.scan_id)
        return
    except Exception as exc:
        # Avoid PostgreSQL diagnostics / findings / authentication data in logs.
        log.error("Scan %s failed: %s",claim.scan_id,type(exc).__name__)
        conn.rollback()
        retryable = isinstance(exc,(TimeoutError,ConnectionError,URLError,psycopg2.OperationalError))
        try:
            fail(conn,claim,'SCAN_TIMEOUT' if isinstance(exc,TimeoutError) else 'SCAN_ERROR',retryable=retryable)
        except LeaseLost:
            log.warning("Failure ignored for stale attempt %s",claim.scan_id)
        return
    # A completed scan is independent of PDF / SMTP. Full persisted report states
    # and independent delivery retry are the following plan tasks (#29/#31).
    try:
        pdf = generate_pdf_report(claim.scan_id,hostname,findings)
        send_report_email(claim.scan_id,pdf)
    except Exception as exc:
        log.error("Scan %s completed; report/delivery failed: %s",claim.scan_id,type(exc).__name__)


def main():
    from schema_migrations import migrate
    conn = get_connection()
    try:
        migrate(conn,check_only=True)
    finally:
        conn.close()
    notifier = redis.Redis(host=os.getenv('REDIS_HOST','localhost'),port=int(os.getenv('REDIS_PORT','6379')),
                           socket_connect_timeout=3,socket_timeout=7)
    while True:
        conn = None
        try:
            conn = get_connection()
            if acquire_scanner(conn):
                claim = claim_next(conn)
                if claim is not None:
                    process_scan(conn,claim)
                    continue
        except Exception as exc:
            log.error('Worker iteration failed: %s',type(exc).__name__)
        finally:
            if conn is not None: conn.close()
        try:
            # Payloads are untrusted wakeup hints, never commands or ownership.
            notifier.brpop(QUEUE_KEY,timeout=5)
        except redis.RedisError:
            time.sleep(5)


if __name__ == '__main__':
    main()
