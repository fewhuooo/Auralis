package com.auralis.app.ai.internal.chat;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.LongSupplier;
import java.util.function.LongFunction;
import java.util.function.Supplier;

/**
 * Incrementally parses the public Markdown and Auralis block protocol used by Chat.
 * This class does not call a model, persist records, or mark activities ready.
 */
public final class ChatStreamParser {

    private static final List<String> OPEN_MARKERS = List.of(
            ":::auralis-steps",
            ":::auralis-compare",
            ":::auralis-roadmap",
            ":::auralis-chart",
            ":::auralis-quiz",
            ":::auralis-question");
    private static final int LONGEST_MARKER_LENGTH = OPEN_MARKERS.stream()
            .mapToInt(String::length)
            .max()
            .orElseThrow();

    private final ObjectMapper objectMapper;
    private final Limits limits;
    private final Supplier<String> blockIdSupplier;
    private final LongSupplier sequenceSupplier;
    private final Consumer<PrivateReference> privateReferenceConsumer;

    private final StringBuilder bodyControlCandidate = new StringBuilder();
    private final StringBuilder fenceCloseCandidate = new StringBuilder();
    private final StringBuilder blockLine = new StringBuilder();

    private BlockState block;
    private char fenceCharacter;
    private long fenceLength;
    private boolean insideFence;
    private boolean bodyLinePassthrough;
    private boolean fenceLinePassthrough;
    private boolean discardBlockLine;
    private boolean pendingCarriageReturn;
    private boolean finished;
    private long previousSequence;

    public ChatStreamParser(
            ObjectMapper objectMapper,
            Limits limits,
            Supplier<String> blockIdSupplier,
            LongSupplier sequenceSupplier,
            Consumer<PrivateReference> privateReferenceConsumer) {
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.limits = Objects.requireNonNull(limits, "limits");
        this.blockIdSupplier = Objects.requireNonNull(blockIdSupplier, "blockIdSupplier");
        this.sequenceSupplier = Objects.requireNonNull(sequenceSupplier, "sequenceSupplier");
        this.privateReferenceConsumer = Objects.requireNonNull(
                privateReferenceConsumer, "privateReferenceConsumer");
    }

    /** Accepts one arbitrary network fragment and returns the public events made ready by it. */
    public List<Event> feed(String fragment) {
        ensureOpen();
        Objects.requireNonNull(fragment, "fragment");
        Emission emission = new Emission();
        for (int index = 0; index < fragment.length(); index++) {
            acceptCharacter(fragment.charAt(index), emission);
        }
        emission.flushText();
        return List.copyOf(emission.events);
    }

    /** Finishes the stream, flushing body text and rejecting any unterminated component. */
    public List<Event> finish() {
        if (finished) {
            return List.of();
        }
        Emission emission = new Emission();
        if (pendingCarriageReturn) {
            pendingCarriageReturn = false;
            processLineEnding("\r", emission);
        }

        if (block == null) {
            finishBody(emission);
        }
        if (block != null) {
            if (!discardBlockLine && blockLine.length() > 0) {
                String finalLine = blockLine.toString();
                blockLine.setLength(0);
                processBlockLine(finalLine, "", emission);
            } else {
                blockLine.setLength(0);
                discardBlockLine = false;
            }
            if (block != null) {
                if (!block.invalid) {
                    fail(ErrorCode.MISSING_END_MARKER, emission);
                }
                clearBlock();
            }
        }

        finished = true;
        emission.flushText();
        return List.copyOf(emission.events);
    }

    /** Drops any partial state and starts a fresh parser stream. */
    public void reset() {
        bodyControlCandidate.setLength(0);
        fenceCloseCandidate.setLength(0);
        blockLine.setLength(0);
        block = null;
        fenceCharacter = '\0';
        fenceLength = 0;
        insideFence = false;
        bodyLinePassthrough = false;
        fenceLinePassthrough = false;
        discardBlockLine = false;
        pendingCarriageReturn = false;
        finished = false;
        previousSequence = 0;
    }

