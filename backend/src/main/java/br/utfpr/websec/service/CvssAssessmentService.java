package br.utfpr.websec.service;

import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.*;
import br.utfpr.websec.repository.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;

@Service
public class CvssAssessmentService {
    public record Assessment(String version,String nomenclature,String vector,double score,String severity,
                             String justification,String assessorName,Instant assessedAt,long revision) {}
    public record View(boolean canAssess,Assessment assessment,List<Assessment> history) {}
    private final UserRepository users;
    private final FindingRepository findings;
    private final AccessControlService access;
    private final JdbcTemplate jdbc;
    private final Cvss4Calculator calculator;

    public CvssAssessmentService(UserRepository users,FindingRepository findings,AccessControlService access,JdbcTemplate jdbc,Cvss4Calculator calculator){
        this.users=users;this.findings=findings;this.access=access;this.jdbc=jdbc;this.calculator=calculator;
    }

    private User actor(String email){return users.findByEmail(email).orElseThrow(()->new ResourceNotFoundException("Usuário não encontrado"));}
    private Finding owned(long id,User actor){
        Finding finding=findings.findById(id).orElseThrow(()->new ResourceNotFoundException("Achado não encontrado"));
        if(finding.getScan().isDeleted())throw new ResourceNotFoundException("Achado não encontrado");
        access.requireResourceScope(actor,finding.getScan().getDomain().getUser());
        return finding;
    }
    private boolean assessor(User actor){return actor.getRole()==User.Role.GERENTE || actor.getRole()==User.Role.ADMINISTRADOR;}

    private View view(long id,boolean canAssess){
        var history=jdbc.query("""
            SELECT c.version,c.vector,c.base_score,c.severity,c.justification,u.name,c.assessed_at,c.revision
            FROM finding_cvss_history c JOIN users u ON u.id=c.assessed_by
            WHERE c.finding_id=? ORDER BY c.revision DESC LIMIT 20
            """,(rs,n)->new Assessment(rs.getString(1),"CVSS-B",rs.getString(2),rs.getDouble(3),rs.getString(4),
                rs.getString(5),rs.getString(6),rs.getTimestamp(7).toInstant(),rs.getLong(8)),id);
        return new View(canAssess,history.isEmpty()?null:history.get(0),List.copyOf(history));
    }

    @Transactional(readOnly=true)
    public View get(String email,long id){
        User actor=actor(email);Finding finding=owned(id,actor);
        return view(id,assessor(actor) && finding.getScan().getStatus()==Scan.Status.COMPLETED);
    }

    @Transactional
    public View save(String email,long id,String vector,String justification,long expectedRevision){
        User actor=actor(email);Finding finding=owned(id,actor);
        access.requireManagerOrAdministrator(actor);
        var states=jdbc.queryForList("SELECT status FROM scans WHERE id=? AND deleted_at IS NULL FOR UPDATE",String.class,finding.getScan().getId());
        if(states.isEmpty())throw new ResourceNotFoundException("Achado não encontrado");
        if(!"COMPLETED".equals(states.get(0)))throw new IllegalStateException("Avalie apenas achados de varreduras concluídas.");
        jdbc.queryForObject("SELECT id FROM findings WHERE id=? FOR UPDATE",Long.class,id);
        var revisions=jdbc.queryForList("SELECT revision FROM finding_cvss_assessments WHERE finding_id=?",Long.class,id);
        long current=revisions.isEmpty()?0:revisions.get(0);
        if(current!=expectedRevision)throw new IllegalStateException("A avaliação foi alterada. Recarregue antes de salvar para preservar a revisão mais recente.");
        var value=calculator.calculate(vector);long revision=current+1;Instant now=Instant.now();
        jdbc.update("""
            INSERT INTO finding_cvss_assessments(finding_id,version,vector,base_score,severity,justification,assessed_by,assessed_at,revision)
            VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (finding_id) DO UPDATE SET version=EXCLUDED.version,vector=EXCLUDED.vector,
            base_score=EXCLUDED.base_score,severity=EXCLUDED.severity,justification=EXCLUDED.justification,
            assessed_by=EXCLUDED.assessed_by,assessed_at=EXCLUDED.assessed_at,revision=EXCLUDED.revision
            """,id,value.version(),value.vector(),value.score(),value.severity(),justification.trim(),actor.getId(),java.sql.Timestamp.from(now),revision);
        jdbc.update("""
            INSERT INTO finding_cvss_history(finding_id,version,vector,base_score,severity,justification,assessed_by,assessed_at,revision)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,id,value.version(),value.vector(),value.score(),value.severity(),justification.trim(),actor.getId(),java.sql.Timestamp.from(now),revision);
        // Same scan lock as email/delete; invalidate an old PDF attempt atomically.
        jdbc.update("""
            INSERT INTO reports(scan_id,pdf_url,status) VALUES (?,'','PENDING') ON CONFLICT (scan_id) DO UPDATE
            SET status='PENDING',attempt_count=0,worker_token=NULL,lease_until=NULL,failure_code=NULL
            """,finding.getScan().getId());
        return view(id,true);
    }
}
