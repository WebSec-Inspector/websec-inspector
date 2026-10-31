package br.utfpr.websec.repository;

import br.utfpr.websec.model.Scan;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ScanRepository extends JpaRepository<Scan, Long> {
    List<Scan> findByDomainIdAndDeletedAtIsNullOrderByCreatedAtDesc(Long domainId);

    boolean existsByDomainIdAndDeletedAtIsNullAndStatusIn(Long domainId, List<Scan.Status> statuses);
}
