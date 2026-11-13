package com.auralis.app.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;

class OverviewMarkdownDocumentTests {
    private final OverviewDocumentValidator validator = new OverviewDocumentValidator(JsonMapper.builder().build());
    @Test
    void acceptsVersionTwoMarkdownWithoutRewritingHeadings() {
        var document = validator.validateProviderDocument("""
                {"schemaVersion":2,"title":"材料","outlineMarkdown":"# 主线\\n说明","summaryMarkdown":null}
                """);
        assertThat(document.outlineMarkdown()).isEqualTo("# 主线\n说明");
        assertThat(document.summaryMarkdown()).isNull();
    }
    @ParameterizedTest
    @ValueSource(strings = {
        "{\"schemaVersion\":1,\"title\":\"x\",\"outline\":[],\"summary\":null}",
        "{\"schemaVersion\":2,\"title\":\"x\",\"outlineMarkdown\":null,\"summaryMarkdown\":null}",
        "{\"schemaVersion\":2,\"title\":\"x\",\"outlineMarkdown\":\" \",\"summaryMarkdown\":null}",
        "{\"schemaVersion\":2,\"title\":\"x\",\"outlineMarkdown\":\"a\",\"summaryMarkdown\":null,\"outline\":[]}",
        "{\"schemaVersion\":2,\"title\":\"x\",\"outlineMarkdown\":\"a\",\"summaryMarkdown\":null} {}"
    })
    void rejectsOldOrMalformedDocuments(String content) {
        assertThatThrownBy(() -> validator.validateProviderDocument(content))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class);
    }
}
