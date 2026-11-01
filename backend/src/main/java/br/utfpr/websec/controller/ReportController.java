package br.utfpr.websec.controller;

import br.utfpr.websec.service.ReportService;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/scans/{id}/report")
public class ReportController {
    private final ReportService reports;
    public ReportController(ReportService reports){this.reports=reports;}
    @GetMapping
    public ReportService.Metadata get(Authentication auth,@PathVariable long id){return reports.get(auth.getName(),id);}
    @PostMapping
    public ResponseEntity<ReportService.Metadata> request(Authentication auth,@PathVariable long id){
        return ResponseEntity.accepted().body(reports.request(auth.getName(),id));
    }
    @GetMapping("/download")
    public ResponseEntity<byte[]> download(Authentication auth,@PathVariable long id){
        byte[] bytes=reports.download(auth.getName(),id);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"websec-scan-"+id+".pdf\"")
            .header(HttpHeaders.CACHE_CONTROL,"private, no-store")
            .header("X-Content-Type-Options","nosniff").contentLength(bytes.length).body(bytes);
    }
}
