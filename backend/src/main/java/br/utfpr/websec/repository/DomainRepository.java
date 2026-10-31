package br.utfpr.websec.repository;

import br.utfpr.websec.model.Domain;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface DomainRepository extends JpaRepository<Domain, Long> {
    /** Read legacy spelling without rewriting a published verification token. */
    @Query(value = """
            SELECT * FROM domains WHERE user_id = :userId AND
            (CASE WHEN rtrim(lower(hostname), '.') LIKE 'www.www.%'
                  THEN rtrim(lower(hostname), '.')
                  ELSE regexp_replace(rtrim(lower(hostname), '.'), '^www[.]', '') END) = :hostname
            ORDER BY id LIMIT 2
            """, nativeQuery = true)
    List<Domain> findCanonicalDomains(@Param("hostname") String hostname, @Param("userId") Long userId);

    List<Domain> findByUserId(Long userId);
    List<Domain> findByUserIdOrderByHostnameAsc(Long userId);
    List<Domain> findAllByActiveTrueOrderByHostnameAsc();
    Optional<Domain> findByVerificationToken(String token);
    Optional<Domain> findFirstByHostnameAndUserId(String hostname, Long userId);
    Optional<Domain> findByHostname(String hostname);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Domain d where d.id = :id")
    Optional<Domain> findByIdForUpdate(@Param("id") Long id);
}
