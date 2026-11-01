"""Converts the JSON alert objects returned by zap.core.alerts() to findings."""

from datetime import datetime, timezone
from typing import Any
import re


class ZapParsingError(ValueError):
    """Raised when the ZAP response does not match the expected alert format."""


RISK_LEVELS = {
    "high": ("HIGH", 8.5),
    "medium": ("MEDIUM", 5.5),
    "low": ("LOW", 3.0),
    "informational": ("INFORMATIONAL", 0.0),
}


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _identifier(value: Any) -> str | None:
    text = _optional_text(value)
    if text is None or text in {"-1", "0"}:
        return None
    return text


def _rule_id(alert) -> str | None:
    plugin = _optional_text(alert.get('pluginId'))
    reference = _optional_text(alert.get('alertRef'))
    if plugin is not None and not re.fullmatch(r'[0-9]{1,10}', plugin):
        return None
    if reference is not None:
        if not re.fullmatch(r'[0-9]{1,10}(?:-[0-9]{1,10})?', reference):
            return None
        parts = [str(int(part)) for part in reference.split('-')]
        if plugin is not None and parts[0] != str(int(plugin)):
            return None
        return '-'.join(parts)
    return str(int(plugin)) if plugin is not None else None


def _method(value) -> str | None:
    text = _optional_text(value)
    return text.upper() if text and re.fullmatch(r'[A-Za-z]{1,32}',text) else None


def _timestamp(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, (int, float)):
            seconds = value / 1000 if value > 100_000_000_000 else value
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except (OverflowError, OSError, TypeError, ValueError):
        return None


def parse_zap_alerts(alerts: Any) -> list[dict[str, Any]]:
    """Validate and normalize the list returned by ZAP's core.alerts API."""
    if not isinstance(alerts, list):
        raise ZapParsingError("ZAP response must be a JSON array of alerts")

    findings = []
    for index, alert in enumerate(alerts):
        if not isinstance(alert, dict):
            raise ZapParsingError(f"ZAP alert at index {index} must be an object")

        title = _optional_text(alert.get("alert") or alert.get("name"))
        risk = _optional_text(alert.get("risk"))
        if title is None:
            raise ZapParsingError(f"ZAP alert at index {index} is missing its alert name")
        if risk is None or risk.lower() not in RISK_LEVELS:
            raise ZapParsingError(f"ZAP alert at index {index} has a missing or unsupported risk")

        severity, cvss_score = RISK_LEVELS[risk.lower()]
        cwe_id = _identifier(alert.get("cweid"))
        wasc_id = _identifier(alert.get("wascid"))
        findings.append({
            "zap_rule_id": _rule_id(alert),
            "http_method": _method(alert.get('method')),
            "title": title,
            "owasp_category": f"CWE-{cwe_id}" if cwe_id else (f"WASC-{wasc_id}" if wasc_id else "N/A"),
            "description": _optional_text(alert.get("description")) or title,
            "severity": severity,
            "cvss_score": cvss_score,
            "confidence": _optional_text(alert.get("confidence")),
            "affected_url": _optional_text(alert.get("url")),
            "affected_parameter": _optional_text(alert.get("param")),
            "evidence": _optional_text(alert.get("evidence")),
            "recommendation": _optional_text(alert.get("solution")) or "Ver documentação OWASP.",
            "cwe_id": cwe_id,
            "wasc_id": wasc_id,
            "technical_reference": _optional_text(alert.get("reference")),
            "execution_timestamp": _timestamp(alert.get("timestamp")),
        })
    return findings
