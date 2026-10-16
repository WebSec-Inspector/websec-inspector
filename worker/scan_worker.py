"""
WebSec Inspector — Worker de varredura.

Responsável por:
  1. Consumir mensagens da fila Redis (`scan-queue`) publicadas pelo backend.
  2. Executar uma varredura OWASP ZAP (baseline) na URL do domínio associado.
  3. Classificar cada achado com um score CVSS (simplificado neste esqueleto).
  4. Persistir os resultados no PostgreSQL.
  5. Sinalizar geração de relatório / envio de e-mail (delegado a report_service).

Este é um esqueleto funcional: a integração real com a API do OWASP ZAP e o
schema do banco devem ser conferidos/ajustados pelo time de sec/infra.
"""

import os
import time
import logging
import json

import redis
import psycopg2
import requests

from report_service import generate_pdf_report, send_report_email
from finding_service import save_findings
from zap_parser import parse_zap_alerts

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("scan_worker")

QUEUE_KEY = "scan-queue"

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
    "dbname": os.getenv("DB_NAME", "websec"),
    "user": os.getenv("DB_USER", "websec"),
    "password": os.getenv("DB_PASSWORD", "websec"),
}

ZAP_API_URL = os.getenv("ZAP_API_URL", "http://zap:8090")
ZAP_STARTUP_TIMEOUT = int(os.getenv("ZAP_STARTUP_TIMEOUT", "60"))


def wait_for_zap():
    """Aguarda o ZAP API ficar disponivel antes de executar scans."""
    url = f"{ZAP_API_URL}/UI/"
    start = time.time()
    while time.time() - start < ZAP_STARTUP_TIMEOUT:
        try:
            resp = requests.get(url, timeout=5)
            if resp.status_code < 500:
                log.info("ZAP API disponivel em %s", ZAP_API_URL)
                return
        except requests.RequestException:
            pass
        log.info("Aguardando ZAP API inicializar...")
        time.sleep(3)
    raise ConnectionError(f"ZAP API nao disponivel em {ZAP_API_URL} apos {ZAP_STARTUP_TIMEOUT}s")


def get_connection():
    return psycopg2.connect(**DB_CONFIG)


def fetch_scan_target(conn, scan_id: int) -> str:
    """Busca o hostname associado ao scan para montar a URL alvo."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT d.hostname
            FROM scans s
            JOIN domains d ON d.id = s.domain_id
            WHERE s.id = %s
            """,
            (scan_id,),
        )
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Scan {scan_id} não encontrado")
        return row[0]


def update_scan_status(conn, scan_id: int, status: str, finished: bool = False):
    with conn.cursor() as cur:
        if finished:
            cur.execute(
                "UPDATE scans SET status = %s, finished_at = now() WHERE id = %s",
                (status, scan_id),
            )
        else:
            cur.execute(
                "UPDATE scans SET status = %s, started_at = COALESCE(started_at, now()) WHERE id = %s",
                (status, scan_id),
            )
    conn.commit()


def run_zap_baseline(target_url: str) -> list[dict]:
    """
    Executa o scan baseline e retorna os alertas brutos da API Core do ZAP.

    Requer uma instância ZAP acessível em ZAP_API_URL.
    """
    from zapv2 import ZAPv2

    wait_for_zap()

    zap = ZAPv2(proxies={"http": ZAP_API_URL, "https": ZAP_API_URL})

    log.info("Iniciando spider em %s", target_url)
    zap.spider.scan(target_url)
    while int(zap.spider.status()) < 100:
        time.sleep(2)

    log.info("Iniciando passive/active scan (baseline) em %s", target_url)
    zap.ascan.scan(target_url)
    while int(zap.ascan.status()) < 100:
        time.sleep(5)

    return zap.core.alerts(baseurl=target_url)


def process_scan(conn, scan_id: int):
    log.info("Processando scan %s", scan_id)
    update_scan_status(conn, scan_id, "RUNNING")

    hostname = fetch_scan_target(conn, scan_id)
    target_url = f"https://{hostname}"

    try:
        raw_alerts = run_zap_baseline(target_url)
        findings = parse_zap_alerts(raw_alerts)
        save_findings(conn, scan_id, findings)
        update_scan_status(conn, scan_id, "COMPLETED", finished=True)

        pdf_path = generate_pdf_report(scan_id, hostname, findings)
        send_report_email(scan_id, pdf_path)

        log.info("Scan %s concluído com %d achados", scan_id, len(findings))
    except Exception:
        log.exception("Falha ao processar scan %s", scan_id)
        update_scan_status(conn, scan_id, "FAILED", finished=True)


def main():
    r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    log.info("Worker iniciado. Aguardando mensagens em '%s'...", QUEUE_KEY)

    while True:
        item = r.brpop(QUEUE_KEY, timeout=5)
        if item is None:
            continue
        _, scan_id_str = item
        scan_id = int(scan_id_str)

        conn = get_connection()
        try:
            process_scan(conn, scan_id)
        finally:
            conn.close()


if __name__ == "__main__":
    main()