    private void acceptCharacter(char character, Emission emission) {
        if (pendingCarriageReturn) {
            pendingCarriageReturn = false;
            if (character == '\n') {
                processLineEnding("\r\n", emission);
                return;
            }
            processLineEnding("\r", emission);
        }
        if (character == '\r') {
            pendingCarriageReturn = true;
        } else if (character == '\n') {
            processLineEnding("\n", emission);
        } else if (block != null) {
            acceptBlockCharacter(character, emission);
        } else if (insideFence) {
            acceptFenceCharacter(character, emission);
        } else {
            acceptBodyCharacter(character, emission);
        }
    }

    private void acceptBodyCharacter(char character, Emission emission) {
        if (bodyLinePassthrough) {
            emission.text.append(character);
            return;
        }

        FenceRun currentFenceRun = fenceRun(bodyControlCandidate);
        if (currentFenceRun != null && character != currentFenceRun.character()) {
            beginFence(currentFenceRun, bodyControlCandidate.toString(), emission);
            emission.text.append(character);
            fenceLinePassthrough = true;
            return;
        }

        bodyControlCandidate.append(character);
        if (bodyControlCandidate.length() > limits.maxControlLineChars()) {
            emission.text.append(bodyControlCandidate);
            bodyControlCandidate.setLength(0);
            bodyLinePassthrough = true;
            return;
        }
        if (!isPotentialBodyControlPrefix(bodyControlCandidate)) {
            emission.text.append(bodyControlCandidate);
            bodyControlCandidate.setLength(0);
            bodyLinePassthrough = true;
        }
    }

    private void acceptFenceCharacter(char character, Emission emission) {
        if (fenceLinePassthrough) {
            emission.text.append(character);
            return;
        }

        fenceCloseCandidate.append(character);
        if (fenceCloseCandidate.length() > limits.maxControlLineChars()
                || !canStillBeFenceClose(fenceCloseCandidate)) {
            emission.text.append(fenceCloseCandidate);
            fenceCloseCandidate.setLength(0);
            fenceLinePassthrough = true;
        }
    }

    private void acceptBlockCharacter(char character, Emission emission) {
        if (discardBlockLine) {
            return;
        }
        if (blockLine.length() >= limits.maxLineChars()
                || block.totalChars + blockLine.length() + 1L > limits.maxBlockChars()) {
            fail(ErrorCode.RESOURCE_LIMIT_EXCEEDED, emission);
            blockLine.setLength(0);
            discardBlockLine = true;
            return;
        }
        blockLine.append(character);
    }

    private void processLineEnding(String ending, Emission emission) {
        if (block != null) {
            if (discardBlockLine) {
                discardBlockLine = false;
                blockLine.setLength(0);
                return;
            }
            String line = blockLine.toString();
            blockLine.setLength(0);
            processBlockLine(line, ending, emission);
            return;
        }

        if (insideFence) {
            if (fenceLinePassthrough) {
                emission.text.append(ending);
                fenceLinePassthrough = false;
                return;
            }
            if (isFenceCloseLine(fenceCloseCandidate)) {
                insideFence = false;
                fenceCharacter = '\0';
                fenceLength = 0;
            }
            emission.text.append(fenceCloseCandidate).append(ending);
            fenceCloseCandidate.setLength(0);
            return;
        }

        if (bodyLinePassthrough) {
            emission.text.append(ending);
            bodyLinePassthrough = false;
            return;
        }

        String candidate = bodyControlCandidate.toString();
        bodyControlCandidate.setLength(0);
        FenceRun openingFence = fenceRun(candidate);
        if (openingFence != null) {
            beginFence(openingFence, candidate, emission);
            emission.text.append(ending);
            fenceLinePassthrough = false;
            return;
        }
        Component opening = openingComponent(candidate);
        if (opening != null) {
            startBlock(opening, emission);
            return;
        }
        emission.text.append(candidate).append(ending);
    }

