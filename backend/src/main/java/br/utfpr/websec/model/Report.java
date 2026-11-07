package br.utfpr.websec.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "reports")
public class Report {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(optional = false)
    @JoinColumn(name = "scan_id")
    private Scan scan;

    @Column(name = "pdf_url", nullable = false)
    private String pdfUrl;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "email_status", nullable = false)
    private String emailStatus = "NOT_REQUESTED";

    @Column(name = "email_attempt_count", nullable = false)
    private Integer emailAttemptCount = 0;

    @Column(name = "email_next_attempt_at")
    private Instant emailNextAttemptAt;

    @Column(name = "email_failure_code")
    private String emailFailureCode;

    @Column(name = "email_recipient")
    private String emailRecipient;

    public Long getId() { return id; }
    public Scan getScan() { return scan; }
    public void setScan(Scan scan) { this.scan = scan; }
    public String getPdfUrl() { return pdfUrl; }
    public void setPdfUrl(String pdfUrl) { this.pdfUrl = pdfUrl; }
    public Instant getSentAt() { return sentAt; }
    public void setSentAt(Instant sentAt) { this.sentAt = sentAt; }
    public String getEmailStatus() { return emailStatus; }
    public void setEmailStatus(String emailStatus) { this.emailStatus = emailStatus; }
    public Integer getEmailAttemptCount() { return emailAttemptCount; }
    public void setEmailAttemptCount(Integer emailAttemptCount) { this.emailAttemptCount = emailAttemptCount; }
    public Instant getEmailNextAttemptAt() { return emailNextAttemptAt; }
    public void setEmailNextAttemptAt(Instant emailNextAttemptAt) { this.emailNextAttemptAt = emailNextAttemptAt; }
    public String getEmailFailureCode() { return emailFailureCode; }
    public void setEmailFailureCode(String emailFailureCode) { this.emailFailureCode = emailFailureCode; }
    public String getEmailRecipient() { return emailRecipient; }
    public void setEmailRecipient(String emailRecipient) { this.emailRecipient = emailRecipient; }
}
