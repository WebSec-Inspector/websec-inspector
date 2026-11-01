package br.utfpr.websec.service;

import br.utfpr.websec.exception.ResourceNotFoundException;
import br.utfpr.websec.model.Scan;
import br.utfpr.websec.model.User;
import br.utfpr.websec.repository.ScanRepository;
import br.utfpr.websec.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.LinkOption;
import java.time.Instant;

@Service
public class ReportService {
    public record Metadata(String status, Instant generatedAt, int generationVersion, String failureCode) {}
    private final JdbcTemplate jdbc;
    private final ScanRepository scans;
    private final UserRepository users;
    private final AccessControlService access;
    private final Path root;

    public ReportService(JdbcTemplate jdbc, ScanRepository scans, UserRepository users,
                         AccessControlService access, @Value("${websec.reports.directory:/data/reports}") String directory) {
        this.jdbc=jdbc;this.scans=scans;this.users=users;this.access=access;this.root=Path.of(directory).toAbsolutePath().normalize();
    }

    private Scan authorize(String email,long scanId) {
        User actor=users.findByEmail(email).orElseThrow(()->new ResourceNotFoundException("Usuário não encontrado"));
        Scan scan=scans.findById(scanId).orElseThrow(()->new ResourceNotFoundException("Varredura não encontrada"));
        if(scan.isDeleted())throw new ResourceNotFoundException("Varredura não encontrada");
        access.requireResourceScope(actor,scan.getDomain().getUser());
        return scan;
    }

    private Path availableFile(String key) {
        if(key==null || !key.matches("[A-Za-z0-9-]+\\.pdf"))return null;
        try {
            Path base=root.toRealPath();Path file=base.resolve(key);
            if(Files.isSymbolicLink(file) || !Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)
                    || !file.toRealPath().getParent().equals(base))return null;
            long size=Files.size(file);
            if(size<5 || size>32L*1024*1024)return null;
            try(var stream=Files.newInputStream(file,LinkOption.NOFOLLOW_LINKS)){
                return new String(stream.readNBytes(5),java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-") ? file : null;
            }
        } catch(IOException ex){return null;}
    }

    private Metadata metadata(long scanId) {
        var result=jdbc.query("SELECT status,generated_at,generation_version,failure_code,pdf_url FROM reports WHERE scan_id=?",
            (rs,n)->new Metadata("READY".equals(rs.getString(1)) && availableFile(rs.getString(5))==null ? "MISSING":rs.getString(1),
                rs.getTimestamp(2)==null?null:rs.getTimestamp(2).toInstant(),rs.getInt(3),rs.getString(4)),scanId);
        return result.isEmpty()?new Metadata("NOT_REQUESTED",null,1,null):result.get(0);
    }

    @Transactional(readOnly=true)
    public Metadata get(String email,long scanId){authorize(email,scanId);return metadata(scanId);}

    @Transactional
    public Metadata request(String email,long scanId){
        authorize(email,scanId);
        var states=jdbc.queryForList("SELECT status FROM scans WHERE id=? AND deleted_at IS NULL FOR UPDATE",String.class,scanId);
        if(states.isEmpty())throw new ResourceNotFoundException("Varredura não encontrada");
        if(!"COMPLETED".equals(states.get(0)))throw new IllegalStateException("O PDF só pode ser gerado após a conclusão da varredura.");
        jdbc.update("INSERT INTO reports(scan_id,pdf_url,status) VALUES (?,'','PENDING') ON CONFLICT (scan_id) DO NOTHING",scanId);
        Metadata current=metadata(scanId);
        if(current.status().equals("FAILED") || current.status().equals("MISSING")) {
            String delivery=jdbc.queryForObject("SELECT email_status FROM reports WHERE scan_id=?",String.class,scanId);
            if("SENDING".equals(delivery))throw new IllegalStateException("Aguarde o envio por e-mail em andamento antes de gerar outro PDF.");
            jdbc.update("UPDATE reports SET status='PENDING',attempt_count=0,failure_code=NULL,worker_token=NULL,lease_until=NULL WHERE scan_id=? AND status IN ('FAILED','READY')",scanId);
        }
        return metadata(scanId);
    }

    @Transactional(readOnly=true)
    public byte[] download(String email,long scanId){
        authorize(email,scanId);
        var keys=jdbc.queryForList("SELECT pdf_url FROM reports WHERE scan_id=? AND status='READY'",String.class,scanId);
        Path file=keys.isEmpty()?null:availableFile(keys.get(0));
        if(file==null)throw new IllegalStateException("PDF indisponível. Solicite a geração novamente.");
        try(var stream=Files.newInputStream(file,LinkOption.NOFOLLOW_LINKS)){
            byte[] bytes=stream.readNBytes(32*1024*1024+1);
            if(bytes.length>32*1024*1024 || bytes.length<5 || !new String(bytes,0,5,java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"))
                throw new IllegalStateException("Arquivo PDF inválido. Solicite a geração novamente.");
            return bytes;
        } catch(IOException ex){throw new IllegalStateException("PDF indisponível. Solicite a geração novamente.");}
    }
}