    private void finishBody(Emission emission) {
        if (insideFence) {
            if (!fenceLinePassthrough && fenceCloseCandidate.length() > 0) {
                if (isFenceCloseLine(fenceCloseCandidate)) {
                    insideFence = false;
                    fenceCharacter = '\0';
                    fenceLength = 0;
                }
                emission.text.append(fenceCloseCandidate);
                fenceCloseCandidate.setLength(0);
            }
            return;
        }
        if (bodyLinePassthrough || bodyControlCandidate.length() == 0) {
            return;
        }

        String candidate = bodyControlCandidate.toString();
        bodyControlCandidate.setLength(0);
        FenceRun openingFence = fenceRun(candidate);
        if (openingFence != null) {
            beginFence(openingFence, candidate, emission);
            return;
        }
        Component opening = openingComponent(candidate);
        if (opening != null) {
            startBlock(opening, emission);
        } else {
            emission.text.append(candidate);
        }
    }

    private void beginFence(FenceRun opening, String prefix, Emission emission) {
        emission.text.append(prefix);
        bodyControlCandidate.setLength(0);
        insideFence = true;
        fenceCharacter = opening.character();
        fenceLength = opening.length();
        fenceCloseCandidate.setLength(0);
    }

    private void startBlock(Component component, Emission emission) {
        String blockId = Objects.requireNonNull(blockIdSupplier.get(), "blockIdSupplier returned null");
        if (blockId.isBlank()) {
            throw new IllegalStateException("blockIdSupplier returned a blank id");
        }
        block = new BlockState(blockId, component);
        bodyControlCandidate.setLength(0);
        bodyLinePassthrough = false;
        emit(sequence -> new BlockStarted(sequence, blockId, component), emission);
    }

    private void processBlockLine(String line, String ending, Emission emission) {
        if (isControlLine(line, ":::")) {
            closeBlock(emission);
            return;
        }

        if (block.invalid) {
            if (isObviousProse(line)) {
                recoverAsBody(line, ending, emission);
            }
            return;
        }

        if (line.isBlank()) {
            countBlockLine(line, ending, emission);
            return;
        }

        JsonNode row;
        try {
            row = objectMapper.reader()
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readTree(line);
        } catch (JacksonException exception) {
            fail(ErrorCode.INVALID_JSON, emission);
            if (isObviousProse(line)) {
                recoverAsBody(line, ending, emission);
            } else {
                countBlockLine(line, ending, emission);
            }
            return;
        }
        if (row == null || !row.isObject()) {
            fail(ErrorCode.INVALID_ROW, emission);
            countBlockLine(line, ending, emission);
            return;
        }

        countBlockLine(line, ending, emission);
        if (block.invalid) {
            return;
        }
        block.rowCount++;
        if (block.rowCount > limits.maxRows()) {
            fail(ErrorCode.RESOURCE_LIMIT_EXCEEDED, emission);
            return;
        }
        try {
            parseRow(row, emission);
        } catch (InvalidRowException exception) {
            fail(exception.code, emission);
        }
    }

    private void countBlockLine(String line, String ending, Emission emission) {
        block.totalChars += (long) line.length() + ending.length();
        if (block.totalChars > limits.maxBlockChars()) {
            fail(ErrorCode.RESOURCE_LIMIT_EXCEEDED, emission);
        }
    }

    private void parseRow(JsonNode row, Emission emission) {
        if (block.referenceSeen) {
            throw invalid(ErrorCode.UNEXPECTED_ROW);
        }
        String type = requiredText(row, "type");
        switch (block.component) {
            case STEPS, COMPARE, ROADMAP, CHART -> parseDescriptiveRow(type, row, emission);
            case QUIZ -> parseQuizRow(type, row, emission);
            case QUESTION -> parseQuestionRow(type, row, emission);
        }
    }

