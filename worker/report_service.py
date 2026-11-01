"""
Geração de relatório PDF (RF09); transporte SMTP em email_service.py.
"""

import os
import logging

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

log = logging.getLogger("report_service")

REPORTS_DIR = os.getenv("REPORTS_DIR", "/data/reports")


def generate_pdf_report(scan_id: int, hostname: str, findings: list[dict], *, metadata=None, file_key=None) -> str:
    """Render only escaped text, then atomically publish a complete file."""
    from collections import Counter
    from datetime import datetime, timezone
    from pathlib import Path
    import tempfile
    from xml.sax.saxutils import escape

    metadata = metadata or {}
    root = Path(REPORTS_DIR)
    root.mkdir(parents=True, exist_ok=True)
    key = file_key or f"scan-{scan_id}.pdf"
    if Path(key).name != key or not key.endswith('.pdf'):
        raise ValueError('Invalid report key')
    path = root / key
    styles = getSampleStyleSheet()
    styles['Normal'].fontSize = 9
    styles['Normal'].leading = 13
    styles['Normal'].wordWrap = 'CJK'
    styles['Heading2'].spaceBefore = 14

    def paragraph(value, style='Normal'):
        text = escape(str(value if value is not None else 'Não informado'))
        return Paragraph(text.replace('\n','<br/>'), styles[style])

    def field(label, value):
        return paragraph(f'{label}: {value if value is not None else "Não informado"}')

    def moment(value):
        return value.isoformat() if hasattr(value,'isoformat') else value or 'Não informado'

    story = [paragraph('WebSec Inspector', 'Title'),
             paragraph('Relatório de segurança', 'Heading1'),
             field('Domínio', hostname), field('Varredura', scan_id),
             field('Alvo utilizado', metadata.get('target', 'Não registrado na execução legada')),
             field('Estado', metadata.get('status','COMPLETED')),
             field('Início (UTC)',moment(metadata.get('started_at'))),
             field('Conclusão (UTC)',moment(metadata.get('finished_at'))),
             field('Emissão (UTC)',datetime.now(timezone.utc).isoformat())]
    start, finish = metadata.get('started_at'), metadata.get('finished_at')
    duration = f'{max(0,int((finish-start).total_seconds()))} segundos' if start and finish else 'Não disponível'
    story += [field('Duração',duration),paragraph('Resumo', 'Heading2'),field('Total de achados',len(findings))]
    counts = Counter(f.get('severity','INFORMATIONAL') for f in findings)
    data = [[paragraph('Severidade'),paragraph('Quantidade')]]
    for severity in ('CRITICAL','HIGH','MEDIUM','LOW','INFORMATIONAL'):
        data.append([paragraph(severity),paragraph(counts[severity])])
    summary=Table(data,colWidths=[330,145],repeatRows=1,hAlign='LEFT')
    summary.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e2e8f0')),
                                ('LINEBELOW',(0,0),(-1,0),1,colors.HexColor('#64748b')),
                                ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    story += [Spacer(1,10),summary,paragraph('Metodologia e limites', 'Heading2'),
              paragraph('Análise automatizada com OWASP ZAP. Os achados são indícios técnicos e precisam de validação humana. '
                        'A ausência de achados não garante ausência de vulnerabilidades. O score apresentado é aproximado, '
                        'derivado da classificação de risco; não é um cálculo CVSS validado. Evidências podem conter dados sensíveis.')]
    if not findings:
        story.append(paragraph('A varredura foi concluída sem achados registrados.'))
    for index, finding in enumerate(findings,1):
        story += [paragraph(f'{index}. {finding.get("title") or finding.get("owasp_category") or "Achado"}','Heading2')]
        for label, key_name in [('Categoria OWASP','owasp_category'),('Severidade','severity'),
             ('Score aproximado (não CVSS)','cvss_score'),('Confiança','confidence'),
             ('URL afetada','affected_url'),('Parâmetro','affected_parameter'),('CWE','cwe_id'),('WASC','wasc_id')]:
            story.append(field(label,finding.get(key_name)))
        for title, key_name in [('Descrição','description'),('Evidência','evidence'),
                                ('Recomendação','recommendation'),('Referência técnica','technical_reference')]:
            story.append(paragraph(title,'Heading3'))
            # Separate flowables avoid rows or paragraphs taller than a page.
            text = str(finding.get(key_name) or 'Não informado')
            for offset in range(0,len(text),2000):
                story.append(paragraph(text[offset:offset+2000]))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica',8)
        canvas.setFillColor(colors.HexColor('#64748b'))
        canvas.drawString(60,30,f'WebSec Inspector | Varredura {scan_id}')
        canvas.drawRightString(A4[0]-60,30,f'Página {doc.page}')
        canvas.restoreState()

    fd, temporary = tempfile.mkstemp(prefix='.report-',suffix='.tmp',dir=root)
    os.close(fd)
    try:
        doc=SimpleDocTemplate(temporary,pagesize=A4,leftMargin=60,rightMargin=60,topMargin=48,bottomMargin=52)
        doc.build(story,onFirstPage=footer,onLaterPages=footer)
        if os.path.getsize(temporary)>32*1024*1024:
            raise ValueError('PDF size exceeds the download limit')
        os.replace(temporary,path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
    log.info('Report published for scan %s',scan_id)
    return str(path)
