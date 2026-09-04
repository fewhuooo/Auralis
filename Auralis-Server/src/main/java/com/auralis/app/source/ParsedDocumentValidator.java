package com.auralis.app.source;

import com.auralis.app.shared.error.DomainException;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.zip.GZIPInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.springframework.stereotype.Component;

/**
 * Validates the untrusted, gzip-compressed ParsedDocument envelope without
 * buffering the compressed payload or the decompressed JSON in memory.
 */
@Component
public final class ParsedDocumentValidator {

    private static final Set<String> TOP_LEVEL_FIELDS = Set.of(
            "schemaVersion", "sourceId", "ingestionRevision", "sourceAssetSha256",
            "parser", "blocks", "characterCount", "plainTextSha256");
    private static final Set<String> PARSER_FIELDS = Set.of(
            "id", "version", "normalizationVersion", "ocrModelVersion");
    private static final Set<String> BLOCK_FIELDS = Set.of(
            "ordinal", "kind", "text", "pageNumber", "anchorIndex", "startLine");
    private static final Set<String> BLOCK_KINDS = Set.of("paragraph", "page", "slide", "ocr-page");

    private final ObjectMapper objectMapper;

    public ParsedDocumentValidator() {
        this(JsonMapper.builder()
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .build());
    }

    public ParsedDocumentValidator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ValidatedParsedDocument validate(InputStream input, Metadata metadata) {
        if (input == null || metadata == null || metadata.expectedCompressedBytes() <= 0
                || metadata.maxUncompressedBytes() <= 0 || metadata.maxBlocks() <= 0
                || metadata.maxBlockChars() <= 0 || metadata.maxTotalChars() <= 0
                || metadata.maxCompressionRatio() <= 0) {
            throw invalid("payload metadata is invalid");
        }
        String expectedPayloadHash = requiredHash(metadata.expectedPayloadSha256(), "payloadSha256");
        String expectedAssetHash = requiredHash(metadata.currentAssetSha256(), "sourceAssetSha256");
        MessageDigest payloadDigest = sha256Digest();
        CountingDigestInputStream compressed = new CountingDigestInputStream(
                input, payloadDigest, metadata.expectedCompressedBytes());
        CountingInputStream decompressed = null;
        try (GZIPInputStream gzip = new GZIPInputStream(compressed, 8192)) {
            decompressed = new CountingInputStream(gzip, metadata.maxUncompressedBytes());
            Parsed parsed = parse(decompressed, metadata);
            // Closing GZIPInputStream consumes the gzip footer and any trailing member bytes.
            gzip.close();
            long compressedBytes = compressed.count();
            if (compressedBytes != metadata.expectedCompressedBytes()) {
                throw invalid("compressed size does not match upload intent");
            }
            String actualPayloadHash = hex(payloadDigest.digest());
            if (!expectedPayloadHash.equals(actualPayloadHash)) {
                throw invalid("payloadSha256 does not match compressed bytes");
            }
            if (compressedBytes == 0
                    || decompressed.count() > metadata.maxUncompressedBytes()
                    || decompressed.count() / (double) compressedBytes > metadata.maxCompressionRatio()) {
                throw invalid("uncompressed payload exceeds configured ratio");
            }
            if (!metadata.sourceId().equals(parsed.sourceId())) {
                throw invalid("sourceId does not match the upload scope");
            }
            if (!metadata.ingestionRevision().equals(parsed.ingestionRevision())) {
                throw invalid("ingestionRevision does not match the upload scope");
            }
            if (!expectedAssetHash.equals(parsed.sourceAssetSha256())) {
                throw invalid("sourceAssetSha256 does not match the current Asset");
            }
            if (parsed.characterCount() > metadata.maxTotalChars()
                    || parsed.characterCount() != parsed.computedCharacterCount()) {
                throw invalid("characterCount does not match normalized blocks");
            }
            String actualPlainHash = hex(parsed.plainTextDigest().digest());
            if (!parsed.declaredPlainTextSha256().equals(actualPlainHash)) {
                throw invalid("plainTextSha256 does not match normalized blocks");
            }
            return new ValidatedParsedDocument(
                    parsed.sourceId(), parsed.ingestionRevision(), parsed.sourceAssetSha256(),
                    parsed.blocks(), parsed.characterCount(), actualPlainHash, actualPayloadHash,
                    compressedBytes, decompressed.count());
        } catch (DomainException exception) {
            throw exception;
        } catch (BoundExceededException exception) {
            throw invalid(exception.getMessage());
        } catch (JacksonException exception) {
            if (exception.getCause() instanceof BoundExceededException boundExceeded) {
                throw invalid(boundExceeded.getMessage());
            }
            throw invalid("payload is not valid gzip UTF-8 JSON");
        } catch (IOException | RuntimeException exception) {
            throw invalid("payload is not valid gzip UTF-8 JSON");
        }
    }

