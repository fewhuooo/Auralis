package com.auralis.app.sync;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class ChangeLogCapture {

    private final ThreadLocal<List<ChangeLogEntry>> current = new ThreadLocal<>();

    public void begin() {
        if (current.get() != null) {
            throw new IllegalStateException("A change-log capture is already active");
        }
        current.set(new ArrayList<>());
    }

    public void add(ChangeLogEntry entry) {
        var entries = current.get();
        if (entries != null) {
            entries.add(entry);
        }
    }

    public List<ChangeLogEntry> finish() {
        var entries = current.get();
        current.remove();
        return entries == null ? List.of() : List.copyOf(entries);
    }
}
