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
    void documentsReadingContextAndScopedConversationFields() throws Exception {
        JsonNode document = openApiDocument();

        JsonNode message = document.at("/components/schemas/AiMessageCommand");
        assertThat(message.at("/properties/readingContext").isObject()).isTrue();
        assertThat(document.at("/components/schemas/ReadingContext/properties/currentSourceId").isObject()).isTrue();
        assertThat(document.at("/components/schemas/ReadingContext/properties/selectionText/maxLength").asInt())
                .isEqualTo(4000);
        assertThat(document.at("/components/schemas/ConversationCommand/properties/purpose/enum").toString())
                .contains("READING_SESSION");
        assertThat(document.at("/components/schemas/ConversationCommand/properties/sourceId").isObject()).isTrue();
        assertThat(document.at("/components/schemas/ConversationView/properties/purpose").isObject()).isTrue();
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
}
