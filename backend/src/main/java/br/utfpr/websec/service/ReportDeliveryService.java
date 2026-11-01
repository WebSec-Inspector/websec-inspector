package br.utfpr.websec.service;

import br.utfpr.websec.exception.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;

@Service
public class ReportDeliveryService {
    public record Delivery(boolean enabled, String status, int attemptCount,
                           Instant sentAt, Instant nextAttemptAt, String failureCode) {}
    private final ReportService reports;
    private final JdbcTemplate jdbc;
    private final boolean enabled;

    public ReportDeliveryService(ReportService reports, JdbcTemplate jdbc,
            @Value("${websec.reports.email-enabled:false}") boolean enabled) {
        this.reports=reports;this.jdbc=jdbc;this.enabled=enabled;
    }

    private Delivery metadata(long scanId) {
        var rows=jdbc.query("SELECT email_status,email_attempt_count,sent_at,email_next_attempt_at,email_failure_code FROM reports WHERE scan_id=?",
            (rs,n)->new Delivery(enabled,rs.getString(1),rs.getInt(2),
                "SENT".equals(rs.getString(1)) && rs.getTimestamp(3)!=null ? rs.getTimestamp(3).toInstant():null,
                rs.getTimestamp(4)==null?null:rs.getTimestamp(4).toInstant(),rs.getString(5)),scanId);
        return rows.isEmpty()?new Delivery(enabled,"NOT_REQUESTED",0,null,null,null):rows.get(0);
    }

    @Transactional(readOnly=true)
    public Delivery get(String email,long scanId) {
        reports.get(email,scanId); // Same owner / manager / admin rules as the PDF.
        return metadata(scanId);
    }

    @Transactional
    public Delivery request(String email,long scanId) {
        reports.get(email,scanId);
        if(!enabled)throw new IllegalStateException("O envio por e-mail ainda não está configurado.");
        var states=jdbc.queryForList("SELECT status FROM scans WHERE id=? AND deleted_at IS NULL FOR UPDATE",String.class,scanId);
        if(states.isEmpty())throw new ResourceNotFoundException("Varredura não encontrada");
        if(!"COMPLETED".equals(states.get(0)) || !"READY".equals(reports.get(email,scanId).status()))
            throw new IllegalStateException("Gere um PDF disponível antes de solicitar o envio por e-mail.");
        jdbc.update("""
            UPDATE reports SET email_status='PENDING',email_attempt_count=0,email_failure_code=NULL,
                email_next_attempt_at=NULL,email_worker_token=NULL,email_lease_until=NULL
            WHERE scan_id=? AND status='READY' AND email_status IN ('NOT_REQUESTED','FAILED')
            """,scanId);
        return metadata(scanId);
    }
}
