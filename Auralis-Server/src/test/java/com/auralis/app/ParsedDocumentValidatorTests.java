package com.auralis.app;

import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.ParsedDocumentValidator;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.UUID;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ParsedDocumentValidatorTests {

    private static final UUID SOURCE_ID = UUID.randomUUID();
    private static final UUID REVISION = UUID.randomUUID();
    private static final String ASSET_SHA = "b".repeat(64);

    private ParsedDocumentValidator validator;

    @BeforeEach
    void setUp() {
        validator = new ParsedDocumentValidator(new ObjectMapper());
    }

    @Test
    void validatesGzipPayloadAndPlainTextHash() throws Exception {
        String json = payload("hello", "world", null);
        byte[] gzip = gzip(json);
        ParsedDocumentValidator.Metadata metadata = metadata(gzip, 64_000, 100);

        ParsedDocumentValidator.ValidatedParsedDocument result = validator.validate(
                new ByteArrayInputStream(gzip), metadata);

        assertThat(result.sourceId()).isEqualTo(SOURCE_ID);
        assertThat(result.ingestionRevision()).isEqualTo(REVISION);
        assertThat(result.parserId()).isEqualTo("pdfjs");
        assertThat(result.blocks()).hasSize(2);
        assertThat(result.characterCount()).isEqualTo(10);
        assertThat(result.plainTextSha256()).isEqualTo(sha256("hello\nworld\n"));
        assertThat(result.payloadSha256()).isEqualTo(sha256(gzip));
    }

    @Test
    void retainsAcceptedBlockLocationFieldsForProvenanceMapping() throws Exception {
        String json = payload("hello", null, null).replace(
                "\"kind\":\"paragraph\",\"text\":\"hello\"",
                "\"kind\":\"paragraph\",\"text\":\"hello\",\"pageNumber\":2,\"anchorIndex\":8,\"startLine\":12");
        byte[] gzip = gzip(json);

        ParsedDocumentValidator.ValidatedParsedDocument result = validator.validate(
                new ByteArrayInputStream(gzip), metadata(gzip, 64_000, 100));

        assertThat(result.parserId()).isEqualTo("pdfjs");
        assertThat(result.blocks()).singleElement().satisfies(block -> {
            assertThat(block.pageNumber()).isEqualTo(2L);
            assertThat(block.anchorIndex()).isEqualTo(8L);
            assertThat(block.startLine()).isEqualTo(12L);
        });
    }

    @Test
    void acceptsSharedSchemaV1Fixture() throws Exception {
        String fixture = Files.readString(Path.of("..", "docs", "contracts", "fixtures", "parsed-document-v1.json"));
        var fixtureJson = new ObjectMapper().readTree(fixture);
        byte[] gzip = gzip(fixture);
        ParsedDocumentValidator.Metadata metadata = new ParsedDocumentValidator.Metadata(
                UUID.fromString(fixtureJson.get("sourceId").asText()),
                UUID.fromString(fixtureJson.get("ingestionRevision").asText()),
                fixtureJson.get("sourceAssetSha256").asText(),
                sha256(gzip), gzip.length,
                64_000, 16, 100, 10_000, 100);

        ParsedDocumentValidator.ValidatedParsedDocument result = validator.validate(
                new ByteArrayInputStream(gzip), metadata);

        assertThat(result.blocks()).extracting(
                ParsedDocumentValidator.ValidatedBlock::ordinal,
                ParsedDocumentValidator.ValidatedBlock::kind,
                ParsedDocumentValidator.ValidatedBlock::text)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(0L, "page", "你好𠮷"),
                        org.assertj.core.groups.Tuple.tuple(1L, "paragraph", "Résumé 🎓"));
        assertThat(result.characterCount()).isEqualTo(fixtureJson.get("characterCount").asLong());
        assertThat(result.plainTextSha256()).isEqualTo(fixtureJson.get("plainTextSha256").asText());
        assertThat(result.payloadSha256()).isEqualTo(sha256(gzip));
    }

    @Test
    void rejectsGzipBombBeforeUnboundedExpansion() throws Exception {
        byte[] gzip = gzip(payload("x".repeat(2_000), null, null));

        assertThatThrownBy(() -> validator.validate(
                new ByteArrayInputStream(gzip), metadata(gzip, 200, 10)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("uncompressed");
    }

    @Test
    void rejectsInvalidUtf8UnknownFieldsAndDiscontinuousOrdinals() throws Exception {
        byte[] invalidUtf8 = gzipBytes(new byte[]{'{', '"', 's', 'c', 'h', 'e', 'm', 'a', 'V', 'e', 'r', 's', 'i', 'o', 'n', '"', ':', '1', '}'});
        assertThatThrownBy(() -> validator.validate(new ByteArrayInputStream(invalidUtf8), metadata(invalidUtf8, 64_000, 100)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("payload");

        byte[] unknown = gzip(payload("hello", null, "\"unknown\":true,"));
        assertThatThrownBy(() -> validator.validate(new ByteArrayInputStream(unknown), metadata(unknown, 64_000, 100)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("unknown");

        String discontinuous = payloadWithOrdinals(0, 2);
        byte[] discontinuousGzip = gzip(discontinuous);
        assertThatThrownBy(() -> validator.validate(
                new ByteArrayInputStream(discontinuousGzip), metadata(discontinuousGzip, 64_000, 100)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("ordinal");
    }

    @Test
    void rejectsPlainTextAndPayloadHashMismatch() throws Exception {
        byte[] gzip = gzip(payload("hello", "world", null));
        String wrongPlainPayload = payload("hello", "world", null)
                .replace(sha256("hello\nworld\n"), "0".repeat(64));
        byte[] wrongPlainGzip = gzip(wrongPlainPayload);
        ParsedDocumentValidator.Metadata wrongPlainHash = new ParsedDocumentValidator.Metadata(
                SOURCE_ID, REVISION, ASSET_SHA, sha256(wrongPlainGzip), wrongPlainGzip.length,
                64_000, 10, 100, 10_000, 100);
        ParsedDocumentValidator.Metadata finalWrongPlainHash = wrongPlainHash;
        assertThatThrownBy(() -> validator.validate(new ByteArrayInputStream(wrongPlainGzip), finalWrongPlainHash))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("plainTextSha256");

        ParsedDocumentValidator.Metadata wrongPayloadHash = new ParsedDocumentValidator.Metadata(
                SOURCE_ID, REVISION, ASSET_SHA, "f".repeat(64), gzip.length,
                64_000, 10, 100, 10_000, 100);
        ParsedDocumentValidator.Metadata finalWrongPayloadHash = wrongPayloadHash;
        assertThatThrownBy(() -> validator.validate(new ByteArrayInputStream(gzip), finalWrongPayloadHash))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("payloadSha256");
    }

    private ParsedDocumentValidator.Metadata metadata(byte[] gzip, long maxUncompressed, int maxRatio) throws Exception {
        return new ParsedDocumentValidator.Metadata(
                SOURCE_ID, REVISION, ASSET_SHA, sha256(gzip), gzip.length,
                maxUncompressed, 16, 100, 10_000, maxRatio);
    }

    private String payload(String first, String second, String extra) throws Exception {
        StringBuilder blocks = new StringBuilder();
        blocks.append("{\"ordinal\":0,\"kind\":\"paragraph\",\"text\":\"")
                .append(first).append("\"}");
        if (second != null) {
            blocks.append(",\n{\"ordinal\":1,\"kind\":\"paragraph\",\"text\":\"")
                    .append(second).append("\"}");
        }
        return "{\"schemaVersion\":1,\"sourceId\":\"" + SOURCE_ID
                + "\",\"ingestionRevision\":\"" + REVISION
                + "\",\"sourceAssetSha256\":\"" + ASSET_SHA
                + "\",\"parser\":{\"id\":\"pdfjs\",\"version\":\"1\","
                + "\"normalizationVersion\":\"1\",\"ocrModelVersion\":null},"
                + "\"blocks\":[" + blocks + "],\"characterCount\":"
                + (second == null ? first.codePointCount(0, first.length()) : first.length() + second.length())
                + ",\"plainTextSha256\":\"" + sha256((second == null ? first : first + "\n" + second) + "\n") + "\""
                + (extra == null ? "" : "," + extra) + "}";
    }

    private String payloadWithOrdinals(int first, int second) throws Exception {
        return "{\"schemaVersion\":1,\"sourceId\":\"" + SOURCE_ID
                + "\",\"ingestionRevision\":\"" + REVISION
                + "\",\"sourceAssetSha256\":\"" + ASSET_SHA
                + "\",\"parser\":{\"id\":\"pdfjs\",\"version\":\"1\",\"normalizationVersion\":\"1\",\"ocrModelVersion\":null},"
                + "\"blocks\":[{\"ordinal\":" + first + ",\"kind\":\"paragraph\",\"text\":\"hello\"},"
                + "{\"ordinal\":" + second + ",\"kind\":\"paragraph\",\"text\":\"world\"}],"
                + "\"characterCount\":10,\"plainTextSha256\":\"" + sha256("hello\nworld\n") + "\"}";
    }

    private byte[] gzip(String value) throws Exception {
        return gzipBytes(value.getBytes(StandardCharsets.UTF_8));
    }

    private byte[] gzipBytes(byte[] value) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(output)) {
            gzip.write(value);
        }
        return output.toByteArray();
    }

    private String sha256(String value) throws Exception {
        return sha256(value.getBytes(StandardCharsets.UTF_8));
    }

    private String sha256(byte[] value) throws Exception {
        return hex(MessageDigest.getInstance("SHA-256").digest(value));
    }

    private String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte item : value) {
            result.append(String.format("%02x", item));
        }
        return result.toString();
    }
}
