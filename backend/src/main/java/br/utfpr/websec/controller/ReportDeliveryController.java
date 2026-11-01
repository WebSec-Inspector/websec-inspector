package br.utfpr.websec.controller;

import br.utfpr.websec.service.ReportDeliveryService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/scans/{id}/report/email")
public class ReportDeliveryController {
    private final ReportDeliveryService delivery;
    public ReportDeliveryController(ReportDeliveryService delivery){this.delivery=delivery;}
    @GetMapping
    public ReportDeliveryService.Delivery get(Authentication auth,@PathVariable long id){return delivery.get(auth.getName(),id);}
    @PostMapping
    public ResponseEntity<ReportDeliveryService.Delivery> request(Authentication auth,@PathVariable long id){
        return ResponseEntity.accepted().body(delivery.request(auth.getName(),id));
    }
}