    private void parseDescriptiveRow(String type, JsonNode row, Emission emission) {
        if ("meta".equals(type)) {
            if (block.meta != null || block.itemCount > 0) {
                throw invalid(ErrorCode.UNEXPECTED_ROW);
            }
            LinkedHashMap<String, Object> projected = new LinkedHashMap<>();
            projected.put("type", "meta");
            projected.put("title", requiredText(row, "title"));
            putOptionalText(row, projected, "description");
            if (block.component == Component.CHART) {
                String chartType = requiredText(row, "chartType");
                if (!Set.of("bar", "proportion").contains(chartType)) {
                    throw invalid(ErrorCode.INVALID_ROW);
                }
                projected.put("chartType", chartType);
                putOptionalText(row, projected, "unit");
                block.chartType = chartType;
            }
            block.meta = immutableMap(projected);
            addPublicRow(block.meta, emission);
            return;
        }
        if (!"item".equals(type) || block.meta == null) {
            throw invalid(ErrorCode.UNEXPECTED_ROW);
        }

        LinkedHashMap<String, Object> projected = new LinkedHashMap<>();
        projected.put("type", "item");
        switch (block.component) {
            case STEPS, COMPARE -> {
                projected.put("title", requiredText(row, "title"));
                putOptionalText(row, projected, "description");
            }
            case ROADMAP -> {
                projected.put("title", requiredText(row, "title"));
                putOptionalText(row, projected, "description");
                putOptionalText(row, projected, "tag");
                putOptionalBoolean(row, projected, "current");
            }
            case CHART -> {
                projected.put("label", requiredText(row, "label"));
                JsonNode value = row.get("value");
                if (value == null || !value.isNumber()) {
                    throw invalid(ErrorCode.INVALID_ROW);
                }
                BigDecimal number = value.decimalValue();
                double asDouble = number.doubleValue();
                if (number.signum() < 0 || !Double.isFinite(asDouble)) {
                    throw invalid(ErrorCode.INVALID_ROW);
                }
                projected.put("value", number);
                block.chartTotal = block.chartTotal.add(number);
            }
            case QUIZ, QUESTION -> throw invalid(ErrorCode.UNEXPECTED_ROW);
        }
        block.itemCount++;
        addPublicRow(immutableMap(projected), emission);
    }

    private void parseQuizRow(String type, JsonNode row, Emission emission) {
        switch (type) {
            case "stem" -> {
                if (block.quizQuestionType != null) {
                    throw invalid(ErrorCode.UNEXPECTED_ROW);
                }
                String questionType = requiredText(row, "questionType");
                if (!Set.of("single", "multiple").contains(questionType)) {
                    throw invalid(ErrorCode.INVALID_ROW);
                }
                LinkedHashMap<String, Object> projected = new LinkedHashMap<>();
                projected.put("type", "stem");
                projected.put("questionType", questionType);
                projected.put("question", requiredText(row, "question"));
                block.quizQuestionType = questionType;
                addPublicRow(immutableMap(projected), emission);
            }
            case "option" -> {
                if (block.quizQuestionType == null) {
                    throw invalid(ErrorCode.UNEXPECTED_ROW);
                }
                String key = requiredText(row, "key");
                if (!block.optionKeys.add(key)) {
                    throw invalid(ErrorCode.INVALID_ROW);
                }
                LinkedHashMap<String, Object> projected = new LinkedHashMap<>();
                projected.put("type", "option");
                projected.put("key", key);
                projected.put("text", requiredText(row, "text"));
                addPublicRow(immutableMap(projected), emission);
            }
            case "reference" -> parseQuizReference(row);
            default -> throw invalid(ErrorCode.UNEXPECTED_ROW);
        }
    }

