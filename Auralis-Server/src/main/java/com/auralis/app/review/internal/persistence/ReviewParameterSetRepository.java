package com.auralis.app.review.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ReviewParameterSetRepository extends JpaRepository<ReviewParameterSetEntity, UUID> {
    Optional<ReviewParameterSetEntity> findBySchedulerAndVersion(String scheduler, int version);
}
