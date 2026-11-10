package com.auralis.app.ai.internal.chat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Linear-time collector for provider tool argument deltas. It recognizes only complete
 * top-level scalar fields and direct array child objects for preview. Final validation always
 * parses the complete root again under strict duplicate-key and allowlist rules.
 */
public final class DisplayToolStreamAssembler {
    private final ObjectMapper mapper;
    private final long maxUtf8Bytes;
    private final Consumer<Preview> previewSink;
    private final Map<Key, CallState> calls = new LinkedHashMap<>();

    public DisplayToolStreamAssembler(ObjectMapper mapper, long maxUtf8Bytes, Consumer<Preview> previewSink) {
        this.mapper = Objects.requireNonNull(mapper);
        this.maxUtf8Bytes = maxUtf8Bytes;
        this.previewSink = Objects.requireNonNull(previewSink);
    }

    public CallState accept(ToolCallProgress progress) {
        Key key = new Key(progress.responseId(), progress.index());
        CallState state = calls.computeIfAbsent(key, ignored -> new CallState(key, progress.callId()));
        state.accept(progress);
        return state;
    }

    public List<CallState> calls(String responseId) {
        return calls.values().stream().filter(value -> Objects.equals(value.key.responseId, responseId))
                .sorted(java.util.Comparator.comparingInt(value -> value.key.index)).toList();
    }

    public List<CallState> allCalls() {
        return calls.values().stream().sorted(java.util.Comparator.comparing(CallState::responseId)
                .thenComparingInt(CallState::index)).toList();
    }

    public final class CallState {
        private final Key key;
        private String callId;
        private String name;
        private final StringBuilder arguments = new StringBuilder();
        private long argumentBytes;
        private final StringBuilder currentString = new StringBuilder();
        private final List<Map<String, Object>> previewRows = new ArrayList<>();
        private final Map<String, Object> previewMeta = new LinkedHashMap<>();
        private final List<PendingPreview> pendingPreview = new ArrayList<>();
        private int position;
        private int tokenStart;
        private int containerCurly;
        private int containerSquare;
        private boolean rootOpened;
        private boolean rootClosed;
        private boolean inString;
        private boolean escaped;
        private boolean stringIsKey;
        private String activeKey;
        private Stage stage = Stage.ROOT;
        private int arrayCurly;
        private int arraySquare;
        private int arrayObjectStart = -1;
        private boolean arrayString;
        private boolean arrayEscape;
        private boolean oversized;
        private boolean malformedPreview;
        private String blockId;
        private DisplayComponent component;

        private CallState(Key key, String callId) { this.key = key; this.callId = callId; }

        private void accept(ToolCallProgress progress) {
            if (progress.callId() != null && !progress.callId().isBlank()) callId = progress.callId();
            if (progress.cumulativeName() != null && !progress.cumulativeName().isBlank()) {
                name = progress.cumulativeName();
                DisplayComponent found = DisplayToolRegistry.component(name);
                if (found != null && component == null) {
                    component = found;
                    blockId = java.util.UUID.randomUUID().toString();
                    previewSink.accept(new Preview(Kind.START, this, null));
                    for (PendingPreview pending : pendingPreview) {
                        if (pending.arrayObject) previewArrayObjectNow(pending.field, pending.raw);
                        else previewScalarNow(pending.field, pending.raw);
                    }
                    pendingPreview.clear();
                } else if (found == null && DisplayToolRegistry.isKnown(name)) {
                    pendingPreview.clear();
                } else if (found != null && found != component) {
                    malformedPreview = true;
                }
            }
            String delta = progress.argumentsDelta();
            if (delta == null || delta.isEmpty()) return;
            long deltaBytes = delta.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
            if (argumentBytes + deltaBytes > maxUtf8Bytes) {
                oversized = true;
                return;
            }
            int start = arguments.length();
            arguments.append(delta);
            argumentBytes += deltaBytes;
            scan(start);
        }

