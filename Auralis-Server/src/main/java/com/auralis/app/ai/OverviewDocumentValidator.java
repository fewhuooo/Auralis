package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;

@Component
public class OverviewDocumentValidator {
    public static final int SCHEMA_VERSION = 2;
    public static final int MAX_TITLE = 300;
    private final ObjectMapper mapper;
    private final AuralisProperties.OverviewLimits limits;
    public OverviewDocumentValidator(ObjectMapper mapper) {
        this(mapper, AuralisProperties.OverviewLimits.withoutAdditionalCaps());
    }
    @Autowired
    public OverviewDocumentValidator(ObjectMapper mapper, AuralisProperties properties) {
        this(mapper, properties.ai().overviewLimits());
    }
    OverviewDocumentValidator(ObjectMapper mapper, AuralisProperties.OverviewLimits limits) {
        this.mapper = mapper;
        this.limits = limits;
    }
    public OverviewResponse validateProviderDocument(String content) {
        if (content == null || limits.maxResultChars() > 0 && content.length() > limits.maxResultChars()) {
            throw invalid("result exceeds configured capacity");
        }
        JsonNode root;
        try {
            root = mapper.reader().with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(content);
        } catch (JacksonException exception) { throw invalid("malformed JSON"); }
        if (root == null || !root.isObject() || root.size() != 4
                || !root.path("schemaVersion").isIntegralNumber() || !root.path("schemaVersion").canConvertToInt()
                || root.path("schemaVersion").asInt() != SCHEMA_VERSION
                || !root.path("title").isTextual() || root.path("title").asText().isBlank()
                || limits.maxTitleChars() > 0 && root.path("title").asText().length() > limits.maxTitleChars()
                || !root.has("outlineMarkdown") || !root.has("summaryMarkdown")) throw invalid("schema version 2 required");
        for (String field : new String[]{"outlineMarkdown", "summaryMarkdown"}) {
            JsonNode value = root.path(field);
            if (!value.isNull() && (!value.isTextual() || value.asText().isBlank())) throw invalid("invalid Markdown field");
        }
        if (root.path("outlineMarkdown").isNull() && root.path("summaryMarkdown").isNull()) throw invalid("empty result");
        return new OverviewResponse(2, root.path("title").asText(),
                root.path("outlineMarkdown").isNull() ? null : root.path("outlineMarkdown").asText(),
                root.path("summaryMarkdown").isNull() ? null : root.path("summaryMarkdown").asText());
    }
    private static DomainException invalid(String detail) {
        return new DomainException("MODEL_PROVIDER_ERROR", "Invalid overview document: " + detail);
    }
}
