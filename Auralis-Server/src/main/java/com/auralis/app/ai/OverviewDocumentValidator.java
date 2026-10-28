package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewLocator;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.OverviewSection;
import com.auralis.app.ai.OverviewDtos.OverviewSummary;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonParser;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.TokenStreamLocation;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.function.Consumer;

/** Validates untrusted provider JSON while keeping source aliases until final response mapping. */
@Component
public class OverviewDocumentValidator {

    public static final int MAX_TITLE = 300;
    public static final int MAX_PROSE = 4_000;
    public static final int MAX_CHAPTERS = 60;
    public static final int MAX_SECTIONS = 500;
    public static final int MAX_KEY_POINTS = 100;
    public static final int MAX_SOURCE_IDS_PER_SECTION = 100;

    private final ObjectMapper objectMapper;
    private final AuralisProperties.OverviewLimits limits;

    public OverviewDocumentValidator(ObjectMapper objectMapper) {
        this(objectMapper, AuralisProperties.OverviewLimits.withoutAdditionalCaps());
    }

    @Autowired
    public OverviewDocumentValidator(ObjectMapper objectMapper, AuralisProperties properties) {
        this(objectMapper, properties == null ? AuralisProperties.OverviewLimits.withoutAdditionalCaps()
                : properties.ai().overviewLimits());
    }

    OverviewDocumentValidator(ObjectMapper objectMapper, AuralisProperties.OverviewLimits limits) {
        this.objectMapper = objectMapper;
        this.limits = limits == null ? AuralisProperties.OverviewLimits.withoutAdditionalCaps() : limits;
    }

    /** Parses only plain JSON or one JSON fenced block. Returned IDs are aliases, never real UUIDs. */
    public OverviewResponse validateProviderDocument(String content, Map<String, String> sourceAliases) {
        return validateProviderDocument(content, sourceAliases, null);
    }

    OverviewResponse validateProviderDocument(String content, Map<String, String> sourceAliases,
                                             Consumer<ValidationDiagnostic> diagnostics) {
        return validateProviderDocumentWithAliasPolicy(content, sourceAliases, diagnostics, false);
    }

    /** Validates a private intermediate document while deferring only final-output capacity limits. */
    OverviewResponse validateProviderDocumentWithoutOutputLimits(String content,
                                                                 Map<String, String> sourceAliases,
                                                                 Consumer<ValidationDiagnostic> diagnostics) {
        return validateProviderDocument(content, sourceAliases, diagnostics, false, false, false);
    }

    /** Private INDEX/ROUTE parsing defers alias authorization; final document caps apply after assembly. */
    OverviewResponse validateProviderDocumentForIndexCoverage(String content,
                                                              Consumer<ValidationDiagnostic> diagnostics,
                                                              boolean repairDisplacedSummary) {
        return validateProviderDocument(content, Map.of(), diagnostics, true, repairDisplacedSummary, false);
    }

    /** Returns the canonical strict JSON root for the role-aware index parser, preserving its narrow recovery path. */
    String projectAdaptiveIndexRootForRoleParsing(String content, boolean repairDisplacedSummary) {
        ParsedJson parsedJson = jsonOnly(content, null);
        try {
            JsonNode root;
            try {
                root = objectMapper.reader().with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                        .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(parsedJson.text());
            } catch (Exception initialReadFailure) {
                if (!repairDisplacedSummary) throw initialReadFailure;
                root = repairDisplacedSummary(parsedJson.text(), initialReadFailure);
            }
            if (root == null || !root.isObject()) throw invalid("adaptive index JSON must be an object");
            if (!root.has("summary")) ((ObjectNode) root).putNull("summary");
            return objectMapper.writeValueAsString(root);
        } catch (DomainException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalid("adaptive index JSON is malformed");
        }
    }

    OverviewResponse validateProviderDocument(String content, Map<String, String> sourceAliases,
                                             Consumer<ValidationDiagnostic> diagnostics,
                                             boolean repairDisplacedSummary) {
        return validateProviderDocument(content, sourceAliases, diagnostics, false, repairDisplacedSummary);
    }

    private OverviewResponse validateProviderDocumentWithAliasPolicy(String content, Map<String, String> sourceAliases,
                                                                     Consumer<ValidationDiagnostic> diagnostics,
                                                                     boolean deferAliasValidation) {
        return validateProviderDocument(content, sourceAliases, diagnostics, deferAliasValidation, false);
    }