        private void scan(int appendedStart) {
            while (position < arguments.length()) {
                char ch = arguments.charAt(position);
                if (stage == Stage.ROOT) {
                    if (Character.isWhitespace(ch)) { position++; continue; }
                    if (!rootOpened && ch == '{') { rootOpened = true; position++; stage = Stage.KEY; continue; }
                    if (rootClosed) return;
                    malformedPreview = true; position++; continue;
                }
                if (stage == Stage.KEY) {
                    if (Character.isWhitespace(ch) || ch == ',') { position++; continue; }
                    if (ch == '}') { rootClosed = true; position++; stage = Stage.DONE; continue; }
                    if (ch != '"') { malformedPreview = true; position++; continue; }
                    tokenStart = position; currentString.setLength(0); inString = true; escaped = false;
                    stringIsKey = true; position++; stage = Stage.STRING_KEY;
                    continue;
                }
                if (stage == Stage.STRING_KEY || stage == Stage.STRING_VALUE) {
                    if (inString) {
                        if (escaped) { escaped = false; position++; continue; }
                        if (ch == '\\') { escaped = true; position++; continue; }
                        if (ch == '"') {
                            inString = false; position++;
                            if (stringIsKey) {
                                activeKey = decodeString(arguments.substring(tokenStart, position));
                                stage = Stage.COLON;
                            } else {
                                completeValue(arguments.substring(tokenStart, position));
                                stage = Stage.DELIMITER;
                            }
                            continue;
                        }
                        position++; continue;
                    }
                }
                if (stage == Stage.COLON) {
                    if (Character.isWhitespace(ch)) { position++; continue; }
                    if (ch != ':') { malformedPreview = true; position++; continue; }
                    position++; stage = Stage.VALUE; continue;
                }
                if (stage == Stage.VALUE) {
                    if (Character.isWhitespace(ch)) { position++; continue; }
                    tokenStart = position;
                    if (ch == '"') {
                        inString = true; escaped = false; stringIsKey = false;
                        stage = Stage.STRING_VALUE; position++; continue;
                    }
                    if (ch == '{' || ch == '[') {
                        containerCurly = ch == '{' ? 1 : 0;
                        containerSquare = ch == '[' ? 1 : 0;
                        arrayCurly = containerCurly; arraySquare = containerSquare;
                        arrayObjectStart = -1; arrayString = false; arrayEscape = false;
                        stage = Stage.CONTAINER; position++; continue;
                    }
                    stage = Stage.PRIMITIVE; continue;
                }
                if (stage == Stage.PRIMITIVE) {
                    if (ch == ',' || ch == '}') {
                        completeValue(arguments.substring(tokenStart, position));
                        stage = Stage.DELIMITER; continue;
                    }
                    position++; continue;
                }
                if (stage == Stage.CONTAINER) {
                    if (activeKey != null && (activeKey.equals("items") || activeKey.equals("options"))) {
                        scanArrayChildren(ch);
                    }
                    if (inString) {
                        if (escaped) escaped = false;
                        else if (ch == '\\') escaped = true;
                        else if (ch == '"') inString = false;
                        position++; continue;
                    }
                    if (ch == '"') { inString = true; position++; continue; }
                    if (ch == '{') containerCurly++;
                    else if (ch == '}') containerCurly--;
                    else if (ch == '[') containerSquare++;
                    else if (ch == ']') containerSquare--;
                    position++;
                    if (containerCurly == 0 && containerSquare == 0) {
                        completeValue(arguments.substring(tokenStart, position));
                        stage = Stage.DELIMITER;
                    }
                    continue;
                }
                if (stage == Stage.DELIMITER) {
                    if (Character.isWhitespace(ch)) { position++; continue; }
                    if (ch == ',') { position++; activeKey = null; stage = Stage.KEY; continue; }
                    if (ch == '}') { position++; rootClosed = true; stage = Stage.DONE; continue; }
                    malformedPreview = true; position++; continue;
                }
                return;
            }
        }