    private Parsed parse(InputStream input, Metadata metadata) throws IOException {
        UUID sourceId = null;
        UUID ingestionRevision = null;
        String sourceAssetSha256 = null;
        String plainTextSha256 = null;
        int schemaVersion = -1;
        long characterCount = -1;
        List<ValidatedBlock> blocks = new ArrayList<>();
        MessageDigest plainDigest = sha256Digest();
        long computedCharacters = 0;
        try (JsonParser parser = objectMapper.createParser(input)) {
            requireToken(parser.nextToken(), JsonToken.START_OBJECT, "payload must be an object");
            Set<String> seen = new HashSet<>();
            JsonToken token;
            while ((token = parser.nextToken()) != JsonToken.END_OBJECT) {
                if (token != JsonToken.PROPERTY_NAME) {
                    throw invalid("payload field is malformed");
                }
                String field = parser.currentName();
                if (!TOP_LEVEL_FIELDS.contains(field) || !seen.add(field)) {
                    throw invalid("unknown or duplicate payload field: " + field);
                }
                token = parser.nextToken();
                switch (field) {
                    case "schemaVersion" -> schemaVersion = integer(parser, token, "schemaVersion");
                    case "sourceId" -> sourceId = uuid(parser, token, "sourceId");
                    case "ingestionRevision" -> ingestionRevision = uuid(parser, token, "ingestionRevision");
                    case "sourceAssetSha256" -> sourceAssetSha256 = hash(parser, token, "sourceAssetSha256");
                    case "parser" -> parseParser(parser, token);
                    case "blocks" -> {
                        requireToken(token, JsonToken.START_ARRAY, "blocks must be an array");
                        while (parser.nextToken() != JsonToken.END_ARRAY) {
                            if (blocks.size() >= metadata.maxBlocks()) {
                                throw invalid("blocks exceed configured limit");
                            }
                            ValidatedBlock block = parseBlock(parser, metadata, blocks.size());
                            blocks.add(block);
                            plainDigest.update(block.text().getBytes(StandardCharsets.UTF_8));
                            plainDigest.update((byte) '\n');
                            computedCharacters += block.text().codePointCount(0, block.text().length());
                            if (computedCharacters > metadata.maxTotalChars()) {
                                throw invalid("text exceeds configured limit");
                            }
                        }
                    }
                    case "characterCount" -> characterCount = longValue(parser, token, "characterCount");
                    case "plainTextSha256" -> plainTextSha256 = hash(parser, token, "plainTextSha256");
                    default -> throw invalid("unknown payload field: " + field);
                }
            }
            if (parser.nextToken() != null) {
                throw invalid("payload contains trailing JSON values");
            }
        }
        if (schemaVersion != 1 || sourceId == null || ingestionRevision == null || sourceAssetSha256 == null
                || plainTextSha256 == null || characterCount < 0 || blocks.isEmpty()
                || !plainTextSha256.equals(plainTextSha256.toLowerCase(Locale.ROOT))) {
            throw invalid("payload envelope is incomplete or unsupported");
        }
        return new Parsed(sourceId, ingestionRevision, sourceAssetSha256, blocks,
                characterCount, computedCharacters, plainDigest, plainTextSha256);
    }