    private OverviewResponse validateProviderDocument(String content, Map<String, String> sourceAliases,
                                                      Consumer<ValidationDiagnostic> diagnostics,
                                                      boolean deferAliasValidation,
                                                      boolean repairDisplacedSummary) {
        return validateProviderDocument(content, sourceAliases, diagnostics, deferAliasValidation,
                repairDisplacedSummary, true);
    }

    private OverviewResponse validateProviderDocument(String content, Map<String, String> sourceAliases,
                                                      Consumer<ValidationDiagnostic> diagnostics,
                                                      boolean deferAliasValidation,
                                                      boolean repairDisplacedSummary,
                                                      boolean enforceOutputLimits) {
        if (enforceOutputLimits && exceeds(limits.maxResultChars(), content == null ? 0 : content.length())) {
            throw invalid("overview serialized result exceeds the configured size limit");
        }
        ParsedJson parsedJson = jsonOnly(content, diagnostics);
        OverviewResponse response;
        try {
            JsonNode root;
            try {
                root = objectMapper.readTree(parsedJson.text());
            } catch (Exception initialReadFailure) {
                if (!repairDisplacedSummary) throw initialReadFailure;
                root = repairDisplacedSummary(parsedJson.text(), initialReadFailure);
            }
            if (root == null || !root.isObject()) {
                throw invalid("overview JSON must be an object");
            }
            ObjectNode canonical = objectMapper.createObjectNode();
            for (String field : List.of("schemaVersion", "title", "outline", "summary")) {
                JsonNode value = root.get(field);
                if (value != null) canonical.set(field, value);
            }
            response = objectMapper.readValue(objectMapper.writeValueAsString(canonical), OverviewResponse.class);
        } catch (DomainException exception) {
            throw exception;
        } catch (Exception exception) {
            report(diagnostics, ValidationReason.JACKSON_READ_FAILURE, exception, content,
                    parsedJson.text(), parsedJson.wrapper());
            throw invalid("overview JSON is malformed");
        }
        try {
            return validate(response, sourceAliases == null ? Map.of() : sourceAliases, deferAliasValidation,
                    enforceOutputLimits);
        } catch (DomainException exception) {
            report(diagnostics, ValidationReason.SCHEMA_VALIDATION_FAILURE, exception, content,
                    parsedJson.text(), parsedJson.wrapper());
            throw exception;
        } catch (Exception exception) {
            report(diagnostics, ValidationReason.SCHEMA_VALIDATION_FAILURE, exception, content,
                    parsedJson.text(), parsedJson.wrapper());
            throw invalid("overview JSON is malformed");
        }
    }

    private JsonNode repairDisplacedSummary(String text, Exception initialReadFailure) throws Exception {
        try {
            JsonNode root;
            long rootEnd;
            var rootReader = objectMapper.reader()
                    .without(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION);
            try (JsonParser parser = rootReader.createParser(text)) {
                root = rootReader.readTree(parser);
                rootEnd = parser.currentLocation().getCharOffset();
            }
            if (root == null || !root.isObject() || root.has("summary")
                    || rootEnd <= 0 || rootEnd >= text.length()) {
                throw initialReadFailure;
            }
            String suffix = text.substring((int) rootEnd);
            if (!suffix.startsWith(",")) throw initialReadFailure;
            JsonNode wrapper = objectMapper.reader()
                    .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readTree("{" + suffix.substring(1));
            if (wrapper == null || !wrapper.isObject() || wrapper.size() != 1 || !wrapper.has("summary")) {
                throw initialReadFailure;
            }
            ObjectNode repaired = ((ObjectNode) root).deepCopy();
            repaired.set("summary", wrapper.get("summary"));
            return repaired;
        } catch (Exception candidateFailure) {
            throw initialReadFailure;
        }
    }

    String projectProviderDocumentForRepair(String content) {
        try {
            ParsedJson parsedJson = jsonOnly(content, null);
            JsonNode root = objectMapper.readTree(parsedJson.text());
            if (root == null || !root.isObject()) return content;
            ObjectNode canonical = objectMapper.createObjectNode();
            for (String field : List.of("schemaVersion", "title", "outline", "summary")) {
                JsonNode value = root.get(field);
                if (value != null) canonical.set(field, value);
            }
            return objectMapper.writeValueAsString(canonical);
        } catch (Exception ignored) {
            return content;
        }
    }

