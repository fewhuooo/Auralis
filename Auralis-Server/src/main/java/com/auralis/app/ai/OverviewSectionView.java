package com.auralis.app.ai;

import com.auralis.app.ai.OverviewIdentityDtos.CanonicalSourceRefView;
import com.auralis.app.ai.OverviewDtos.OverviewSection;

import java.util.List;
import java.util.UUID;

public record OverviewSectionView(UUID resultId, UUID sectionId, long version, String chapterTitle,
                                  List<Integer> path, OverviewSection section,
                                  List<CanonicalSourceRefView> sourceRefs) {
    public OverviewSectionView {
        path = path == null ? List.of() : List.copyOf(path);
        sourceRefs = sourceRefs == null ? List.of() : List.copyOf(sourceRefs);
    }
}