    private void parseQuizReference(JsonNode row) {
        if (block.quizReference != null || block.quizQuestionType == null || block.optionKeys.size() < 2) {
            throw invalid(ErrorCode.INVALID_REFERENCE);
        }
        JsonNode answerNode = row.get("answer");
        if (answerNode == null || !answerNode.isArray() || answerNode.size() == 0) {
            throw invalid(ErrorCode.INVALID_REFERENCE);
        }
        List<String> answerKeys = new ArrayList<>();
        Set<String> uniqueAnswers = new LinkedHashSet<>();
        for (JsonNode answer : answerNode) {
            if (!answer.isTextual() || answer.textValue().isBlank()
                    || !uniqueAnswers.add(answer.textValue())
                    || !block.optionKeys.contains(answer.textValue())) {
                throw invalid(ErrorCode.INVALID_REFERENCE);
            }
            answerKeys.add(answer.textValue());
        }
        if ("single".equals(block.quizQuestionType) && answerKeys.size() != 1) {
            throw invalid(ErrorCode.INVALID_REFERENCE);
        }
        String explanation = optionalText(row, "explanation");
        block.quizReference = new QuizReference(block.id, answerKeys, Optional.ofNullable(explanation));
        block.referenceSeen = true;
    }

    private void parseQuestionRow(String type, JsonNode row, Emission emission) {
        switch (type) {
            case "stem" -> {
                if (block.questionSeen) {
                    throw invalid(ErrorCode.UNEXPECTED_ROW);
                }
                LinkedHashMap<String, Object> projected = new LinkedHashMap<>();
                projected.put("type", "stem");
                projected.put("question", requiredText(row, "question"));
                putOptionalText(row, projected, "placeholder");
                block.questionSeen = true;
                addPublicRow(immutableMap(projected), emission);
            }
            case "reference" -> parseQuestionReference(row);
            default -> throw invalid(ErrorCode.UNEXPECTED_ROW);
        }
    }

    private void parseQuestionReference(JsonNode row) {
        if (block.questionReference != null) {
            throw invalid(ErrorCode.INVALID_REFERENCE);
        }
        JsonNode pointsNode = row.get("points");
        JsonNode answerNode = row.get("answer");
        if ((pointsNode == null) == (answerNode == null)) {
            throw invalid(ErrorCode.INVALID_REFERENCE);
        }

        List<String> points = new ArrayList<>();
        String answer = null;
        if (pointsNode != null) {
            if (!pointsNode.isArray() || pointsNode.size() == 0) {
                throw invalid(ErrorCode.INVALID_REFERENCE);
            }
            for (JsonNode point : pointsNode) {
                if (!point.isTextual() || point.textValue().isBlank()) {
                    throw invalid(ErrorCode.INVALID_REFERENCE);
                }
                points.add(point.textValue());
            }
        } else {
            if (!answerNode.isTextual() || answerNode.textValue().isBlank()) {
                throw invalid(ErrorCode.INVALID_REFERENCE);
            }
            answer = answerNode.textValue();
        }
        String explanation = optionalText(row, "explanation");
        block.questionReference = new QuestionReference(
                block.id, points, Optional.ofNullable(answer), Optional.ofNullable(explanation));
        block.referenceSeen = true;
    }

    private void addPublicRow(Map<String, Object> row, Emission emission) {
        block.publicRows.add(row);
        emit(sequence -> new BlockItem(sequence, block.id, block.component, row), emission);
    }

    private void closeBlock(Emission emission) {
        if (!block.invalid) {
            ErrorCode validationError = validateBlock();
            if (validationError != null) {
                fail(validationError, emission);
            }
        }
        if (!block.invalid) {
            BlockState completedBlock = block;
            PrivateReference reference = completedBlock.privateReference();
            if (reference != null) {
                privateReferenceConsumer.accept(reference);
            }
            emit(sequence -> new BlockCompleted(
                    sequence, completedBlock.id, completedBlock.component, completedBlock.publicRows), emission);
        }
        clearBlock();
    }

