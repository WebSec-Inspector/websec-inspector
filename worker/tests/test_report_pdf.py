import tempfile
import unittest
import re
from pathlib import Path
from unittest.mock import patch
from worker import report_service


class ReportPdfTests(unittest.TestCase):
    def test_cover_and_executive_summary_are_on_separate_pages(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(report_service,'REPORTS_DIR',folder):
            path=report_service.generate_pdf_report(7,'example.invalid',[],
                metadata={'target':'http://example.invalid:8080/app?mode=1'},file_key='cover.pdf')
            pages=re.findall(rb'/Type\s*/Page\b',Path(path).read_bytes())
            self.assertEqual(2,len(pages))

    def test_empty_report_and_untrusted_long_evidence_generate_without_markup_execution(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(report_service,'REPORTS_DIR',folder):
            path = report_service.generate_pdf_report(1,'<img src="https://example.invalid">',[],
                metadata={'status':'COMPLETED','started_at':None,'finished_at':None},file_key='safe.pdf')
            self.assertTrue(Path(path).read_bytes().startswith(b'%PDF-'))
            finding = {'owasp_category':'A01','title':'Ação <script> & teste','severity':'LOW',
                'description':'texto & <tag> ' * 300,'cvss_score':3.0,'recommendation':'Corrigir',
                'evidence':'a'*10000,'affected_url':'https://example.invalid/'+'x'*1000}
            path=report_service.generate_pdf_report(2,'example.invalid',[finding],metadata={'status':'COMPLETED'},file_key='long.pdf')
            self.assertGreater(Path(path).stat().st_size,5000)
            self.assertEqual([],list(Path(folder).glob('*.tmp')))

    def test_failed_build_never_publishes_partial_pdf(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(report_service,'REPORTS_DIR',folder):
            final=Path(folder)/'existing.pdf'
            final.write_bytes(b'previous')
            with patch.object(report_service.SimpleDocTemplate,'build',side_effect=OSError('disk full')):
                with self.assertRaises(OSError):
                    report_service.generate_pdf_report(1,'example.invalid',[],metadata={},file_key='existing.pdf')
            self.assertEqual(b'previous',final.read_bytes())
            self.assertEqual([final],list(Path(folder).iterdir()))

    def test_oversized_pdf_is_not_published_as_a_ready_file(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(report_service,'REPORTS_DIR',folder):
            def huge(doc, *args, **kwargs):
                with open(doc.filename,'wb') as stream:
                    stream.write(b'%PDF-1.4')
                    stream.seek(32*1024*1024)
                    stream.write(b'x')
            with patch.object(report_service.SimpleDocTemplate,'build',autospec=True,side_effect=huge):
                with self.assertRaisesRegex(ValueError,'size'):
                    report_service.generate_pdf_report(1,'example.invalid',[],file_key='huge.pdf')
            self.assertEqual([],list(Path(folder).iterdir()))

    def test_pdf_shows_actual_cvss_vector_version_and_manual_basis_separately_from_zap(self):
        captured=[];original=report_service.SimpleDocTemplate.build
        def capture(doc,story,*args,**kwargs):
            captured.extend(item.getPlainText() for item in story if hasattr(item,'getPlainText'))
            return original(doc,story,*args,**kwargs)
        row={'title':'Example','severity':'LOW','cvss_score':3.0,'cvss_version':'4.0',
             'cvss_vector':'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N',
             'cvss_base_score':9.3,'cvss_severity':'CRITICAL','cvss_justification':'Impacto confirmado'}
        with tempfile.TemporaryDirectory() as folder,patch.object(report_service,'REPORTS_DIR',folder),patch.object(report_service.SimpleDocTemplate,'build',autospec=True,side_effect=capture):
            report_service.generate_pdf_report(1,'example.invalid',[row])
        text=' '.join(captured)
        self.assertIn('CVSS 4.0 Base',text);self.assertIn(row['cvss_vector'],text)
        self.assertIn('9.3',text);self.assertIn('Impacto confirmado',text)
