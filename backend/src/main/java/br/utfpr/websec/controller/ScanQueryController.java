package br.utfpr.websec.controller;

import br.utfpr.websec.dto.ScanListPageResponse;
import br.utfpr.websec.model.Scan;
import br.utfpr.websec.service.ScanQueryService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/scans")
public class ScanQueryController {
    private final ScanQueryService scans;
    public ScanQueryController(ScanQueryService scans) {this.scans=scans;}

    @GetMapping
    public ScanListPageResponse list(Authentication auth,
            @RequestParam(required=false) String page, @RequestParam(required=false) String size,
            @RequestParam(required=false) String domainId, @RequestParam(required=false) String status) {
        int pageNumber=integer(page,0,"page"),pageSize=integer(size,20,"size");
        if(pageNumber<0 || pageSize<1 || pageSize>100)
            throw new IllegalArgumentException("page deve ser não negativo e size deve estar entre 1 e 100.");
        Long domain=null;
        if(domainId!=null && !domainId.isEmpty()) {
            try {domain=Long.valueOf(domainId);} catch(NumberFormatException ex) {throw new IllegalArgumentException("domainId inválido.");}
            if(domain<=0)throw new IllegalArgumentException("domainId inválido.");
        }
        Scan.Status state=null;
        if(status!=null && !status.isEmpty()) {
            try {state=Scan.Status.valueOf(status);} catch(IllegalArgumentException ex) {throw new IllegalArgumentException("status inválido.");}
        }
        return scans.list(auth.getName(),pageNumber,pageSize,domain,state);
    }
    private static int integer(String value,int fallback,String field) {
        if(value==null)return fallback;
        try {return Integer.parseInt(value);} catch(NumberFormatException ex) {throw new IllegalArgumentException(field+" inválido.");}
    }
}