    private ErrorCode validateBlock() {
        return switch (block.component) {
            case STEPS, COMPARE, ROADMAP -> block.meta == null || block.itemCount == 0
                    ? ErrorCode.MISSING_REQUIRED_CONTENT
                    : null;
            case CHART -> block.meta == null || block.itemCount == 0
                    ? ErrorCode.MISSING_REQUIRED_CONTENT
                    : "proportion".equals(block.chartType) && block.chartTotal.signum() <= 0
                            ? ErrorCode.INVALID_COMPONENT
                            : null;
            case QUIZ -> block.quizQuestionType == null || block.optionKeys.size() < 2
                    || block.quizReference == null
                    ? ErrorCode.MISSING_REQUIRED_CONTENT
                    : null;
            case QUESTION -> block.questionSeen ? null : ErrorCode.MISSING_REQUIRED_CONTENT;
        };
    }

    private void recoverAsBody(String line, String ending, Emission emission) {
        block = null;
        blockLine.setLength(0);
        discardBlockLine = false;
        for (int index = 0; index < line.length(); index++) {
            acceptBodyCharacter(line.charAt(index), emission);
        }
        if (!ending.isEmpty()) {
            processLineEnding(ending, emission);
        }
    }

    private void fail(ErrorCode code, Emission emission) {
        if (block == null) {
            return;
        }
        block.invalid = true;
        if (!block.errorEmitted) {
            block.errorEmitted = true;
            emit(sequence -> new BlockError(sequence, block.id, block.component, code), emission);
        }
    }

    private void clearBlock() {
        block = null;
        blockLine.setLength(0);
        discardBlockLine = false;
    }

    private boolean isPotentialBodyControlPrefix(CharSequence candidate) {
        int indentLength = leadingSpaceCount(candidate);
        if (indentLength > 3) {
            return false;
        }
        CharSequence markerCandidate = candidate.subSequence(indentLength, candidate.length());
        if (markerCandidate.length() == 0) {
            return true;
        }
        String current = markerCandidate.toString();
        for (String marker : OPEN_MARKERS) {
            if (marker.startsWith(current)) {
                return true;
            }
            if (current.startsWith(marker) && onlyHorizontalWhitespace(current, marker.length())) {
                return true;
            }
        }
        return fenceRun(candidate) != null || isPotentialFencePrefix(candidate);
    }

    private static int leadingSpaceCount(CharSequence text) {
        int index = 0;
        while (index < text.length() && text.charAt(index) == ' ') {
            index++;
        }
        return index;
    }

    private static boolean onlyHorizontalWhitespace(CharSequence text, int start) {
        for (int index = start; index < text.length(); index++) {
            char character = text.charAt(index);
            if (character != ' ' && character != '\t') {
                return false;
            }
        }
        return true;
    }

    private static Component openingComponent(String line) {
        String marker = normalizedControlLine(line);
        for (Component component : Component.values()) {
            if (component.marker.equals(marker)) {
                return component;
            }
        }
        return null;
    }

    private static boolean isControlLine(String line, String marker) {
        return marker.equals(normalizedControlLine(line));
    }

    private static String normalizedControlLine(String line) {
        int indent = 0;
        while (indent < line.length() && line.charAt(indent) == ' ' && indent < 4) {
            indent++;
        }
        if (indent > 3) {
            return "";
        }
        int end = line.length();
        while (end > indent && (line.charAt(end - 1) == ' ' || line.charAt(end - 1) == '\t')) {
            end--;
        }
        return line.substring(indent, end);
    }

    private FenceRun fenceRun(CharSequence text) {
        int indent = leadingSpaceCount(text);
        if (indent > 3 || indent >= text.length()) {
            return null;
        }
        char fence = text.charAt(indent);
        if (fence != '`' && fence != '~') {
            return null;
        }
        int end = indent;
        while (end < text.length() && text.charAt(end) == fence) {
            end++;
        }
        if (end != text.length() || end - indent < 3) {
            return null;
        }
        if (text.length() > limits.maxControlLineChars()) {
            return null;
        }
        return new FenceRun(fence, end - indent);
    }

