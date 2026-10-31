package br.utfpr.websec.repository;

import br.utfpr.websec.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name="jakarta.persistence.lock.timeout", value="5000"))
    @Query("select u from User u where u.id = :id")
    Optional<User> findByIdForDomainCreation(@Param("id") Long id);

    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
    boolean existsByManager_Id(Long managerId);
}
