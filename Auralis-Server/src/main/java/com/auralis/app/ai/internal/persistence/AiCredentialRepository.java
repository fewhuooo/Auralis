package com.auralis.app.ai.internal.persistence;

import com.auralis.app.ai.AiProviderType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AiCredentialRepository extends JpaRepository<AiCredentialEntity, UUID> {

    Optional<AiCredentialEntity> findByUserIdAndProvider(UUID userId, AiProviderType provider);

    List<AiCredentialEntity> findAllByUserIdOrderByUpdatedAtDesc(UUID userId);
}