    private static boolean isPotentialFencePrefix(CharSequence text) {
        int indent = leadingSpaceCount(text);
        if (indent > 3) {
            return false;
        }
        if (indent == text.length()) {
            return true;
        }
        char fence = text.charAt(indent);
        if (fence != '`' && fence != '~') {
            return false;
        }
        int end = indent;
        while (end < text.length() && text.charAt(end) == fence) {
            end++;
        }
        return end == text.length() && end - indent < 3;
    }

    private boolean canStillBeFenceClose(CharSequence candidate) {
        int indent = leadingSpaceCount(candidate);
        if (indent > 3) {
            return false;
        }
        int index = indent;
        while (index < candidate.length() && candidate.charAt(index) == fenceCharacter) {
            index++;
        }
        if (index == indent) {
            return index == candidate.length();
        }
        if (index - indent < fenceLength) {
            return index == candidate.length();
        }
        return onlyHorizontalWhitespace(candidate, index);
    }

    private boolean isFenceCloseLine(CharSequence candidate) {
        int indent = leadingSpaceCount(candidate);
        if (indent > 3) {
            return false;
        }
        int index = indent;
        while (index < candidate.length() && candidate.charAt(index) == fenceCharacter) {
            index++;
        }
        return index - indent >= fenceLength && onlyHorizontalWhitespace(candidate, index);
    }

    private static boolean isObviousProse(String line) {
        String text = line.stripLeading();
        if (text.isEmpty() || text.startsWith(":::") || text.startsWith("{")
                || text.startsWith("[") || text.startsWith("\"")) {
            return false;
        }
        if (text.startsWith("#") || text.startsWith(">") || text.startsWith("* ")
                || text.startsWith("+ ") || text.startsWith("- ")) {
            return true;
        }
        return Character.isLetter(text.charAt(0));
    }

    private String requiredText(JsonNode row, String field) {
        JsonNode value = row.get(field);
        if (value == null || !value.isTextual() || value.textValue().isBlank()) {
            throw invalid(ErrorCode.INVALID_ROW);
        }
        return value.textValue();
    }

    private String optionalText(JsonNode row, String field) {
        JsonNode value = row.get(field);
        if (value == null) {
            return null;
        }
        if (!value.isTextual()) {
            throw invalid(ErrorCode.INVALID_ROW);
        }
        return value.textValue();
    }

    private void putOptionalText(JsonNode row, Map<String, Object> projected, String field) {
        String value = optionalText(row, field);
        if (value != null) {
            projected.put(field, value);
        }
    }

    private void putOptionalBoolean(JsonNode row, Map<String, Object> projected, String field) {
        JsonNode value = row.get(field);
        if (value == null) {
            return;
        }
        if (!value.isBoolean()) {
            throw invalid(ErrorCode.INVALID_ROW);
        }
        projected.put(field, value.booleanValue());
    }

    private static Map<String, Object> immutableMap(Map<String, Object> map) {
        return Collections.unmodifiableMap(new LinkedHashMap<>(map));
    }

    private InvalidRowException invalid(ErrorCode code) {
        return new InvalidRowException(code);
    }

    private long nextSequence() {
        long sequence = sequenceSupplier.getAsLong();
        if (sequence <= previousSequence || sequence <= 0) {
            throw new IllegalStateException("sequenceSupplier must return strictly increasing positive values");
        }
        previousSequence = sequence;
        return sequence;
    }

    private void emit(LongFunction<? extends Event> eventFactory, Emission emission) {
        emission.flushText();
        emission.events.add(eventFactory.apply(nextSequence()));
    }

    private void ensureOpen() {
        if (finished) {
            throw new IllegalStateException("parser is finished; call reset before feeding another stream");
        }
    }

