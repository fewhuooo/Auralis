package com.auralis.app;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class OpenApiArtifactTests {
    private static final Path ARTIFACT = Path.of("..", "docs", "contracts", "openapi", "auralis-openapi.json")
            .toAbsolutePath()
            .normalize();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void checkedInArtifactMatchesTheRuntimeOpenApiDocument() throws Exception {
        if (Boolean.getBoolean("auralis.openapi.export")) {
            return;
        }

        assertThat(Files.exists(ARTIFACT))
                .as("OpenAPI artifact must exist; run scripts/export-openapi.ps1 first")
                .isTrue();

        JsonNode expected = objectMapper.readTree(Files.readString(ARTIFACT));
        JsonNode actual = openApiDocument();
        assertThat(actual).isEqualTo(expected);
    }

    @Test
    void exportsTheRuntimeOpenApiDocumentWhenExplicitlyRequested() throws Exception {
        if (!Boolean.getBoolean("auralis.openapi.export")) {
            return;
        }

        Files.createDirectories(ARTIFACT.getParent());
        Files.writeString(ARTIFACT, objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(openApiDocument()) + System.lineSeparator());
        assertThat(Files.exists(ARTIFACT)).isTrue();
    }

    @Test
    void documentsAuthenticationAndNonDefaultSuccessStatuses() throws Exception {
        JsonNode document = openApiDocument();

        assertThat(document.at("/components/securitySchemes/bearerAuth/type").asText())
                .isEqualTo("http");
        assertThat(document.at("/paths/~1api~1auth~1login/post/security").isMissingNode()).isTrue();
        assertThat(document.at("/paths/~1api~1auth~1me/get/security").isArray()).isTrue();
        assertThat(document.at("/paths/~1api~1subjects/post/responses/201").isObject()).isTrue();
        assertThat(document.at("/paths/~1api~1tasks~1{id}/delete/responses/204").isObject()).isTrue();
    }

    @Test
    void overviewResultAndSourceCollectionsHaveNoFixedVolumeSchemaCaps() throws Exception {
        JsonNode document = openApiDocument();
        JsonNode response = document.at("/components/schemas/OverviewResponse/properties");
        JsonNode chapter = document.at("/components/schemas/OverviewChapter/properties");
        JsonNode section = document.at("/components/schemas/OverviewSection/properties");
        JsonNode summary = document.at("/components/schemas/OverviewSummary/properties");
        JsonNode subjectRequest = document.at("/components/schemas/SubjectOverviewRequest/properties/sources");
        JsonNode jobRequest = document.at("/components/schemas/StartRequest/properties/sourceIds");

        assertThat(response.at("/title/maxLength").isMissingNode()).isTrue();
        assertThat(response.at("/outline/maxItems").isMissingNode()).isTrue();
        assertThat(chapter.at("/title/maxLength").isMissingNode()).isTrue();
        assertThat(chapter.at("/sections/maxItems").isMissingNode()).isTrue();
        assertThat(section.at("/title/maxLength").isMissingNode()).isTrue();
        assertThat(section.at("/summary/maxLength").isMissingNode()).isTrue();
        assertThat(section.at("/sourceIds/maxItems").isMissingNode()).isTrue();
        assertThat(section.at("/sourceIds/minItems").asInt()).isEqualTo(1);
        assertThat(summary.at("/overview/maxLength").isMissingNode()).isTrue();
        assertThat(summary.at("/keyPoints/maxItems").isMissingNode()).isTrue();
        assertThat(summary.at("/learningPath/maxItems").isMissingNode()).isTrue();
        assertThat(subjectRequest.at("/maxItems").isMissingNode()).isTrue();
        assertThat(jobRequest.at("/maxItems").isMissingNode()).isTrue();
    }

    @Test
    void exposesScheduleCommandsOnPushWithoutAddingThemToChangeLog() throws Exception {
        JsonNode document = openApiDocument();

        assertThat(document.at("/components/schemas/MutationRequest/properties/mutationType/enum").toString())
                .contains("SCHEDULE_INSERTION", "SCHEDULE_SWAP");
        assertThat(document.at("/components/schemas/MutationResponse/properties/mutationType/enum").toString())
                .contains("SCHEDULE_INSERTION", "SCHEDULE_SWAP");
        assertThat(document.at("/components/schemas/ChangeResponse/properties/mutationType/enum").toString())
                .isEqualTo("[\"CREATE\",\"UPDATE\",\"DELETE\",\"RESTORE\"]");
    }

    @Test
    void omitsRemovedLegacyReviewRoutesAndEventSchemas() throws Exception {
        JsonNode document = openApiDocument();

        assertThat(document.at("/paths/~1api~1reviews~1due").isMissingNode()).isTrue();
        assertThat(document.at("/paths/~1api~1reviews~1events").isMissingNode()).isTrue();
        assertThat(document.at("/paths/~1api~1reviews~1history").isMissingNode()).isTrue();
        assertThat(document.at("/components/schemas/EventRequest").isMissingNode()).isTrue();
        assertThat(document.at("/components/schemas/EventResponse").isMissingNode()).isTrue();
        assertThat(document.at("/components/schemas/ReviewEventView").isMissingNode()).isTrue();
    }

    @Test
    void documentsParsedDocumentContractAndReadOnlySourceRevision() throws Exception {
        JsonNode document = openApiDocument();

        JsonNode uploadIntent = document.at("/paths/~1api~1sources~1{sourceId}~1parsed-documents~1upload-intents/post");
        JsonNode complete = document.at("/paths/~1api~1sources~1{sourceId}~1parsed-documents~1{parsedDocumentId}~1complete/post");
        assertThat(uploadIntent.isObject()).isTrue();
        assertThat(complete.isObject()).isTrue();
        assertThat(complete.at("/responses/200").isObject()).isTrue();
        assertThat(uploadIntent.at("/responses/409/description").asText()).contains("INGESTION_REVISION_STALE");
        assertThat(complete.at("/responses/409/description").asText())
                .contains("PARSED_DOCUMENT_CONFLICT")
                .contains("INGESTION_REVISION_STALE");

        JsonNode intentSchema = document.at("/components/schemas/ParsedDocumentUploadIntentRequest");
        assertThat(intentSchema.isObject()).isTrue();
        assertThat(intentSchema.at("/required").toString())
                .doesNotContain("ocrModelVersion");

        JsonNode sourceSchema = document.at("/components/schemas/SourceResponse");
        assertThat(sourceSchema.isObject()).isTrue();
        assertThat(sourceSchema.at("/properties/ingestionRevision/readOnly").asBoolean()).isTrue();
        assertThat(sourceSchema.at("/properties/ingestionStatus/enum").toString())
                .contains("AWAITING_CLIENT")
                .contains("VALIDATING");
    }

    @Test
    void documentsLifecycleVersionFieldsAsRequiredAndOnlyThreeRatings() throws Exception {
        JsonNode document = openApiDocument();

        JsonNode completion = document.at("/components/schemas/LearningCompletionRequest");
        assertThat(completion.at("/required").toString())
                .contains("knowledgeBlockVersion", "baseVersion", "contentHash");
        assertThat(completion.at("/required").toString())
                .doesNotContain("occurredAt", "expectedStateAbsent");
        assertThat(completion.at("/properties/occurredAt/type").toString()).contains("string");
        assertThat(allowsNull(completion.at("/properties/occurredAt"))).isTrue();
        assertThat(allowsNull(completion.at("/properties/expectedStateAbsent"))).isTrue();
        JsonNode attempt = document.at("/components/schemas/ReviewAttemptRequest");
        assertThat(attempt.at("/required").toString())
                .contains("knowledgeBlockVersion", "baseVersion", "contentHash");
        assertThat(attempt.at("/required").toString())
                .doesNotContain("occurredAt", "expectedStateAbsent");
        assertThat(attempt.at("/properties/rating/enum").toString())
                .isEqualTo("[\"GOOD\",\"HARD\",\"AGAIN\"]");
        for (String schemaName : new String[]{"ReviewResolutionRequest", "LearningReopenRequest"}) {
            JsonNode request = document.at("/components/schemas/" + schemaName);
            assertThat(request.at("/required").toString()).doesNotContain("occurredAt", "expectedStateAbsent");
            assertThat(request.at("/properties/occurredAt").isObject()).isTrue();
            assertThat(request.at("/properties/expectedStateAbsent").isObject()).isTrue();
        }

        JsonNode effectiveReview = document.at("/components/schemas/EffectiveReview");
        assertThat(effectiveReview.at("/properties/selectedRating/enum").toString())
                .isEqualTo("[\"GOOD\",\"HARD\",\"AGAIN\"]");
        assertThat(effectiveReview.at("/properties/effectiveRating/enum").toString())
                .isEqualTo("[\"GOOD\",\"HARD\",\"AGAIN\"]");
        assertThat(allowsNull(effectiveReview.at("/properties/effectiveRating"))).isTrue();
        assertThat(allowsNull(effectiveReview.at("/properties/resolvedAt"))).isTrue();
        assertThat(allowsNull(effectiveReview.at("/properties/resolution"))).isTrue();
        JsonNode baseline = effectiveReview.at("/properties/schedulingBaseline");
        assertThat(baseline.isObject()).isTrue();
        assertThat(allowsNull(baseline)).isTrue();
        JsonNode baselineSchema = document.at("/components/schemas/SchedulingBaseline");
        assertThat(baselineSchema.at("/properties/stableSuccessCount/type").toString()).contains("integer");
        assertThat(baselineSchema.at("/properties/stability/type").toString()).contains("number");

        String lifecycleActions = "[\"LEARNING_COMPLETED\",\"REVIEW_SELECTED\",\"REVIEW_CONFIRMED\","
                + "\"REVIEW_CORRECTED\",\"LEARNING_REOPENED\"]";
        assertThat(document.at("/components/schemas/CommandResponse/properties/action/enum").toString())
                .isEqualTo(lifecycleActions);
        assertThat(document.at("/components/schemas/CommandHistory/properties/action/enum").toString())
                .isEqualTo(lifecycleActions);
        JsonNode resolution = effectiveReview.at("/properties/resolution");
        assertThat(resolution.at("/enum").toString())
                .isEqualTo("[\"AGAIN_SELECTED\",\"CONFIRMED\",\"CORRECTED_AGAIN\",\"SUPERSEDED\"]");

        JsonNode history = document.at("/components/schemas/LifecycleHistory");
        assertThat(allowsNull(history.at("/properties/state"))).isTrue();
        assertThat(history.at("/properties/protocolVersion/type").asText()).isEqualTo("integer");
        assertThat(allowsNull(document.at("/components/schemas/ReviewStateView/properties/contentHash"))).isTrue();
    }

    @Test
    void documentsReadingContextAndScopedConversationFields() throws Exception {
        JsonNode document = openApiDocument();

        JsonNode message = document.at("/components/schemas/AiMessageCommand");
        JsonNode readingContext = document.at("/components/schemas/ReadingContext");
        assertThat(message.has("retrievalEnabled")).isFalse();
        assertThat(message.at("/properties/readingContext").isObject()).isTrue();
        assertThat(message.at("/properties/selectionText/maxLength").asInt()).isEqualTo(4000);
        assertThat(message.at("/required").toString()).doesNotContain("selectionText");
        assertThat(readingContext.at("/properties/currentSourceId").isObject()).isTrue();
        assertThat(readingContext.at("/required").toString()).doesNotContain("currentSourceId");
        assertThat(readingContext.at("/properties/sourceIds/maxItems").asInt()).isEqualTo(100);
        assertThat(readingContext.at("/properties/retrievalMode/enum").toString())
                .contains("AUTO")
                .contains("SELECTED_SOURCES")
                .contains("SUBJECT");
        assertThat(readingContext.at("/properties/selectionText/maxLength").asInt())
                .isEqualTo(4000);
        assertThat(document.at("/components/schemas/ConversationCommand/properties/purpose/enum").toString())
                .contains("READING_SESSION");
        assertThat(document.at("/components/schemas/ConversationCommand/properties/sourceId").isObject()).isTrue();
        assertThat(document.at("/components/schemas/ConversationView/properties/purpose").isObject()).isTrue();
    }

    @Test
    void documentsOverviewRequiredFieldsAndExplicitNullableParts() throws Exception {
        JsonNode document = openApiDocument();
        JsonNode response = document.at("/components/schemas/OverviewResponse");
        assertThat(response.at("/required").toString())
                .contains("schemaVersion", "title", "outline", "summary");
        assertThat(allowsNull(response.at("/properties/outline"))).isTrue();
        assertThat(allowsNull(response.at("/properties/summary"))).isTrue();

        JsonNode input = document.at("/components/schemas/SubjectOverviewSourceInput");
        assertThat(allowsNull(input.at("/properties/outline"))).isTrue();
        assertThat(allowsNull(input.at("/properties/summary"))).isTrue();
        assertThat(input.at("/properties/outline/items/$ref").asText())
                .isEqualTo("#/components/schemas/OverviewChapter");
        assertThat(input.at("/properties/summary/$ref").asText())
                .isEqualTo("#/components/schemas/OverviewSummary");
    }

    @Test
    void documentsOverviewIdentityAndProvenanceNullabilityAndRequiredFields() throws Exception {
        JsonNode document = openApiDocument();

        JsonNode identityInput = document.at("/components/schemas/OutlineIdentityInput");
        assertRequired(identityInput, "schemaVersion", "nodes");
        JsonNode nodeInput = document.at("/components/schemas/OutlineIdentityNodeInput");
        assertRequired(nodeInput, "path", "nodeId");
        assertNullTypeUnion(nodeInput.at("/properties/nodeId"));
        JsonNode identityView = document.at("/components/schemas/OutlineIdentityView");
        assertRequired(identityView, "schemaVersion", "nodes");
        JsonNode identityNodeView = document.at("/components/schemas/OutlineIdentityNodeView");
        assertRequired(identityNodeView, "path", "nodeId", "contentVersion", "contentHash", "sourceRefs");

        JsonNode provenanceInput = document.at("/components/schemas/OutlineProvenanceInput");
        assertRequired(provenanceInput, "schemaVersion", "sections");
        JsonNode provenanceSectionInput = document.at("/components/schemas/OutlineProvenanceSectionInput");
        assertRequired(provenanceSectionInput, "path", "sourceRefs");
        JsonNode provenanceRefInput = document.at("/components/schemas/OutlineProvenanceSourceRefInput");
        assertRequired(provenanceRefInput, "sourceId", "ingestionRevision");
        assertOptionalNullableTypeUnion(provenanceRefInput, "chunkId", "generation", "charStart", "charEnd");
        JsonNode provenanceView = document.at("/components/schemas/OutlineProvenanceView");
        assertRequired(provenanceView, "schemaVersion", "sections");
        JsonNode provenanceSectionView = document.at("/components/schemas/OutlineProvenanceSectionView");
        assertRequired(provenanceSectionView, "path", "sourceRefs");

        JsonNode sourceRef = document.at("/components/schemas/CanonicalSourceRefView");
        assertRequired(sourceRef, "sourceId", "ingestionRevision", "chunkId", "generation", "charStart",
                "charEnd", "contentHash", "precision", "parsedDocumentId", "parserId", "locations");
        assertNullTypeUnion(sourceRef.at("/properties/chunkId"));
        assertNullTypeUnion(sourceRef.at("/properties/generation"));
        assertNullTypeUnion(sourceRef.at("/properties/charStart"));
        assertNullTypeUnion(sourceRef.at("/properties/charEnd"));
        assertNullTypeUnion(sourceRef.at("/properties/contentHash"));
        assertNullTypeUnion(sourceRef.at("/properties/parsedDocumentId"));
        assertNullTypeUnion(sourceRef.at("/properties/parserId"));

        JsonNode location = document.at("/components/schemas/ProvenanceLocationView");
        assertRequired(location, "blockOrdinal", "pageNumber", "anchorIndex", "startLine", "charStart", "charEnd",
                "blockCharStart", "blockCharEnd");
        assertNullTypeUnion(location.at("/properties/pageNumber"));
        assertNullTypeUnion(location.at("/properties/anchorIndex"));
        assertNullTypeUnion(location.at("/properties/startLine"));

        JsonNode resultView = document.at("/components/schemas/OverviewResultView");
        assertRequired(resultView, "identityReady", "outlineIdentity");
        assertNullableReferenceUnion(resultView.at("/properties/outlineIdentity"),
                "#/components/schemas/OutlineIdentityView");
        assertNullableReferenceUnion(resultView.at("/properties/outlineProvenance"),
                "#/components/schemas/OutlineProvenanceView");
        assertThat(resultView.at("/required").toString()).doesNotContain("outlineProvenance");
        JsonNode resultCommand = document.at("/components/schemas/OverviewResultCommand");
        assertThat(resultCommand.at("/required").toString()).doesNotContain("outlineIdentity", "outlineProvenance");
        assertNullableReferenceUnion(resultCommand.at("/properties/outlineIdentity"),
                "#/components/schemas/OutlineIdentityInput");
        assertNullableReferenceUnion(resultCommand.at("/properties/outlineProvenance"),
                "#/components/schemas/OutlineProvenanceInput");
    }

    @Test
    void documentsOverviewJobRoutesAndNullableFirstClaimProgress() throws Exception {
        JsonNode document = openApiDocument();
        assertThat(document.at("/paths/~1api~1ai~1overview-jobs/post").isObject()).isTrue();
        assertThat(document.at("/paths/~1api~1ai~1overview-jobs/get").isObject()).isTrue();
        assertThat(document.at("/paths/~1api~1ai~1overview-jobs~1{id}~1pause/post").isObject()).isTrue();
        assertThat(document.at("/paths/~1api~1ai~1overview-jobs~1{id}~1resume/post").isObject()).isTrue();
        assertThat(document.at("/paths/~1api~1ai~1overview-jobs~1{id}~1cancel/post").isObject()).isTrue();
        assertThat(document.at("/paths/~1api~1ai~1overview-jobs~1{id}~1reconcile/post").isObject()).isTrue();
        assertThat(document.at("/paths/~1api~1ai~1overview-jobs~1{id}~1candidate/get").isObject()).isTrue();

        JsonNode startRequest = document.at("/components/schemas/StartRequest");
        assertRequired(startRequest, "clientRequestId", "scope", "mode");
        assertThat(startRequest.at("/properties/mode/enum").toString())
                .contains("ALL", "OUTLINE")
                .doesNotContain("SUMMARY");
        assertRequired(document.at("/components/schemas/ControlRequest"), "expectedVersion");

        JsonNode jobView = document.at("/components/schemas/JobView");
        assertRequired(jobView, "jobId", "status", "version", "scope", "mode", "stage", "verifiedNodes",
                "totalNodes", "deadlineAt", "createdAt", "updatedAt");
        assertNullTypeUnion(jobView.at("/properties/totalNodes"));
        assertNullTypeUnion(jobView.at("/properties/deadlineAt"));
        assertNullTypeUnion(jobView.at("/properties/completedAt"));
        assertNullTypeUnion(jobView.at("/properties/sourceId"));
        assertNullTypeUnion(jobView.at("/properties/subjectId"));
        assertNullTypeUnion(jobView.at("/properties/sourceIds"));
    }

    @Test
    void overviewRoutesKeepJsonAndDocumentOptInEventStreamAndRequestId() throws Exception {
        JsonNode document = openApiDocument();
        for (String route : new String[]{"/api/ai/source-overviews", "/api/ai/subject-overviews"}) {
            JsonNode operation = document.at("/paths/" + route.replace("/", "~1") + "/post");
            assertThat(operation.isObject()).isTrue();
            assertThat(operation.at("/requestBody/content/application~1json/schema").isObject()).isTrue();
            assertThat(operation.at("/responses/200/content/application~1json/schema/$ref").asText())
                    .isEqualTo("#/components/schemas/OverviewResponse");
            assertThat(operation.at("/responses/200/content/text~1event-stream/schema").isObject()).isTrue();
            assertThat(operation.at("/parameters").toString()).contains("X-Overview-Request-Id");
            assertThat(operation.at("/description").asText()).contains("heartbeat").contains("terminal");
        }
    }

    @Test
    void documentsTaskSchemasWithoutCognitiveLoad() throws Exception {
        JsonNode document = openApiDocument();
        assertThat(document.at("/components/schemas/TaskView/properties/cognitiveLoad").isMissingNode()).isTrue();
        assertThat(document.at("/components/schemas/TaskCreateRequest/properties/cognitiveLoad").isMissingNode()).isTrue();
        assertThat(document.at("/components/schemas/TaskUpdateRequest/properties/cognitiveLoad").isMissingNode()).isTrue();
    }

    @Test
    void documentsTaskColorRemoval() throws Exception {
        JsonNode document = openApiDocument();
        assertThat(document.at("/components/schemas/Response/properties/colorOverride").isMissingNode()).isTrue();
        assertThat(document.at("/components/schemas/CreateRequest/properties/colorOverride").isMissingNode()).isTrue();
        assertThat(document.at("/components/schemas/UpdateRequest/properties/colorOverride").isMissingNode()).isTrue();
    }

    private JsonNode openApiDocument() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(body);
    }

    private boolean allowsNull(JsonNode schema) {
        if (schema.at("/nullable").asBoolean(false)) return true;
        JsonNode type = schema.at("/type");
        if (type.isArray()) {
            for (JsonNode value : type) if ("null".equals(value.asText())) return true;
        }
        JsonNode anyOf = schema.at("/anyOf");
        if (anyOf.isArray()) {
            for (JsonNode value : anyOf) if ("null".equals(value.at("/type").asText())) return true;
        }
        return false;
    }

    private void assertRequired(JsonNode schema, String... fieldNames) {
        JsonNode required = schema.path("required");
        assertThat(required.isArray()).isTrue();
        for (String fieldName : fieldNames) {
            assertThat(required.toString()).contains("\"" + fieldName + "\"");
        }
    }

    private void assertNullTypeUnion(JsonNode schema) {
        JsonNode type = schema.path("type");
        assertThat(type.isArray()).isTrue();
        boolean containsNull = false;
        for (JsonNode typeValue : type) {
            if ("null".equals(typeValue.asText())) containsNull = true;
        }
        assertThat(containsNull).isTrue();
    }

    private void assertNullableReferenceUnion(JsonNode schema, String expectedReference) {
        JsonNode alternatives = schema.path("anyOf");
        assertThat(alternatives.isArray()).isTrue();
        assertThat(alternatives.size()).isEqualTo(2);
        assertThat(schema.has("$ref")).isFalse();
        assertThat(schema.has("type")).isFalse();
        assertThat(alternatives.toString()).contains(expectedReference);
        assertThat(alternatives.toString()).contains("\"type\":\"null\"");
    }

    private void assertOptionalNullableTypeUnion(JsonNode schema, String... fieldNames) {
        for (String fieldName : fieldNames) {
            assertNullTypeUnion(schema.at("/properties/" + fieldName));
            assertThat(schema.at("/required").toString()).doesNotContain("\"" + fieldName + "\"");
        }
    }
}
