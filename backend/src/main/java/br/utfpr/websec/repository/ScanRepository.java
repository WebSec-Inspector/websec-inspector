package br.utfpr.websec.repository;

import br.utfpr.websec.model.Scan;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import br.utfpr.websec.dto.ScanState;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;

public interface ScanRepository extends JpaRepository<Scan, Long> {
    @Modifying
    @Query(value="UPDATE scans SET status='QUEUED' WHERE id=:id AND status='PENDING_VERIFICATION' AND deleted_at IS NULL",nativeQuery=true)
    int queuePending(@Param("id") Long id);

    @Modifying
    @Query(value="UPDATE scans SET status='CANCELLED',finished_at=now() WHERE id=:id AND status='PENDING_VERIFICATION' AND deleted_at IS NULL",nativeQuery=true)
    int cancelPending(@Param("id") Long id);

    @Query("select new br.utfpr.websec.dto.ScanState(s.status,s.finishedAt,s.deletedAt) from Scan s where s.id=:id")
    Optional<ScanState> findState(@Param("id") Long id);

    List<Scan> findByDomainIdAndDeletedAtIsNullOrderByCreatedAtDesc(Long domainId);

    boolean existsByDomainIdAndDeletedAtIsNullAndStatusIn(Long domainId, List<Scan.Status> statuses);
}
