package com.auralis.app.ai.ingestion;

import com.auralis.app.source.AssetContent;
import com.auralis.app.source.AssetService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Component
public class FileSourceParser implements SourceParser {

    private final AssetService assetService;
    private final AuralisProperties properties;

    public FileSourceParser(AssetService assetService, AuralisProperties properties) {
        this.assetService = assetService;
        this.properties = properties;
    }

    @Override
    public boolean supports(SourceType type) {
        return type == SourceType.FILE;
    }

    @Override
    public String parse(java.util.UUID userId, SourceView source) {
        if (source.assetId() == null) {
            throw new IllegalArgumentException("File source has no asset");
        }
        try (AssetContent content = assetService.openContent(userId, source.assetId())) {
            if (!isTextLike(content.mimeType())) {
                throw new IllegalArgumentException("File MIME type is not supported for text ingestion");
            }
            if (content.sizeBytes() > properties.ai().ingestionMaxBytes()) {
                throw new IllegalArgumentException("File exceeds the ingestion limit");
            }
            byte[] bytes = content.stream().readNBytes(Math.toIntExact(properties.ai().ingestionMaxBytes() + 1));
            if (bytes.length > properties.ai().ingestionMaxBytes()) {
                throw new IllegalArgumentException("File exceeds the ingestion limit");
            }
            String text = new String(bytes, StandardCharsets.UTF_8).trim();
            if (text.isBlank()) {
                throw new IllegalArgumentException("File source is empty");
            }
            return text;
        } catch (IOException exception) {
            throw new IllegalArgumentException("File source could not be read");
        }
    }

    private boolean isTextLike(String mimeType) {
        return mimeType != null && (mimeType.startsWith("text/")
                || mimeType.equalsIgnoreCase("application/json")
                || mimeType.equalsIgnoreCase("application/xml")
                || mimeType.equalsIgnoreCase("application/csv"));
    }

}