        private void scanArrayChildren(char ch) {
            if (arraySquare == 1 && arrayCurly == 0 && !arrayString && ch == '{') {
                arrayObjectStart = position;
            }
            if (arrayString) {
                if (arrayEscape) arrayEscape = false;
                else if (ch == '\\') arrayEscape = true;
                else if (ch == '"') arrayString = false;
                return;
            }
            if (ch == '"') { arrayString = true; return; }
            if (ch == '{') arrayCurly++;
            else if (ch == '}') {
                arrayCurly--;
                if (arraySquare == 1 && arrayCurly == 0 && arrayObjectStart >= 0) {
                    String child = arguments.substring(arrayObjectStart, position + 1);
                    previewArrayObject(child);
                    arrayObjectStart = -1;
                }
            } else if (ch == '[') arraySquare++;
            else if (ch == ']') arraySquare--;
        }

        private void completeValue(String raw) {
            if (activeKey == null || oversized || malformedPreview) return;
            if (activeKey.equals("items") || activeKey.equals("options")) return;
            if (!potentialScalar(activeKey)) return;
            if (component == null) {
                pendingPreview.add(new PendingPreview(activeKey, raw, false));
                return;
            }
            previewScalarNow(activeKey, raw);
        }

        private void previewScalarNow(String key, String raw) {
            try {
                JsonNode node = mapper.readTree(raw);
                if (!previewScalar(key, node)) return;
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("type", component.activity() ? "stem" : "meta");
                row.putAll(previewMeta);
                emitRow(row);
            } catch (Exception ignored) {
                malformedPreview = true;
            }
        }

        private boolean previewScalar(String key, JsonNode node) {
            SetFields fields = SetFields.forComponent(component);
            if (!fields.values.contains(key)) return false;
            Object value;
            if (key.equals("chartType") || key.equals("questionType") || key.equals("title")
                    || key.equals("description") || key.equals("unit") || key.equals("question") || key.equals("placeholder")) {
                if (!node.isString() || ((key.equals("title") || key.equals("question")) && node.stringValue().isBlank())) return false;
                value = node.stringValue();
                if (key.equals("chartType") && !List.of("bar", "proportion").contains(value)) return false;
                if (key.equals("questionType") && !List.of("single", "multiple").contains(value)) return false;
            } else return false;
            previewMeta.put(key, value);
            return true;
        }

        private void previewArrayObject(String raw) {
            if (oversized || malformedPreview) return;
            if (component == null) {
                if ("items".equals(activeKey) || "options".equals(activeKey)) {
                    pendingPreview.add(new PendingPreview(activeKey, raw, true));
                }
                return;
            }
            previewArrayObjectNow(activeKey, raw);
        }

        private void previewArrayObjectNow(String field, String raw) {
            try {
                JsonNode obj = mapper.readTree(raw);
                if (obj == null || !obj.isObject()) return;
                Map<String, Object> row = new LinkedHashMap<>();
                if (component == DisplayComponent.QUIZ && "options".equals(field)) {
                    if (!only(obj, "key", "text") || !text(obj, "key") || !text(obj, "text")) return;
                    row.put("type", "option"); row.put("key", obj.get("key").stringValue()); row.put("text", obj.get("text").stringValue());
                } else if (component == DisplayComponent.COMPARE && "items".equals(field)) {
                    if (!only(obj, "title", "entries") || !text(obj, "title") || !obj.get("entries").isArray()
                            || obj.get("entries").size() < 2) return;
                    List<Map<String, Object>> entries = new ArrayList<>();
                    for (JsonNode entry : obj.get("entries")) {
                        if (!entry.isObject() || !only(entry, "label", "text") || !text(entry, "label") || !text(entry, "text")) return;
                        entries.add(Map.of("label", entry.get("label").stringValue(), "text", entry.get("text").stringValue()));
                    }
                    row.put("type", "item"); row.put("title", obj.get("title").stringValue()); row.put("entries", List.copyOf(entries));
                } else {
                    row.put("type", "item");
                    if (component == DisplayComponent.STEPS) {
                        if (!only(obj, "title", "description") || !text(obj, "title") || !optionalText(obj, "description")) return;
                        row.put("title", obj.get("title").stringValue()); putOptional(row, obj, "description");
                    } else if (component == DisplayComponent.ROADMAP) {
                        if (!only(obj, "title", "description", "tag", "current") || !text(obj, "title")
                                || !optionalText(obj, "description") || !optionalText(obj, "tag")
                                || (obj.has("current") && !obj.get("current").isBoolean())) return;
                        row.put("title", obj.get("title").stringValue()); putOptional(row, obj, "description"); putOptional(row, obj, "tag");
                        if (obj.has("current")) row.put("current", obj.get("current").booleanValue());
                    } else if (component == DisplayComponent.CHART) {
                        if (!only(obj, "label", "value") || !text(obj, "label") || !obj.get("value").isNumber()
                                || obj.get("value").decimalValue().signum() < 0
                                || !Double.isFinite(obj.get("value").doubleValue())) return;
                        row.put("label", obj.get("label").stringValue()); row.put("value", obj.get("value").decimalValue());
                    } else return;
                }
                emitRow(row);
            } catch (Exception ignored) {
                // A malformed or incomplete array item is not previewed.
            }
        }

