package com.auralis.app.ai.ingestion;

import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import org.springframework.stereotype.Component;

@Component
public class TextSourceParser implements SourceParser {

    @Override
    public boolean supports(SourceType type) {
        return type == SourceType.TEXT;
    }

    @Override
    public String parse(java.util.UUID userId, SourceView source) {
        if (source.rawText() == null || source.rawText().isBlank()) {
            throw new IllegalArgumentException("Text source is empty");
        }
        return source.rawText().trim();
    }
}