    private void parseParser(JsonParser parser, JsonToken token) throws IOException {
        requireToken(token, JsonToken.START_OBJECT, "parser must be an object");
        Set<String> seen = new HashSet<>();
        boolean id = false;
        boolean version = false;
        boolean normalization = false;
        while ((token = parser.nextToken()) != JsonToken.END_OBJECT) {
            if (token != JsonToken.PROPERTY_NAME) {
                throw invalid("parser field is malformed");
            }
            String field = parser.currentName();
            if (!PARSER_FIELDS.contains(field) || !seen.add(field)) {
                throw invalid("unknown or duplicate parser field: " + field);
            }
            token = parser.nextToken();
            switch (field) {
                case "id" -> { requiredString(parser, token, "parser.id"); id = true; }
                case "version" -> { requiredString(parser, token, "parser.version"); version = true; }
                case "normalizationVersion" -> { requiredString(parser, token, "parser.normalizationVersion"); normalization = true; }
                case "ocrModelVersion" -> {
                    if (token != JsonToken.VALUE_STRING && token != JsonToken.VALUE_NULL) {
                        throw invalid("parser.ocrModelVersion must be string or null");
                    }
                }
                default -> throw invalid("unknown parser field: " + field);
            }
        }
        if (!id || !version || !normalization) {
            throw invalid("parser metadata is incomplete");
        }
    }

    private ValidatedBlock parseBlock(JsonParser parser, Metadata metadata, int expectedOrdinal) throws IOException {
        requireToken(parser.currentToken(), JsonToken.START_OBJECT, "block must be an object");
        Set<String> seen = new HashSet<>();
        long ordinal = -1;
        String kind = null;
        String text = null;
        while (parser.nextToken() != JsonToken.END_OBJECT) {
            if (parser.currentToken() != JsonToken.PROPERTY_NAME) {
                throw invalid("block field is malformed");
            }
            String field = parser.currentName();
            if (!BLOCK_FIELDS.contains(field) || !seen.add(field)) {
                throw invalid("unknown or duplicate block field: " + field);
            }
            JsonToken token = parser.nextToken();
            switch (field) {
                case "ordinal" -> ordinal = longValue(parser, token, "block.ordinal");
                case "kind" -> kind = requiredString(parser, token, "block.kind");
                case "text" -> text = requiredString(parser, token, "block.text");
                case "pageNumber", "anchorIndex", "startLine" -> {
                    if (token != JsonToken.VALUE_NUMBER_INT && token != JsonToken.VALUE_NULL) {
                        throw invalid("block position field must be an integer or null");
                    }
                }
                default -> throw invalid("unknown block field: " + field);
            }
        }
        if (ordinal != expectedOrdinal || kind == null || !BLOCK_KINDS.contains(kind) || text == null) {
            throw invalid("block ordinal, kind or text is invalid");
        }
        String normalized = normalizeText(text);
        if (normalized.isBlank()) {
            throw invalid("block text must not be blank");
        }
        if (normalized.codePointCount(0, normalized.length()) > metadata.maxBlockChars()) {
            throw invalid("block text exceeds configured limit");
        }
        return new ValidatedBlock(ordinal, kind, normalized);
    }

    private String normalizeText(String value) {
        return Normalizer.normalize(value.replace("\r\n", "\n").replace('\r', '\n'), Normalizer.Form.NFC);
    }

    private void requireToken(JsonToken actual, JsonToken expected, String detail) {
        if (actual != expected) {
            throw invalid(detail);
        }
    }

    private UUID uuid(JsonParser parser, JsonToken token, String field) throws IOException {
        return UUID.fromString(requiredString(parser, token, field));
    }

    private String hash(JsonParser parser, JsonToken token, String field) throws IOException {
        return requiredHash(requiredString(parser, token, field), field);
    }

    private String requiredString(JsonParser parser, JsonToken token, String field) throws IOException {
        if (token != JsonToken.VALUE_STRING || parser.getText().isBlank()) {
            throw invalid(field + " must be a non-empty string");
        }
        return parser.getText();
    }

