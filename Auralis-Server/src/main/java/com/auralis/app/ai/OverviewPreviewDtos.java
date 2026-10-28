package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewSection;

import java.util.List;
import java.util.UUID;

public final class OverviewPreviewDtos {
    private OverviewPreviewDtos() { }

    public record InputRef(UUID sourceId, UUID sourceRevision, UUID chunkId, UUID generation,
                          int ordinal, String contentHash, int charStart, int charEnd) { }

    public record Node(UUID nodeId, int ordinal, int chapterIndex, String chapterTitle,
                       String sectionTitle, String sectionSummary, List<InputRef> inputs) {
        public Node { inputs = inputs == null ? List.of() : List.copyOf(inputs); }
    }

    public record Page(UUID jobId, OverviewJobDtos.Status status, UUID planId, String planFingerprint,
                       boolean incomplete, List<Node> nodes, String nextCursor) {
        public Page { nodes = nodes == null ? List.of() : List.copyOf(nodes); }
    }

    public record NodeView(UUID jobId, UUID planId, UUID nodeId, int ordinal, int chapterIndex,
                           String chapterTitle, List<Fragment> fragments) {
        public NodeView { fragments = fragments == null ? List.of() : List.copyOf(fragments); }
    }

    public record Fragment(OverviewSection section,
                           List<OverviewIdentityDtos.CanonicalSourceRefView> provenance) {
        public Fragment { provenance = provenance == null ? List.of() : List.copyOf(provenance); }
    }
}
