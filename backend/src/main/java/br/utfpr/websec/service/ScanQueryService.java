package br.utfpr.websec.service;

import br.utfpr.websec.dto.ScanListItem;
import br.utfpr.websec.dto.ScanListPageResponse;
import br.utfpr.websec.model.Scan;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.UserRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class ScanQueryService {
    private final JdbcTemplate jdbc;
    private final UserRepository users;

    public ScanQueryService(JdbcTemplate jdbc, UserRepository users) {
        this.jdbc=jdbc;this.users=users;
    }

    // Count and content use one PostgreSQL snapshot, including concurrent worker changes.
    @Transactional(readOnly=true, isolation=Isolation.REPEATABLE_READ)
    public ScanListPageResponse list(String email, int page, int size, Long domainId, Scan.Status status) {
        User actor=users.findByEmail(email).orElseThrow(()->new BadCredentialsException("Usuário inválido"));
        List<Object> parameters=new ArrayList<>();
        StringBuilder from=new StringBuilder(" FROM scans s JOIN domains d ON d.id=s.domain_id JOIN users u ON u.id=d.user_id WHERE s.deleted_at IS NULL");
        // Same ownership policy as AccessControlService.canAccessUser: managed CLIENTEs only.
        if(actor.getRole()!=User.Role.ADMINISTRADOR) {
            from.append(" AND (u.id=?");parameters.add(actor.getId());
            if(actor.getRole()==User.Role.GERENTE) {
                from.append(" OR (u.role='CLIENTE' AND u.manager_id=?)");parameters.add(actor.getId());
            }
            from.append(")");
        }
        if(domainId!=null) {from.append(" AND d.id=?");parameters.add(domainId);}
        if(status!=null) {from.append(" AND s.status=?");parameters.add(status.name());}
        long total=jdbc.queryForObject("SELECT count(*)"+from,Long.class,parameters.toArray());
        String query="""
            SELECT p.*, a.findings_count, CASE a.severity_rank
                WHEN 5 THEN 'CRITICAL' WHEN 4 THEN 'HIGH' WHEN 3 THEN 'MEDIUM'
                WHEN 2 THEN 'LOW' WHEN 1 THEN 'INFORMATIONAL' ELSE NULL END AS max_severity
            FROM (SELECT s.id, s.domain_id, d.hostname, s.name, s.status, s.created_at,
                         s.finished_at, d.is_active
            """+from+" ORDER BY s.created_at DESC,s.id DESC LIMIT ? OFFSET ?) p "+"""
            LEFT JOIN LATERAL (
                SELECT count(*) AS findings_count, max(CASE f.severity
                    WHEN 'CRITICAL' THEN 5 WHEN 'HIGH' THEN 4 WHEN 'MEDIUM' THEN 3
                    WHEN 'LOW' THEN 2 WHEN 'INFORMATIONAL' THEN 1 END) AS severity_rank
                FROM findings f WHERE f.scan_id=p.id
            ) a ON true
            ORDER BY p.created_at DESC,p.id DESC
            """;
        parameters.add(size);parameters.add((long)page*size);
        List<ScanListItem> content=jdbc.query(query,(rs,index)->new ScanListItem(
            rs.getLong("id"),rs.getLong("domain_id"),rs.getString("hostname"),rs.getString("name"),
            Scan.Status.valueOf(rs.getString("status")),instant(rs.getTimestamp("created_at")),
            instant(rs.getTimestamp("finished_at")),rs.getLong("findings_count"),
            rs.getString("max_severity"),rs.getBoolean("is_active")),parameters.toArray());
        return new ScanListPageResponse(content,page,size,total,total/size+(total%size==0?0:1));
    }

    private static Instant instant(Timestamp timestamp) {return timestamp==null?null:timestamp.toInstant();}
}
