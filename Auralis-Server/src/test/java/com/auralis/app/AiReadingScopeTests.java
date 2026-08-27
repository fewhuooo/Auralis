package com.auralis.app;

import com.auralis.app.ai.retrieval.ReadingRetrievalConfig;
import com.auralis.app.ai.retrieval.ScopeEscalationPolicy;
import com.auralis.app.ai.retrieval.ScopeEscalationReason;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AiReadingScopeTests {

    private static final ReadingRetrievalConfig CONFIG = new ReadingRetrievalConfig(1, 8, 3);

    @Test
    void explicitCompareEscalatesOnlyToMentionedFilesWithinSameSubject() {
        UUID subjectId = UUID.randomUUID();
        SourceView current = source(UUID.randomUUID(), subjectId, "Algebra notes");
        SourceView mentioned = source(UUID.randomUUID(), subjectId, "Geometry notes");
        SourceView otherSubject = source(UUID.randomUUID(), UUID.randomUUID(), "Calculus notes");

        ScopeEscalationPolicy.Decision decision = ScopeEscalationPolicy.decide(
                "请对比 Geometry notes 与当前文件", current, List.of(current, mentioned, otherSubject), 2, CONFIG);

        assertThat(decision.reason()).isEqualTo(ScopeEscalationReason.EXPLICIT_CROSS_FILE);
        assertThat(decision.sourceIds()).containsExactly(mentioned.id());
    }

    @Test
    void titleMatchEscalatesWithoutTreatingGenericShortTitlesAsEvidence() {
        UUID subjectId = UUID.randomUUID();
        SourceView current = source(UUID.randomUUID(), subjectId, "Current");
        SourceView mentioned = source(UUID.randomUUID(), subjectId, "Linear Algebra");
        SourceView generic = source(UUID.randomUUID(), subjectId, "文件");

        ScopeEscalationPolicy.Decision titleDecision = ScopeEscalationPolicy.decide(
                "Explain Linear-Algebra", current, List.of(current, mentioned, generic), 3, CONFIG);
        ScopeEscalationPolicy.Decision none = ScopeEscalationPolicy.decide(
                "Explain 文件", current, List.of(current, generic), 3, CONFIG);

        assertThat(titleDecision.reason()).isEqualTo(ScopeEscalationReason.SUBJECT_SOURCE_TITLE_MATCH);
        assertThat(titleDecision.sourceIds()).containsExactly(mentioned.id());
        assertThat(none.escalated()).isFalse();
    }

    @Test
    void insufficientCurrentResultsEscalatesToSubjectCandidates() {
        UUID subjectId = UUID.randomUUID();
        SourceView current = source(UUID.randomUUID(), subjectId, "Current");
        SourceView other = source(UUID.randomUUID(), subjectId, "Other notes");

        ScopeEscalationPolicy.Decision decision = ScopeEscalationPolicy.decide(
                "unmatched question", current, List.of(current, other), 0, CONFIG);

        assertThat(decision.reason()).isEqualTo(ScopeEscalationReason.INSUFFICIENT_CURRENT_RESULTS);
        assertThat(decision.sourceIds()).containsExactly(other.id());
    }

    private static SourceView source(UUID id, UUID subjectId, String title) {
        Instant now = Instant.now();
        return new SourceView(id, subjectId, SourceType.FILE, title, null, null, null, null,
                SourceIngestionStatus.READY, null, null, 1, now, now, null);
    }
}
