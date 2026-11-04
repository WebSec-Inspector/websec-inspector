package br.utfpr.websec.controller;

import br.utfpr.websec.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
public class CvssController {
    public record Preview(@NotBlank @Size(max=255) String vector) {}
    public record Request(@NotBlank @Size(max=255) String vector,@NotBlank @Size(max=2000) String justification,
                          @NotNull @Min(0) @Max(9007199254740991L) Long expectedRevision) {}
    private final Cvss4Calculator calculator;
    private final CvssAssessmentService assessments;
    public CvssController(Cvss4Calculator calculator,CvssAssessmentService assessments){this.calculator=calculator;this.assessments=assessments;}
    @PostMapping("/api/cvss/v4/base/preview")
    public Cvss4Calculator.Calculation preview(@Valid @RequestBody Preview body){return calculator.calculate(body.vector());}
    @GetMapping("/api/findings/{id}/cvss")
    public CvssAssessmentService.View get(Authentication auth,@PathVariable long id){return assessments.get(auth.getName(),id);}
    @PutMapping("/api/findings/{id}/cvss")
    public CvssAssessmentService.View save(Authentication auth,@PathVariable long id,@Valid @RequestBody Request body){
        return assessments.save(auth.getName(),id,body.vector(),body.justification(),body.expectedRevision());
    }
}
