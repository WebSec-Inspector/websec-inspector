"""SMTP transport; the caller owns persistent delivery state and retries."""
from email.message import EmailMessage
from email.headerregistry import Address
from email.utils import formatdate
import hashlib
import os
from pathlib import Path
import smtplib
import ssl

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


class DeliveryError(Exception):
    def __init__(self, code, retryable=False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


def enabled():
    return os.getenv('REPORT_EMAIL_ENABLED', 'false') == 'true'


def mailbox(value):
    try:
        if not value or not value.isascii() or any(c.isspace() for c in value):
            raise ValueError()
        parsed = Address(addr_spec=value)
        if not parsed.username or not parsed.domain or parsed.addr_spec != value:
            raise ValueError()
        return value
    except (ValueError, TypeError):
        raise DeliveryError('SMTP_ADDRESS_INVALID') from None


def send_pdf(report_id, scan_id, version, pdf_path, recipient):
    recipient = mailbox(recipient)
    sender = mailbox(os.getenv('REPORT_FROM_EMAIL', ''))
    host = os.getenv('SMTP_HOST', '').strip()
    mode = os.getenv('SMTP_TLS_MODE', 'starttls')
    username = os.getenv('SMTP_USER', '')
    password = os.getenv('SMTP_PASSWORD', '')
    try:
        port = int(os.getenv('SMTP_PORT', '587'))
        timeout = int(os.getenv('SMTP_TIMEOUT_SECONDS', '15'))
    except ValueError:
        raise DeliveryError('SMTP_CONFIGURATION_INVALID') from None
    if (not host or mode not in ('none', 'starttls', 'tls') or not 1 <= port <= 65535
            or not 1 <= timeout <= 60 or bool(username) != bool(password)
            or (username and mode == 'none')):
        raise DeliveryError('SMTP_CONFIGURATION_INVALID')
    try:
        path = Path(pdf_path)
        if path.is_symlink():
            raise OSError()
        with path.open('rb') as stream:
            payload = stream.read(MAX_ATTACHMENT_BYTES + 1)
    except OSError:
        raise DeliveryError('ATTACHMENT_UNAVAILABLE') from None
    if len(payload) > MAX_ATTACHMENT_BYTES:
        raise DeliveryError('ATTACHMENT_TOO_LARGE')
    if not payload.startswith(b'%PDF-'):
        raise DeliveryError('ATTACHMENT_INVALID')

    message = EmailMessage()
    message['From'] = sender
    message['To'] = recipient
    message['Subject'] = f'WebSec Inspector — Relatório da varredura #{scan_id}'
    message['Date'] = formatdate(usegmt=True)
    digest = hashlib.sha256(payload).hexdigest()[:16]
    message['Message-ID'] = f'<report-{report_id}-v{version}-{digest}@{sender.split("@")[1]}>'
    message.set_content(f'Olá,\n\nSegue o relatório da varredura #{scan_id}. '
                        'Os resultados precisam de validação humana.\n\nEquipe WebSec Inspector.')
    message.add_attachment(payload, maintype='application', subtype='pdf', filename=f'websec-scan-{scan_id}.pdf')
    accepted = False
    try:
        context = ssl.create_default_context()
        client = smtplib.SMTP_SSL(host, port, timeout=timeout, context=context) if mode == 'tls' else smtplib.SMTP(host, port, timeout=timeout)
        with client as smtp:
            if mode == 'starttls':
                smtp.starttls(context=context)
            if username:
                smtp.login(username, password)
            refused = smtp.send_message(message)
            if refused:
                raise DeliveryError('SMTP_RECIPIENT_REJECTED')
            accepted = True
    except DeliveryError:
        raise
    except (OSError, smtplib.SMTPException) as exc:
        # DATA acceptance is authoritative. A failed QUIT cannot undo it and
        # must not schedule a duplicate. The context manager still closes TCP.
        if accepted:
            return
        if isinstance(exc,smtplib.SMTPAuthenticationError):
            raise DeliveryError('SMTP_AUTHENTICATION_FAILED') from None
        if isinstance(exc,smtplib.SMTPRecipientsRefused):
            transient = any(code < 500 for code, _ in exc.recipients.values())
            raise DeliveryError('SMTP_RECIPIENT_REJECTED', retryable=transient) from None
        if isinstance(exc,(ssl.SSLError,smtplib.SMTPNotSupportedError)):
            raise DeliveryError('SMTP_TLS_FAILED') from None
        if isinstance(exc,smtplib.SMTPResponseException):
            raise DeliveryError('SMTP_REJECTED', retryable=exc.smtp_code < 500) from None
        raise DeliveryError('SMTP_UNAVAILABLE', retryable=True) from None
