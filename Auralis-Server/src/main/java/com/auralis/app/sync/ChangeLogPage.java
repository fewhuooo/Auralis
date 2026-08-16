package com.auralis.app.sync;

import java.util.List;

public record ChangeLogPage(
        List<ChangeLogEntry> changes,
        SyncCursor nextCursor,
        boolean hasMore,
        boolean resetRequired) {
    public ChangeLogPage {
        changes = List.copyOf(changes);
    }
}
