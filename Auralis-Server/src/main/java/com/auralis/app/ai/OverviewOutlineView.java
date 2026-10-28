package com.auralis.app.ai;

import java.util.List;
import java.util.UUID;

public record OverviewOutlineView(UUID resultId, String scopeType, long version,
                                  List<OutlineNode> nodes) {
    public OverviewOutlineView { nodes = nodes == null ? List.of() : List.copyOf(nodes); }

    public record OutlineNode(UUID sectionId, List<Integer> path, String title, boolean chapter) {
        public OutlineNode { path = path == null ? List.of() : List.copyOf(path); }
    }
}
