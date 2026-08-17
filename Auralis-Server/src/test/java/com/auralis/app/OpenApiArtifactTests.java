package com.auralis.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

    private JsonNode openApiDocument() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(body);
    }
}
