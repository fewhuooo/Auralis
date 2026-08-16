package com.auralis.app.sync;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.sync.internal.persistence.InboundMutationEntity;
import com.auralis.app.sync.internal.persistence.InboundMutationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class SyncMutationProcessor {

    private final DomainWritePort domainWritePort;
    private final ChangeLogCapture changeLogCapture;
    private final InboundMutationRepository inboundMutationRepository;
    private final ObjectMapper objectMapper;

    public SyncMutationProcessor(
            DomainWritePort domainWritePort,
            ChangeLogCapture changeLogCapture,
            InboundMutationRepository inboundMutationRepository,
            ObjectMapper objectMapper) {
        this.domainWritePort = domainWritePort;
        this.changeLogCapture = changeLogCapture;
        this.inboundMutationRepository = inboundMutationRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public SyncDtos.MutationResponse process(UUID userId, UUID deviceId, SyncMutation mutation) {
        String hash = fingerprint(mutation);
        int reserved = inboundMutationRepository.reserve(
                UUID.randomUUID(), userId, deviceId, mutation.clientMutationId(), hash,
                mutation.resourceType().name(), mutation.resourceId(), mutation.mutationType().name());
        if (reserved == 0) {
            InboundMutationEntity existing = inboundMutationRepository
                    .findByUserIdAndDeviceIdAndClientMutationId(userId, deviceId, mutation.clientMutationId())
                    .orElseThrow(() -> new DomainException("INTERNAL_ERROR", "Reserved mutation could not be loaded"));
            if (!existing.getRequestHash().equals(hash)) {
                return hashMismatchResponse(existing, mutation);
            }
            return response(existing);
        }

        InboundMutationEntity entity = inboundMutationRepository
                .findByUserIdAndDeviceIdAndClientMutationId(userId, deviceId, mutation.clientMutationId())
                .orElseThrow(() -> new DomainException("INTERNAL_ERROR", "Reserved mutation could not be loaded"));
        changeLogCapture.begin();
        try {
            if (mutation.mutationType() == SyncMutationType.CREATE && mutation.baseVersion() != 0) {
                changeLogCapture.finish();
                entity.complete(MutationDecision.REJECTED, null, null, "VALIDATION_FAILED");
                return response(inboundMutationRepository.saveAndFlush(entity));
            }

            Object resource;
            try {
                resource = domainWritePort.apply(userId, mutation);
            } catch (DomainException exception) {
                changeLogCapture.finish();
                MutationDecision decision = "RESOURCE_VERSION_CONFLICT".equals(exception.code())
                        ? MutationDecision.CONFLICT : MutationDecision.REJECTED;
                entity.complete(decision, null, serialize(exception.current()), exception.code());
                return response(inboundMutationRepository.saveAndFlush(entity));
            }

            List<ChangeLogEntry> changes = changeLogCapture.finish();
            ChangeLogEntry appliedChange = changes.stream()
                    .filter(change -> change.resourceType() == mutation.resourceType())
                    .filter(change -> change.resourceId().equals(mutation.resourceId()))
                    .filter(change -> change.mutationType() == mutation.mutationType())
                    .findFirst()
                    .orElseThrow(() -> new DomainException(
                            "INTERNAL_ERROR", "Domain write did not produce a matching change log entry"));
            entity.complete(MutationDecision.APPLIED, appliedChange.cursor(), serialize(resource), null);
            return response(inboundMutationRepository.saveAndFlush(entity));
        } finally {
            changeLogCapture.finish();
        }
    }

    private SyncDtos.MutationResponse hashMismatchResponse(
            InboundMutationEntity existing, SyncMutation mutation) {
        return new SyncDtos.MutationResponse(
                mutation.clientMutationId(), MutationDecision.REJECTED, mutation.resourceType(), mutation.resourceId(),
                mutation.mutationType(), existing.getChangeCursor() == null
                ? null : new SyncCursor(existing.getChangeCursor()).encode(),
                parse(existing.getCurrentPayload()), "MUTATION_REJECTED", existing.getCreatedAt());
    }

    private SyncDtos.MutationResponse response(InboundMutationEntity entity) {
        return new SyncDtos.MutationResponse(
                entity.getClientMutationId(), entity.getDecision(), entity.getResourceType(), entity.getResourceId(),
                entity.getMutationType(), entity.getChangeCursor() == null
                ? null : new SyncCursor(entity.getChangeCursor()).encode(),
                parse(entity.getCurrentPayload()), entity.getErrorCode(), entity.getCreatedAt());
    }

    private String fingerprint(SyncMutation mutation) {
        try {
            byte[] bytes = objectMapper.writeValueAsBytes(mutation);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new DomainException("INTERNAL_ERROR", "Mutation fingerprint could not be generated");
        }
    }

    private String serialize(Object value) {
        try {
            return value == null ? null : objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new DomainException("INTERNAL_ERROR", "Mutation result could not be serialized");
        }
    }

    private Object parse(String payload) {
        if (payload == null) {
            return null;
        }
        try {
            return objectMapper.readTree(payload);
        } catch (JsonProcessingException exception) {
            return payload;
        }
    }
}
