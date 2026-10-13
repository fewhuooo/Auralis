package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewLocator;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.OverviewSection;
import com.auralis.app.ai.OverviewDtos.OverviewSummary;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.core.TokenStreamLocation;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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

    public OverviewDocumentValidator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** Parses only plain JSON or one JSON fenced block. Returned IDs are aliases, never real UUIDs. */
    public OverviewResponse validateProviderDocument(String content, Map<String, String> sourceAliases) {
        return validateProviderDocument(content, sourceAliases, null);
    }

    OverviewResponse validateProviderDocument(String content, Map<String, String> sourceAliases,
                                             Consumer<ValidationDiagnostic> diagnostics) {
        String json = jsonOnly(content, diagnostics);
        OverviewResponse response;
        try {
            response = objectMapper.readValue(json, OverviewResponse.class);
        } catch (DomainException exception) {
            throw exception;
        } catch (Exception exception) {
            report(diagnostics, ValidationReason.JACKSON_READ_FAILURE, exception);
            throw invalid("overview JSON is malformed");
        }
        try {
            return validate(response, sourceAliases == null ? Map.of() : sourceAliases);
        } catch (DomainException exception) {
            report(diagnostics, ValidationReason.SCHEMA_VALIDATION_FAILURE, exception);
            throw exception;
        } catch (Exception exception) {
            report(diagnostics, ValidationReason.SCHEMA_VALIDATION_FAILURE, exception);
            throw invalid("overview JSON is malformed");
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

    record ValidationDiagnostic(ValidationReason reason, String exceptionType, int line, int column, long charOffset) {
    }

    private void report(Consumer<ValidationDiagnostic> diagnostics, ValidationReason reason, Exception exception) {
        if (diagnostics == null) return;
        TokenStreamLocation location = exception instanceof JacksonException jacksonException
                ? jacksonException.getLocation() : null;
        ValidationDiagnostic diagnostic = new ValidationDiagnostic(reason,
                exception == null ? "none" : exception.getClass().getSimpleName(),
                location == null ? -1 : location.getLineNr(),
                location == null ? -1 : location.getColumnNr(),
                location == null ? -1 : location.getCharOffset());
        try {
            diagnostics.accept(diagnostic);
        } catch (RuntimeException ignored) {
            // Diagnostics must never change validation behavior.
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
        return new OverviewResponse(response.schemaVersion(), response.title(), outline, response.summary());
    }

    private OverviewResponse validate(OverviewResponse response, Map<String, String> sourceAliases) {
        if (response == null || response.schemaVersion() != 1) {
            throw invalid("overview schemaVersion must be 1");
        }
        requireText(response.title(), "title", MAX_TITLE);
        List<OverviewChapter> outline = response.outline() == null ? null : validateOutline(response.outline(), sourceAliases);
        OverviewSummary summary = response.summary() == null ? null : validateSummary(response.summary());
        if (outline == null && summary == null) {
            throw invalid("overview must contain an outline or summary");
        }
        return new OverviewResponse(1, response.title().trim(), outline, summary);
    }

    private List<OverviewChapter> validateOutline(List<OverviewChapter> chapters, Map<String, String> sourceAliases) {
        if (chapters.size() > MAX_CHAPTERS) {
            throw invalid("overview has too many chapters");
        }
        int sectionCount = 0;
        List<OverviewChapter> safeChapters = new ArrayList<>(chapters.size());
        for (OverviewChapter chapter : chapters) {
            if (chapter == null || chapter.sections() == null) {
                throw invalid("overview chapter sections are required");
            }
            requireText(chapter.title(), "chapter title", MAX_TITLE);
            if (chapter.sections().size() > MAX_SECTIONS) {
                throw invalid("overview has too many sections");
            }
            List<OverviewSection> safeSections = new ArrayList<>(chapter.sections().size());
            for (OverviewSection section : chapter.sections()) {
                if (section == null || ++sectionCount > MAX_SECTIONS) {
                    throw invalid("overview has too many or invalid sections");
                }
                requireText(section.title(), "section title", MAX_TITLE);
                requireText(section.summary(), "section summary", MAX_PROSE);
                if (section.sourceIds() == null || section.sourceIds().isEmpty()
                        || section.sourceIds().size() > MAX_SOURCE_IDS_PER_SECTION) {
                    throw invalid("section sourceIds are required or too numerous");
                }
                List<String> aliases = new ArrayList<>(section.sourceIds().size());
                Set<String> seen = new HashSet<>();
                for (String alias : section.sourceIds()) {
                    if (alias == null || !sourceAliases.containsKey(alias) || !seen.add(alias)) {
                        throw invalid("overview contains an unknown or duplicate source alias");
                    }
                    aliases.add(alias);
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

    private OverviewSummary validateSummary(OverviewSummary summary) {
        if (summary == null) {
            throw invalid("summary is invalid");
        }
        requireText(summary.overview(), "summary overview", MAX_PROSE);
        List<String> keyPoints = validateStrings(summary.keyPoints(), "keyPoints", MAX_KEY_POINTS);
        List<String> learningPath = validateStrings(summary.learningPath(), "learningPath", MAX_KEY_POINTS);
        return new OverviewSummary(summary.overview().trim(), keyPoints, learningPath);
    }

    private List<String> validateStrings(List<String> values, String field, int maximum) {
        if (values == null || values.size() > maximum) {
            throw invalid(field + " has an invalid number of entries");
        }
        List<String> safe = new ArrayList<>(values.size());
        for (String value : values) {
            requireText(value, field + " entry", MAX_PROSE);
            safe.add(value.trim());
        }
        return List.copyOf(safe);
    }

    private String jsonOnly(String content, Consumer<ValidationDiagnostic> diagnostics) {
        if (content == null || content.isBlank()) {
            report(diagnostics, ValidationReason.EMPTY_RESPONSE, null);
            throw invalid("overview provider response is blank");
        }
        String trimmed = content.trim();
        if (trimmed.startsWith("```")) {
            int firstBreak = trimmed.indexOf('\n');
            if (firstBreak < 0 || !trimmed.endsWith("\n```")) {
                report(diagnostics, ValidationReason.INVALID_FENCE, null);
                throw invalid("overview provider response must contain exactly one JSON block");
            }
            String language = trimmed.substring(3, firstBreak).trim();
            if (!language.isEmpty() && !"json".equalsIgnoreCase(language)) {
                report(diagnostics, ValidationReason.INVALID_FENCE_LANGUAGE, null);
                throw invalid("overview provider response fence must be JSON");
            }
            String body = trimmed.substring(firstBreak + 1, trimmed.length() - 4).trim();
            if (!body.startsWith("{") || !body.endsWith("}")) {
                report(diagnostics, ValidationReason.NOT_JSON_OBJECT, null);
                throw invalid("overview provider response must be a JSON object");
            }
            return body;
        }
        if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
            report(diagnostics, ValidationReason.NOT_JSON_OBJECT, null);
            throw invalid("overview provider response must be a JSON object");
        }
        return trimmed;
    }

    private void requireText(String value, String field, int maximum) {
        if (value == null || value.isBlank() || value.codePointCount(0, value.length()) > maximum) {
            throw invalid(field + " is invalid or exceeds its limit");
        }
    }

    private DomainException invalid(String detail) {
        return new DomainException("VALIDATION_FAILED", "Invalid overview document: " + detail);
    }
}
