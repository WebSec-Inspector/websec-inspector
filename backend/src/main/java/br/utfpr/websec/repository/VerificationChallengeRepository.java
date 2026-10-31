package br.utfpr.websec.repository;

import br.utfpr.websec.model.VerificationChallenge;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface VerificationChallengeRepository extends JpaRepository<VerificationChallenge,UUID> {
    Optional<VerificationChallenge> findByUser_IdAndDomainIsNull(Long userId);
    Optional<VerificationChallenge> findByIdAndUser_Id(UUID id,Long userId);
    boolean existsByIdAndUser_Id(UUID id,Long userId);
}
