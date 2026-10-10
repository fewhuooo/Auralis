package com.auralis.app.ai.internal.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface OverviewResultRepository extends JpaRepository<OverviewResultEntity, UUID> {
    Optional<OverviewResultEntity> findByUserIdAndScopeTypeAndScopeId(UUID userId, String scopeType, UUID scopeId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select result from OverviewResultEntity result where result.userId = :userId "
            + "and result.scopeType = :scopeType and result.scopeId = :scopeId")
    Optional<OverviewResultEntity> findForUpdate(@Param("userId") UUID userId,
                                                 @Param("scopeType") String scopeType,
                                                 @Param("scopeId") UUID scopeId);
}