    public enum Component {
        STEPS("steps"),
        COMPARE("compare"),
        ROADMAP("roadmap"),
        CHART("chart"),
        QUIZ("quiz"),
        QUESTION("question");

        private final String marker;

        Component(String marker) {
            this.marker = ":::auralis-" + marker;
        }
    }

    public enum ErrorCode {
        INVALID_JSON,
        INVALID_ROW,
        INVALID_REFERENCE,
        INVALID_COMPONENT,
        UNEXPECTED_ROW,
        MISSING_REQUIRED_CONTENT,
        RESOURCE_LIMIT_EXCEEDED,
        MISSING_END_MARKER
    }

    public record Limits(int maxLineChars, int maxBlockChars, int maxRows, int maxControlLineChars) {
        public Limits {
            if (maxLineChars <= 0 || maxBlockChars <= 0 || maxRows <= 0) {
                throw new IllegalArgumentException("line, block, and row limits must be positive");
            }
            if (maxControlLineChars < LONGEST_MARKER_LENGTH + 3) {
                throw new IllegalArgumentException("control line limit is too small for an indented block marker");
            }
        }
    }

    public sealed interface Event permits TextDelta, BlockStarted, BlockItem, BlockCompleted, BlockError {
        long sequence();
    }

    public record TextDelta(long sequence, String text) implements Event {
    }

    public record BlockStarted(long sequence, String blockId, Component component) implements Event {
    }

    public record BlockItem(
            long sequence, String blockId, Component component, Map<String, Object> row) implements Event {
    }

    public record BlockCompleted(
            long sequence, String blockId, Component component, List<Map<String, Object>> rows) implements Event {
        public BlockCompleted {
            rows = List.copyOf(rows);
        }
    }

    public record BlockError(long sequence, String blockId, Component component, ErrorCode code) implements Event {
    }

    public sealed interface PrivateReference permits QuizReference, QuestionReference {
        String blockId();
    }

    public record QuizReference(
            String blockId, List<String> answerKeys, Optional<String> explanation) implements PrivateReference {
        public QuizReference {
            answerKeys = List.copyOf(answerKeys);
            explanation = Objects.requireNonNull(explanation, "explanation");
        }
    }

    public record QuestionReference(
            String blockId,
            List<String> points,
            Optional<String> answer,
            Optional<String> explanation) implements PrivateReference {
        public QuestionReference {
            points = List.copyOf(points);
            answer = Objects.requireNonNull(answer, "answer");
            explanation = Objects.requireNonNull(explanation, "explanation");
        }
    }

    private record FenceRun(char character, long length) {
    }

    private static final class BlockState {
        private final String id;
        private final Component component;
        private final List<Map<String, Object>> publicRows = new ArrayList<>();
        private final Set<String> optionKeys = new LinkedHashSet<>();
        private long totalChars;
        private int rowCount;
        private int itemCount;
        private Map<String, Object> meta;
        private String chartType;
        private BigDecimal chartTotal = BigDecimal.ZERO;
        private String quizQuestionType;
        private QuizReference quizReference;
        private boolean questionSeen;
        private QuestionReference questionReference;
        private boolean referenceSeen;
        private boolean invalid;
        private boolean errorEmitted;

        private BlockState(String id, Component component) {
            this.id = id;
            this.component = component;
        }

        private PrivateReference privateReference() {
            return quizReference != null ? quizReference : questionReference;
        }
    }

    private static final class InvalidRowException extends RuntimeException {
        private final ErrorCode code;

        private InvalidRowException(ErrorCode code) {
            this.code = code;
        }
    }

    private final class Emission {
        private final List<Event> events = new ArrayList<>();
        private final StringBuilder text = new StringBuilder();

        private void flushText() {
            if (!text.isEmpty()) {
                events.add(new TextDelta(nextSequence(), text.toString()));
                text.setLength(0);
            }
        }
    }
}
