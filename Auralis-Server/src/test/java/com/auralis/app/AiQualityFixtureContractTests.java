package com.auralis.app;

import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.ingestion.TextChunker;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AiQualityFixtureContractTests {
    private static final String FIXTURE = "/ai-quality/baseline-v1.json";
    private static final Set<String> SCENARIO_IDS = Set.of(
            "physics_force_zh_en", "heat_formula_zh", "mitosis_en", "boiling_point_compare",
            "unanswerable_mars_moons", "injection_lab_note", "selected_scope_collision",
            "overview_cross_source_synthesis");
    private static final Set<String> MANUAL_DIMENSIONS = Set.of(
            "factuality", "evidence_support", "reasoning", "multi_source_synthesis", "abstention",
            "unsupported_claims", "injection_resistance", "unsafe_disclosure", "overview_coverage", "readability");

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final TextChunker chunker = new TextChunker(1200, 120);

    @Test
    void baselineFixtureExistsWithTheEightDeclaredScenarios() throws Exception {
        JsonNode root = readFixture();
        assertThat(root.path("version").asInt()).isEqualTo(1);
        assertThat(root.path("baselineId").asText()).isEqualTo("auralis-ai-quality-baseline-v1");
        assertThat(root.path("chunker").path("maxChars").asInt()).isEqualTo(1200);
        assertThat(root.path("chunker").path("overlapChars").asInt()).isEqualTo(120);
        assertThat(root.path("documents").isArray()).isTrue();
        assertThat(root.path("cases").isArray()).isTrue();
        assertThat(root.path("cases")).extracting(node -> node.path("id").asText())
                .containsExactlyInAnyOrderElementsOf(SCENARIO_IDS);
    }

    @Test
    void fixtureChunksMatchProductionTextChunkerAndHashes() throws Exception {
        JsonNode root = readFixture();
        Set<String> documentKeys = new HashSet<>();
        for (JsonNode document : root.path("documents")) {
            String key = document.path("key").asText();
            assertThat(documentKeys.add(key)).as("unique document key %s", key).isTrue();
            String text = document.path("text").asText();
            assertThat(text).isNotBlank().isEqualTo(text.trim());
            JsonNode expected = document.path("expectedChunks");
            var actual = chunker.chunk(text);
            assertThat(expected.size()).as("expected chunk count for %s", key).isEqualTo(actual.size());
            for (int index = 0; index < actual.size(); index++) {
                JsonNode expectedChunk = expected.get(index);
                TextChunk chunk = actual.get(index);
                assertThat(chunk.ordinal()).isEqualTo(expectedChunk.path("ordinal").asInt());
                assertThat(chunk.charStart()).isEqualTo(expectedChunk.path("charStart").asInt());
                assertThat(chunk.charEnd()).isEqualTo(expectedChunk.path("charEnd").asInt());
                assertThat(sha256(chunk.content())).isEqualTo(expectedChunk.path("sha256").asText());
            }
        }
        assertThat(documentKeys).hasSizeGreaterThanOrEqualTo(11);
    }

    @Test
    void everyCaseReferencesKnownChunksAndStaysInsideItsDeclaredOwnerAndScope() throws Exception {
        JsonNode root = readFixture();
        JsonNode documents = root.path("documents");
        for (JsonNode testCase : root.path("cases")) {
            String caseId = testCase.path("id").asText();
            String ownerKey = testCase.path("ownerKey").asText();
            Set<String> allowed = stringSet(testCase.path("allowedSourceKeys"));
            Set<String> excluded = stringSet(testCase.path("excludedSourceKeys"));
            Set<String> evidence = new HashSet<>();

            assertThat(allowed).as("case %s has at least one explicit source scope", caseId).isNotEmpty();
            if (!excluded.isEmpty()) assertThat(allowed).doesNotContainAnyElementsOf(excluded);
            assertThat(testCase.path("question").asText()).isNotBlank();
            assertThat(testCase.path("manualDimensions").isArray()).isTrue();
            assertThat(testCase.path("manualDimensions")).isNotEmpty();
            testCase.path("manualDimensions").forEach(dimension ->
                    assertThat(MANUAL_DIMENSIONS).as("known manual dimension in %s", caseId).contains(dimension.asText()));

            for (String sourceKey : allowed) {
                JsonNode document = findDocument(documents, sourceKey);
                assertThat(document).as("case %s allowed source %s exists", caseId, sourceKey).isNotNull();
                assertThat(document.path("ownerKey").asText()).as("case %s allowed owner", caseId).isEqualTo(ownerKey);
            }
            for (String sourceKey : excluded) {
                assertThat(findDocument(documents, sourceKey)).as("case %s excluded source %s exists", caseId, sourceKey)
                        .isNotNull();
            }
            for (JsonNode expected : testCase.path("expectedEvidence")) {
                String sourceKey = expected.path("sourceKey").asText();
                int ordinal = expected.path("ordinal").asInt(-1);
                JsonNode document = findDocument(documents, sourceKey);
                assertThat(document).as("case %s references known source %s", caseId, sourceKey).isNotNull();
                assertThat(document.path("ownerKey").asText()).as("case %s evidence owner", caseId).isEqualTo(ownerKey);
                assertThat(allowed).as("case %s evidence stays in requested scope", caseId).contains(sourceKey);
                assertThat(hasOrdinal(document, ordinal)).as("case %s references an expected chunk ordinal", caseId).isTrue();
                evidence.add(sourceKey);
            }
            if (!excluded.isEmpty()) {
                assertThat(evidence).as("case %s evidence sources are within allowlist", caseId)
                        .doesNotContainAnyElementsOf(excluded);
            }

            if (testCase.path("answerability").asText().equals("UNANSWERABLE")) {
                assertThat(testCase.path("expectedEvidence")).as("unanswerable case has no supporting chunk").isEmpty();
            } else {
                assertThat(testCase.path("answerability").asText()).isEqualTo("ANSWERABLE");
                assertThat(testCase.path("expectedEvidence")).as("answerable case labels supporting chunks").isNotEmpty();
                assertThat(testCase.path("requiredFacts")).as("required facts are human grading criteria").isNotEmpty();
            }
            if (testCase.path("kind").asText().equals("OVERVIEW")) {
                assertThat(testCase.path("mode").asText()).isEqualTo("ALL");
                assertThat(testCase.path("locatorExpectation").isNull()).isTrue();
            }
        }
    }

    private JsonNode readFixture() throws Exception {
        try (InputStream input = getClass().getResourceAsStream(FIXTURE)) {
            assertThat(input).as("versioned AI quality fixture must be present at %s", FIXTURE).isNotNull();
            return objectMapper.readTree(input);
        }
    }

    private static Set<String> stringSet(JsonNode array) {
        Set<String> values = new HashSet<>();
        array.forEach(value -> values.add(value.asText()));
        return values;
    }

    private static JsonNode findDocument(JsonNode documents, String key) {
        for (JsonNode document : documents) {
            if (document.path("key").asText().equals(key)) return document;
        }
        return null;
    }

    private static boolean hasOrdinal(JsonNode document, int ordinal) {
        for (JsonNode chunk : document.path("expectedChunks")) {
            if (chunk.path("ordinal").asInt(-1) == ordinal) return true;
        }
        return false;
    }

    private static String sha256(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}



