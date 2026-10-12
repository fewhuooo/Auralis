package com.auralis.app.review;

import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.review.internal.persistence.ReviewStateEntity;
import com.auralis.app.review.internal.persistence.ReviewStateRepository;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.pagination.CursorCodec;
import com.auralis.app.shared.pagination.CursorPage;
import com.auralis.app.subject.SubjectService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class ReviewService {
    private final ReviewStateRepository stateRepository;
    private final KnowledgeBlockService knowledgeBlockService;
    private final SubjectService subjectService;

    public ReviewService(ReviewStateRepository stateRepository,
                         KnowledgeBlockService knowledgeBlockService,
                         SubjectService subjectService) {
        this.stateRepository = stateRepository;
        this.knowledgeBlockService = knowledgeBlockService;
        this.subjectService = subjectService;
    }

    @Transactional(readOnly = true)
    public CursorPage<ReviewStateView> states(UUID userId, UUID subjectId, String encodedCursor, int requestedLimit) {
        checkLimit(requestedLimit);
        subjectService.requireActiveSubject(userId, subjectId);
        String resource = "review-states:" + userId + ":" + subjectId;
        CursorCodec.Cursor cursor = encodedCursor == null || encodedCursor.isBlank()
                ? null
                : CursorCodec.decode(resource, encodedCursor);
        if (cursor != null && (!cursor.sortKey().isEmpty() || !Instant.EPOCH.equals(cursor.updatedAt()))) {
            throw new DomainException("VALIDATION_FAILED", "Cursor is invalid");
        }
        UUID afterKnowledgeBlockId = cursor == null ? null : cursor.id();
        List<ReviewStateEntity> rows = stateRepository.findForActiveSubjectAfter(
                userId, subjectId, afterKnowledgeBlockId, requestedLimit + 1);
        boolean hasMore = rows.size() > requestedLimit;
        List<ReviewStateEntity> page = hasMore ? rows.subList(0, requestedLimit) : rows;
        String nextCursor = hasMore
                ? CursorCodec.encode(resource, "", Instant.EPOCH, page.getLast().getKnowledgeBlockId())
                : null;
        return new CursorPage<>(page.stream().map(this::view).toList(), nextCursor, hasMore);
    }

    private void checkLimit(int limit) {
        if (limit < 1 || limit > 200) {
            throw new DomainException("VALIDATION_FAILED", "limit must be between 1 and 200");
        }
    }

    private ReviewStateView view(ReviewStateEntity entity) {
        return view(entity, knowledgeBlockService.get(entity.getUserId(), entity.getKnowledgeBlockId()).version());
    }

    private ReviewStateView view(ReviewStateEntity entity, long knowledgeBlockVersion) {
        return new ReviewStateView(entity.getId(), entity.getUserId(), entity.getKnowledgeBlockId(),
                entity.getParameterSetId(), entity.getDifficulty(), entity.getStability(), entity.getDueAt(),
                entity.getLastReviewedAt(), entity.getReps(), entity.getLapses(), entity.getVersion(),
                entity.getCreatedAt(), entity.getUpdatedAt(), knowledgeBlockVersion, entity.isNeedsLearning(),
                entity.isMastered(), entity.getStableSuccessCount(), entity.getNextReviewStage(),
                entity.getLastPracticeAt(), entity.getLastReviewId(), entity.getPendingReviewId(), entity.getContentHash());
    }
}