    enum ValidationReason {
        EMPTY_RESPONSE,
        INVALID_FENCE,
        INVALID_FENCE_LANGUAGE,
        NOT_JSON_OBJECT,
        JACKSON_READ_FAILURE,
        SCHEMA_VALIDATION_FAILURE
    }

    enum WrapperKind { PLAIN, FENCED, INVALID, UNKNOWN }

    enum ParserCategory { CONTROL_CHAR, INVALID_ESCAPE, UNEXPECTED_EOF, UNEXPECTED_CHAR, OTHER, UNKNOWN }

    enum OffsetCharacterClass {
        END_OF_INPUT, CONTROL, WHITESPACE, QUOTE, BACKSLASH, STRUCTURAL, DIGIT, LETTER, PUNCTUATION, NON_ASCII, UNKNOWN
    }

    record ValidationDiagnostic(ValidationReason reason, String exceptionType, int line, int column, long charOffset,
                                int responseChars, String responseSha256, int parseChars, String parseSha256,
                                WrapperKind wrapper, ParserCategory parserCategory,
                                OffsetCharacterClass offsetCharacterClass) {
    }

    private record ParsedJson(String text, WrapperKind wrapper) {
    }

    private void report(Consumer<ValidationDiagnostic> diagnostics, ValidationReason reason, Exception exception,
                        String response, String parseText, WrapperKind wrapper) {
        if (diagnostics == null) return;
        try {
            TokenStreamLocation location = exception instanceof JacksonException jacksonException
                    ? jacksonException.getLocation() : null;
            long offset = location == null ? -1 : location.getCharOffset();
            ValidationDiagnostic diagnostic = new ValidationDiagnostic(reason,
                    exception == null ? "none" : exception.getClass().getSimpleName(),
                    location == null ? -1 : location.getLineNr(),
                    location == null ? -1 : location.getColumnNr(), offset,
                    response == null ? -1 : response.length(), sha256(response),
                    parseText == null ? -1 : parseText.length(), sha256(parseText),
                    wrapper == null ? WrapperKind.UNKNOWN : wrapper,
                    parserCategory(reason, exception),
                    offsetCharacterClass(parseText, offset));
            diagnostics.accept(diagnostic);
        } catch (Exception ignored) {
            // Diagnostics must never change validation behavior.
        }
    }

    private ParserCategory parserCategory(ValidationReason reason, Exception exception) {
        if (reason != ValidationReason.JACKSON_READ_FAILURE || !(exception instanceof JacksonException)) {
            return ParserCategory.UNKNOWN;
        }
        String message = exception.getMessage();
        String safeMessage = message == null ? ""
                : message.substring(0, Math.min(message.length(), 512)).toLowerCase(Locale.ROOT);
        if (safeMessage.contains("control character") || safeMessage.contains("unquoted control")
                || safeMessage.contains("ctrl-char")) {
            return ParserCategory.CONTROL_CHAR;
        }
        if (safeMessage.contains("escape") && (safeMessage.contains("unrecognized")
                || safeMessage.contains("invalid") || safeMessage.contains("expected"))) {
            return ParserCategory.INVALID_ESCAPE;
        }
        if (safeMessage.contains("end-of-input") || safeMessage.contains("end of input")
                || safeMessage.contains("unexpected eof")) {
            return ParserCategory.UNEXPECTED_EOF;
        }
        if (safeMessage.contains("unexpected character") || safeMessage.contains("unexpected token")
                || safeMessage.contains("unrecognized token")) {
            return ParserCategory.UNEXPECTED_CHAR;
        }
        return message == null ? ParserCategory.UNKNOWN : ParserCategory.OTHER;
    }

