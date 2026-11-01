package br.utfpr.websec.controller;

import br.utfpr.websec.dto.ScanComparisonResponse;
import br.utfpr.websec.service.ScanComparisonService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/scans")
public class ScanComparisonController {
    private final ScanComparisonService comparisons;
    public ScanComparisonController(ScanComparisonService comparisons){this.comparisons=comparisons;}
    @GetMapping("/{id}/compare/{otherId}")
    public ScanComparisonResponse compare(Authentication auth,@PathVariable Long id,@PathVariable Long otherId){
        return comparisons.compare(auth.getName(),id,otherId);
    }
}