        private void emitRow(Map<String, Object> row) {
            previewRows.add(Map.copyOf(row));
            previewSink.accept(new Preview(Kind.ROW, this, Map.copyOf(row)));
        }

        private boolean potentialScalar(String key) {
            return List.of("title", "description", "chartType", "unit", "question", "questionType", "placeholder")
                    .contains(key);
        }

        public String responseId() { return key.responseId; }
        public int index() { return key.index; }
        public String callId() { return callId; }
        public String name() { return name; }
        public String arguments() { return arguments.toString(); }
        public String blockId() { return blockId; }
        public DisplayComponent component() { return component; }
        public List<Map<String, Object>> previewRows() { return List.copyOf(previewRows); }
        public boolean oversized() { return oversized; }
        public boolean malformedPreview() { return malformedPreview; }
        public boolean rootClosed() { return rootClosed && stage == Stage.DONE; }
    }

    private String decodeString(String raw) {
        try { return mapper.readTree(raw).stringValue(); }
        catch (Exception exception) { throw new IllegalArgumentException("Invalid JSON field name", exception); }
    }

    private static boolean text(JsonNode node, String key) {
        return node.has(key) && node.get(key).isString() && !node.get(key).stringValue().isBlank();
    }
    private static boolean optionalText(JsonNode node, String key) {
        return !node.has(key) || node.get(key).isString();
    }
    private static boolean only(JsonNode node, String... fields) {
        java.util.Set<String> allowed = java.util.Set.of(fields);
        for (var field : node.properties()) if (!allowed.contains(field.getKey())) return false;
        return true;
    }
    private static void putOptional(Map<String, Object> row, JsonNode node, String key) {
        if (node.has(key)) row.put(key, node.get(key).stringValue());
    }

    private enum Stage { ROOT, KEY, STRING_KEY, COLON, VALUE, STRING_VALUE, PRIMITIVE, CONTAINER, DELIMITER, DONE }
    private record Key(String responseId, int index) {}
    private record PendingPreview(String field, String raw, boolean arrayObject) {}
    private record SetFields(java.util.Set<String> values) {
        static SetFields forComponent(DisplayComponent component) {
            return switch (component) {
                case STEPS, COMPARE, ROADMAP -> new SetFields(java.util.Set.of("title", "description"));
                case CHART -> new SetFields(java.util.Set.of("title", "description", "chartType", "unit"));
                case QUIZ -> new SetFields(java.util.Set.of("question", "questionType"));
                case QUESTION -> new SetFields(java.util.Set.of("question", "placeholder"));
            };
        }
    }
    public enum Kind { START, ROW }
    public record Preview(Kind kind, CallState call, Map<String, Object> row) {}
}
