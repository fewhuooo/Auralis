package com.auralis.app.ai.internal.persistence;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface SourceChunkRepository extends JpaRepository<SourceChunkEntity, UUID> {

    List<SourceChunkEntity> findAllByUserId(UUID userId);

    List<SourceChunkEntity> findAllByUserIdAndSourceIdOrderByOrdinalAsc(UUID userId, UUID sourceId);

    List<SourceChunkEntity> findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(
            UUID userId, UUID sourceId, UUID generation);

    List<SourceChunkEntity> findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(UUID userId, UUID sourceId);

    @Query("""
            select chunk from SourceChunkEntity chunk
             where chunk.userId = :userId
               and chunk.sourceId = :sourceId
               and chunk.active = true
             order by chunk.ordinal asc
            """)
    List<SourceChunkEntity> findActiveForRawOverviewInput(
            @Param("userId") UUID userId,
            @Param("sourceId") UUID sourceId,
            Pageable pageable);

    void deleteAllByUserIdAndSourceId(UUID userId, UUID sourceId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            delete from SourceChunkEntity chunk
             where chunk.userId = :userId
               and chunk.sourceId = :sourceId
               and chunk.generation = :generation
            """)
    int deleteGeneration(
            @Param("userId") UUID userId,
            @Param("sourceId") UUID sourceId,
            @Param("generation") UUID generation);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update SourceChunkEntity chunk
               set chunk.active = false
             where chunk.userId = :userId
               and chunk.sourceId = :sourceId
               and chunk.active = true
            """)
    int deactivateActive(@Param("userId") UUID userId, @Param("sourceId") UUID sourceId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update SourceChunkEntity chunk
               set chunk.active = true
             where chunk.userId = :userId
               and chunk.sourceId = :sourceId
               and chunk.generation = :generation
            """)
    int activateGeneration(
            @Param("userId") UUID userId,
            @Param("sourceId") UUID sourceId,
            @Param("generation") UUID generation);
}
