package br.utfpr.websec.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "findings")
public class Finding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "scan_id")
    private Scan scan;

    @Column(name = "owasp_category", nullable = false)
    private String owaspCategory; // ex: "A03:2021 - Injection"

    @Column(columnDefinition = "text")
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(name = "cvss_score", nullable = false)
    private Double cvssScore;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Severity severity;

    @Column(columnDefinition = "text")
    private String recommendation;

    @Column
    private String confidence;

    @Column(name = "affected_url", columnDefinition = "text")
    private String affectedUrl;

    @Column(name = "affected_parameter", columnDefinition = "text")
    private String affectedParameter;

    @Column(columnDefinition = "text")
    private String evidence;

    @Column(name = "cwe_id")
    private String cweId;

    @Column(name = "wasc_id")
    private String wascId;

    @Column(name = "technical_reference", columnDefinition = "text")
    private String technicalReference;

    @Column(name = "execution_timestamp")
    private Instant executionTimestamp;

    public enum Severity { LOW, MEDIUM, HIGH, CRITICAL, INFORMATIONAL }

    public Long getId() { return id; }
    public Scan getScan() { return scan; }
    public void setScan(Scan scan) { this.scan = scan; }
    public String getOwaspCategory() { return owaspCategory; }
    public void setOwaspCategory(String owaspCategory) { this.owaspCategory = owaspCategory; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Double getCvssScore() { return cvssScore; }
    public void setCvssScore(Double cvssScore) { this.cvssScore = cvssScore; }
    public Severity getSeverity() { return severity; }
    public void setSeverity(Severity severity) { this.severity = severity; }
    public String getRecommendation() { return recommendation; }
    public void setRecommendation(String recommendation) { this.recommendation = recommendation; }
    public String getConfidence() { return confidence; }
    public void setConfidence(String confidence) { this.confidence = confidence; }
    public String getAffectedUrl() { return affectedUrl; }
    public void setAffectedUrl(String affectedUrl) { this.affectedUrl = affectedUrl; }
    public String getAffectedParameter() { return affectedParameter; }
    public void setAffectedParameter(String affectedParameter) { this.affectedParameter = affectedParameter; }
    public String getEvidence() { return evidence; }
    public void setEvidence(String evidence) { this.evidence = evidence; }
    public String getCweId() { return cweId; }
    public void setCweId(String cweId) { this.cweId = cweId; }
    public String getWascId() { return wascId; }
    public void setWascId(String wascId) { this.wascId = wascId; }
    public String getTechnicalReference() { return technicalReference; }
    public void setTechnicalReference(String technicalReference) { this.technicalReference = technicalReference; }
    public Instant getExecutionTimestamp() { return executionTimestamp; }
    public void setExecutionTimestamp(Instant executionTimestamp) { this.executionTimestamp = executionTimestamp; }
}
