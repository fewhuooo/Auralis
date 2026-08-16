package com.auralis.app.ai.ingestion;

import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import org.springframework.stereotype.Component;

@Component
public class UrlSourceParser implements SourceParser {

    private final UrlSourceFetcher fetcher;

    public UrlSourceParser(UrlSourceFetcher fetcher) {
        this.fetcher = fetcher;
    }

    @Override
    public boolean supports(SourceType type) {
        return type == SourceType.URL;
    }

    @Override
    public String parse(java.util.UUID userId, SourceView source) {
        return fetcher.fetch(source.originUrl());
    }
}