    private OffsetCharacterClass offsetCharacterClass(String text, long offset) {
        if (text == null || offset < 0 || offset > text.length()) return OffsetCharacterClass.UNKNOWN;
        if (offset == text.length()) return OffsetCharacterClass.END_OF_INPUT;
        char value = text.charAt((int) offset);
        if (Character.isISOControl(value)) return OffsetCharacterClass.CONTROL;
        if (Character.isWhitespace(value)) return OffsetCharacterClass.WHITESPACE;
        if (value == '"' || value == '\'') return OffsetCharacterClass.QUOTE;
        if (value == '\\') return OffsetCharacterClass.BACKSLASH;
        if ("{}[],:".indexOf(value) >= 0) return OffsetCharacterClass.STRUCTURAL;
        if (Character.isDigit(value)) return OffsetCharacterClass.DIGIT;
        if (Character.isLetter(value)) return OffsetCharacterClass.LETTER;
        if (value > 0x7f) return OffsetCharacterClass.NON_ASCII;
        return OffsetCharacterClass.PUNCTUATION;
    }

    private String sha256(String value) {
        if (value == null) return "UNKNOWN";
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | RuntimeException ignored) {
            return "UNKNOWN";
        }
    }

    /** Maps aliases only at the trust boundary immediately before returning to the client. */
    public OverviewResponse mapAliasesToSourceIds(OverviewResponse response, Map<String, String> sourceAliases) {
        if (response == null || sourceAliases == null) {
            throw invalid("overview mapping input is invalid");
        }
        List<OverviewChapter> outline = response.outline() == null ? null : response.outline().stream()
                .map(chapter -> new OverviewChapter(chapter.title(), chapter.sections().stream()
                        .map(section -> new OverviewSection(section.title(), section.summary(), section.sourceIds().stream()
                                .map(alias -> {
                                    String sourceId = sourceAliases.get(alias);
                                    if (sourceId == null) {
                                        throw invalid("overview contains an unknown source alias");
                                    }
                                    return sourceId;
                                }).toList(), null)).toList()))
                .toList();
        return new OverviewResponse(response.schemaVersion(), response.title(), outline, response.summary(),
                response.outlineProvenance());
    }

    private OverviewResponse validate(OverviewResponse response, Map<String, String> sourceAliases,
                                      boolean deferAliasValidation, boolean enforceOutputLimits) {
        if (response == null || response.schemaVersion() != 1) {
            throw invalid("overview schemaVersion must be 1");
        }
        requireText(response.title(), "title", enforceOutputLimits ? limits.maxTitleChars() : 0);
        List<OverviewChapter> outline = response.outline() == null ? null
                : validateOutline(response.outline(), sourceAliases, deferAliasValidation, enforceOutputLimits);
        OverviewSummary summary = response.summary() == null ? null : validateSummary(response.summary(), enforceOutputLimits);
        if (outline == null && summary == null) {
            throw invalid("overview must contain an outline or summary");
        }
        return new OverviewResponse(1, response.title().trim(), outline, summary);
    }

    private List<OverviewChapter> validateOutline(List<OverviewChapter> chapters, Map<String, String> sourceAliases,
                                                   boolean deferAliasValidation, boolean enforceOutputLimits) {
        if (enforceOutputLimits && exceeds(limits.maxChapters(), chapters.size())) {
            throw invalid("overview has too many chapters");
        }
        int sectionCount = 0;
        List<OverviewChapter> safeChapters = new ArrayList<>(chapters.size());
        for (OverviewChapter chapter : chapters) {
            if (chapter == null || chapter.sections() == null) {
                throw invalid("overview chapter sections are required");
            }
            requireText(chapter.title(), "chapter title", enforceOutputLimits ? limits.maxTitleChars() : 0);
            List<OverviewSection> safeSections = new ArrayList<>(chapter.sections().size());
            for (OverviewSection section : chapter.sections()) {
                if (section == null) {
                    throw invalid("overview has too many or invalid sections");
                }
                sectionCount++;
                if (enforceOutputLimits && exceeds(limits.maxSections(), sectionCount)) {
                    throw invalid("overview has too many or invalid sections");
                }
                requireText(section.title(), "section title", enforceOutputLimits ? limits.maxTitleChars() : 0);
                requireText(section.summary(), "section summary", enforceOutputLimits ? limits.maxProseChars() : 0);
                if ((!deferAliasValidation && (section.sourceIds() == null || section.sourceIds().isEmpty()))
                        || (enforceOutputLimits && section.sourceIds() != null
                        && exceeds(limits.maxSourceIdsPerSection(), section.sourceIds().size()))) {
                    throw invalid("section sourceIds are required or too numerous");
                }
                List<String> aliases = section.sourceIds() == null ? new ArrayList<>()
                        : new ArrayList<>(section.sourceIds().size());
                Set<String> seen = new HashSet<>();
                if (section.sourceIds() != null) {
                    for (String alias : section.sourceIds()) {
                        if (alias == null || (!deferAliasValidation
                                && (!sourceAliases.containsKey(alias) || !seen.add(alias)))) {
                            throw invalid("overview contains an unknown or duplicate source alias");
                        }
                        aliases.add(alias);
                    }
                }
                // Current source chunks do not carry a trusted page/block locator.
                if (section.locator() != null) {
                    throw invalid("locator is not available for generated overviews");
                }
                safeSections.add(new OverviewSection(section.title().trim(), section.summary().trim(),
                        List.copyOf(aliases), null));
            }
            safeChapters.add(new OverviewChapter(chapter.title().trim(), List.copyOf(safeSections)));
        }
        return List.copyOf(safeChapters);
    }

    private OverviewSummary validateSummary(OverviewSummary summary, boolean enforceOutputLimits) {
        if (summary == null) {
            throw invalid("summary is invalid");
        }
        requireText(summary.overview(), "summary overview", enforceOutputLimits ? limits.maxProseChars() : 0);
        List<String> keyPoints = validateStrings(summary.keyPoints(), "keyPoints", enforceOutputLimits);
        List<String> learningPath = validateStrings(summary.learningPath(), "learningPath", enforceOutputLimits);
        return new OverviewSummary(summary.overview().trim(), keyPoints, learningPath);
    }

    private List<String> validateStrings(List<String> values, String field, boolean enforceOutputLimits) {
        if (values == null || enforceOutputLimits && exceeds(limits.maxGuideItems(), values.size())) {
            throw invalid(field + " has an invalid number of entries");
        }
        List<String> safe = new ArrayList<>(values.size());
        for (String value : values) {
            requireText(value, field + " entry", enforceOutputLimits ? limits.maxProseChars() : 0);
            safe.add(value.trim());
        }
        return List.copyOf(safe);
    }

    private static boolean exceeds(long maximum, long actual) {
        return maximum > 0 && actual > maximum;
    }

    private ParsedJson jsonOnly(String content, Consumer<ValidationDiagnostic> diagnostics) {
        if (content == null || content.isBlank()) {
            report(diagnostics, ValidationReason.EMPTY_RESPONSE, null, content, null, WrapperKind.INVALID);
            throw invalid("overview provider response is blank");
        }
        String trimmed = content.trim();
        if (trimmed.startsWith("```")) {
            int firstBreak = trimmed.indexOf('\n');
            if (firstBreak < 0 || !trimmed.endsWith("\n```")) {
                report(diagnostics, ValidationReason.INVALID_FENCE, null, content, null, WrapperKind.INVALID);
                throw invalid("overview provider response must contain exactly one JSON block");
            }
            String language = trimmed.substring(3, firstBreak).trim();
            if (!language.isEmpty() && !"json".equalsIgnoreCase(language)) {
                report(diagnostics, ValidationReason.INVALID_FENCE_LANGUAGE, null, content, null, WrapperKind.INVALID);
                throw invalid("overview provider response fence must be JSON");
            }
            String body = trimmed.substring(firstBreak + 1, trimmed.length() - 4).trim();
            if (!body.startsWith("{") || !body.endsWith("}")) {
                report(diagnostics, ValidationReason.NOT_JSON_OBJECT, null, content, null, WrapperKind.INVALID);
                throw invalid("overview provider response must be a JSON object");
            }
            return new ParsedJson(body, WrapperKind.FENCED);
        }
        if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
            report(diagnostics, ValidationReason.NOT_JSON_OBJECT, null, content, null, WrapperKind.INVALID);
            throw invalid("overview provider response must be a JSON object");
        }
        return new ParsedJson(trimmed, WrapperKind.PLAIN);
    }

    private void requireText(String value, String field, long maximum) {
        if (value == null || value.isBlank()
                || maximum > 0 && value.codePointCount(0, value.length()) > maximum) {
            throw invalid(field + " is invalid or exceeds its limit");
        }
    }

    private DomainException invalid(String detail) {
        return new DomainException("VALIDATION_FAILED", "Invalid overview document: " + detail);
    }
}