    private int integer(JsonParser parser, JsonToken token, String field) throws IOException {
        long value = longValue(parser, token, field);
        if (value > Integer.MAX_VALUE) {
            throw invalid(field + " is too large");
        }
        return (int) value;
    }

    private long longValue(JsonParser parser, JsonToken token, String field) throws IOException {
        if (token != JsonToken.VALUE_NUMBER_INT || parser.getLongValue() < 0) {
            throw invalid(field + " must be a non-negative integer");
        }
        return parser.getLongValue();
    }

    private String requiredHash(String value, String field) {
        if (value == null || !value.matches("[0-9a-fA-F]{64}")) {
            throw invalid(field + " must be a 64-character hex value");
        }
        return value.toLowerCase(Locale.ROOT);
    }

    private DomainException invalid(String detail) {
        return new DomainException("PARSED_DOCUMENT_INVALID", detail);
    }

    private MessageDigest sha256Digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String hex(byte[] bytes) {
        return java.util.HexFormat.of().formatHex(bytes);
    }

    public record Metadata(
            UUID sourceId,
            UUID ingestionRevision,
            String currentAssetSha256,
            String expectedPayloadSha256,
            long expectedCompressedBytes,
            long maxUncompressedBytes,
            int maxBlocks,
            int maxBlockChars,
            long maxTotalChars,
            int maxCompressionRatio) {
    }

    public record ValidatedBlock(long ordinal, String kind, String text) {
    }

    public record ValidatedParsedDocument(
            UUID sourceId,
            UUID ingestionRevision,
            String sourceAssetSha256,
            List<ValidatedBlock> blocks,
            long characterCount,
            String plainTextSha256,
            String payloadSha256,
            long compressedBytes,
            long uncompressedBytes) {
    }

    private record Parsed(
            UUID sourceId,
            UUID ingestionRevision,
            String sourceAssetSha256,
            List<ValidatedBlock> blocks,
            long characterCount,
            long computedCharacterCount,
            MessageDigest plainTextDigest,
            String declaredPlainTextSha256) {
        private String plainTextSha256() {
            return declaredPlainTextSha256;
        }
    }

    private static final class BoundExceededException extends IOException {
        private BoundExceededException(String message) {
            super(message);
        }
    }

    private static final class CountingDigestInputStream extends InputStream {
        private final InputStream delegate;
        private final MessageDigest digest;
        private final long maxBytes;
        private long count;

        private CountingDigestInputStream(InputStream delegate, MessageDigest digest, long maxBytes) {
            this.delegate = delegate;
            this.digest = digest;
            this.maxBytes = maxBytes;
        }

        @Override
        public int read() throws IOException {
            int value = delegate.read();
            if (value >= 0) {
                accept(new byte[]{(byte) value}, 0, 1);
            }
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int read = delegate.read(buffer, offset, length);
            if (read > 0) {
                accept(buffer, offset, read);
            }
            return read;
        }

        private void accept(byte[] buffer, int offset, int length) throws BoundExceededException {
            if (count + length > maxBytes) {
                throw new BoundExceededException("compressed payload exceeds upload intent size");
            }
            digest.update(buffer, offset, length);
            count += length;
        }

        private long count() {
            return count;
        }
    }

    private static final class CountingInputStream extends InputStream {
        private final InputStream delegate;
        private final long maxBytes;
        private long count;

        private CountingInputStream(InputStream delegate, long maxBytes) {
            this.delegate = delegate;
            this.maxBytes = maxBytes;
        }

        @Override
        public int read() throws IOException {
            int value = delegate.read();
            if (value >= 0) {
                accept(1);
            }
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int read = delegate.read(buffer, offset, length);
            if (read > 0) {
                accept(read);
            }
            return read;
        }

        private void accept(long length) throws BoundExceededException {
            if (count + length > maxBytes) {
                throw new BoundExceededException("uncompressed payload exceeds configured limit");
            }
            count += length;
        }

        private long count() {
            return count;
        }
    }
}
