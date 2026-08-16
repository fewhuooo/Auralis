package com.auralis.app.ai.ingestion;

import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;

import java.util.UUID;

public interface SourceParser {

    boolean supports(SourceType type);

    String parse(UUID userId, SourceView source);
}
