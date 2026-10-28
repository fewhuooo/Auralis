package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewSummary;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure, snapshot-bound editor for explicitly safe Overview boundaries. */
final class OverviewBoundaryEditor {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> ROOT_FIELDS = Set.of(
            "schemaVersion", "baseDocumentHash", "guide", "segment_patches", "terminology_map");
    private static final Set<String> PATCH_FIELDS = Set.of(
            "segmentId", "segmentHash", "titlePatch", "openingPatch", "closingPatch");
    private static final Set<String> TITLE_PATCH_FIELDS = Set.of("expectedHash", "action", "replacement");
    private static final Set<String> BLOCK_PATCH_FIELDS = Set.of(
            "blockId", "expectedHash", "action", "replacement");
    private static final Set<String> TERM_FIELDS = Set.of("source", "replacement", "segmentIds", "textKinds");
    private static final Pattern BLOCK_SEPARATOR = Pattern.compile("(?:\\r?\\n[ \\t]*){2,}");
    private static final Pattern FENCE = Pattern.compile("^\\s{0,3}(```+|~~~+)");
    private static final Pattern ATX_HEADING = Pattern.compile("^ {0,3}(#{1,6})(?:[ \\t]+(.*)|[ \\t]*)$");
    private static final Pattern INLINE_PROTECTED = Pattern.compile(
            "(?s)(`+[^`]*`+|\\$\\$?.+?\\$\\$?|\\\\\\(.+?\\\\\\)|\\\\\\[.+?\\\\\\]|\\[[^\\]]*\\]\\([^)]*\\)|“[^”]+”|‘[^’]+’|\\\"[^\\\"]+\\\"|'[^']+')");
    private static final Pattern SQL_LIKE = Pattern.compile(
            "(?iu)\\b(select|insert|update|delete|from|where|join|create\\s+table|alter\\s+table)\\b");
    private static final Pattern EQUATION_LIKE = Pattern.compile(
            "(?u)^[\\p{Alnum}_\\s{}^()+*/.,-]*(?:=|≤|≥|≠|→|↔|≈|∑|∫)[\\p{Alnum}_\\s{}^()+*/.,-]*$");
    private static final Pattern NAVIGATION_OPENING = Pattern.compile(
            "(?iu)^(?:(?:本节|本章|本部分|以下内容)(?:将|会)(?:介绍|讨论|概述|说明)(?:路线|学习路线|整体结构|章节结构|章节安排|学习安排|以下内容|本节内容|本章内容|主要内容)|(?:this section|this chapter|the following section) will (?:introduce|discuss|outline) (?:the structure|the schedule|the learning path|the plan|the following content))[。.!?！？]$");
    private static final Pattern NAVIGATION_CLOSING = Pattern.compile(
            "(?iu)^(?:(?:本节|本章|本部分)(?:内容)?(?:到此结束|至此结束|结束|完毕)|this concludes (?:the section|the chapter)|end of this (?:section|chapter))[。.!?！？]$");

    private OverviewBoundaryEditor() { }

    record Segment(String id, String title, String body) { }

    record Snapshot(String baseDocumentHash, List<SegmentView> segments) {
        Snapshot {
            segments = segments == null ? null : List.copyOf(segments);
        }
    }

    record SegmentView(String id, String originalTitle, String originalBody,
                       String segmentHash, String titleHash, String originalBodyHash,
                       List<BoundaryBlock> blocks) {
        SegmentView {
            blocks = blocks == null ? null : List.copyOf(blocks);
        }
    }

    enum BlockKind { OPENING, CLOSING, CORE, PROTECTED }

    record PromptView(String baseDocumentHash, List<PromptSegment> segments) {
        PromptView {
            segments = List.copyOf(segments);
        }
    }

    record PromptSegment(String id, String originalTitle, String segmentHash, String titleHash,
                         List<String> bodyHeadings, List<PromptBlock> blocks) {
        PromptSegment {
            bodyHeadings = List.copyOf(bodyHeadings);
            blocks = List.copyOf(blocks);
        }
    }

    record PromptBlock(String id, BlockKind kind, String hash, String text) { }

    record BoundaryBlock(String id, BlockKind kind, String hash) { }

    enum TextKind { TITLE, OPENING, CORE, CLOSING }

    record Result(List<Segment> segments, OverviewSummary guide) {
        Result {
            segments = List.copyOf(segments);
        }
    }

    static Snapshot snapshot(List<Segment> segments) {
        if (segments == null || segments.isEmpty()) throw invalid("segments are required");
        Set<String> ids = new HashSet<>();
        List<SegmentView> views = new ArrayList<>();
        for (Segment segment : segments) {
            if (segment == null || blank(segment.id()) || segment.title() == null || segment.body() == null
                    || !ids.add(segment.id())) throw invalid("segment identity or text is invalid");
            List<BoundaryBlock> blocks = blocks(segment.id(), segment.body());
            views.add(new SegmentView(segment.id(), segment.title(), segment.body(),
                    segmentHash(segment.id(), segment.title(), segment.body()), hash(segment.title()),
                    hash(segment.body()), blocks));
        }
        return new Snapshot(documentHash(views), views);
    }

    static PromptView promptView(Snapshot snapshot) {
        validateSnapshot(snapshot);
        List<PromptSegment> promptSegments = new ArrayList<>();
        for (SegmentView segment : snapshot.segments()) {
            List<BlockPart> content = blockParts(segment.id(), segment.originalBody()).stream()
                    .filter(part -> !part.text().isBlank() && !headingOnlyBlock(part.text()))
                    .toList();
            List<PromptBlock> edges = new ArrayList<>();
            if (!content.isEmpty()) {
                edges.add(promptBlock(content.getFirst()));
                BlockPart last = content.getLast();
                if (!last.metadata().id().equals(content.getFirst().metadata().id())) {
                    edges.add(promptBlock(last));
                }
            }
            promptSegments.add(new PromptSegment(segment.id(), segment.originalTitle(), segment.segmentHash(),
                    segment.titleHash(), bodyHeadings(segment.originalBody()), edges));
        }
        return new PromptView(snapshot.baseDocumentHash(), promptSegments);
    }

    static Result apply(Snapshot snapshot, String rawJson, boolean guideRequired) {
        validateSnapshot(snapshot);
        JsonNode root = strictJson(rawJson);
        requireObjectFields(root, ROOT_FIELDS, ROOT_FIELDS);
        if (integer(root.get("schemaVersion")) != 1
                || !snapshot.baseDocumentHash().equals(string(root.get("baseDocumentHash")))) {
            throw invalid("schema version or base document hash does not match");
        }
        OverviewSummary guide = parseGuide(root.get("guide"), guideRequired);
        JsonNode patchNodes = root.get("segment_patches");
        if (patchNodes == null || !patchNodes.isArray()) throw invalid("segment_patches must be an array");

        Map<String, SegmentView> bySegment = new LinkedHashMap<>();
        snapshot.segments().forEach(segment -> bySegment.put(segment.id(), segment));
        Map<String, Patch> patches = new LinkedHashMap<>();
        for (JsonNode node : patchNodes) {
            requireObjectFields(node, Set.of("segmentId", "segmentHash"), PATCH_FIELDS);
            String id = string(node.get("segmentId"));
            SegmentView segment = bySegment.get(id);
            if (segment == null || !segment.segmentHash().equals(string(node.get("segmentHash")))
                    || patches.containsKey(id)) throw invalid("unknown, duplicate, or stale segment patch");
            TitleEdit title = parseTitlePatch(node.get("titlePatch"), segment);
            BlockEdit opening = parseBlockPatch(node.get("openingPatch"), segment, BlockKind.OPENING);
            BlockEdit closing = parseBlockPatch(node.get("closingPatch"), segment, BlockKind.CLOSING);
            patches.put(id, new Patch(title, opening, closing));
        }
        List<Term> terms = parseTerms(root.get("terminology_map"), bySegment);
        rejectTermConflicts(terms);
        validateTermRanges(snapshot.segments(), terms);

        List<Segment> result = new ArrayList<>();
        for (SegmentView view : snapshot.segments()) {
            Patch patch = patches.get(view.id());
            String title = terms.stream().anyMatch(term -> term.applies(view.id(), TextKind.TITLE))
                    && ordinaryProse(view.originalTitle())
                    ? replaceTerms(view.originalTitle(), view.id(), TextKind.TITLE, terms) : view.originalTitle();
            if (patch != null && patch.title() != null && patch.title().action() != Action.KEEP) {
                title = editedText(view.originalTitle(), patch.title().action(), patch.title().replacement());
            }
            StringBuilder body = new StringBuilder();
            for (BlockPart part : blockParts(view.id(), view.originalBody())) {
                BoundaryBlock block = part.metadata();
                BlockEdit edit = patch == null ? null : switch (block.kind()) {
                    case OPENING -> patch.opening();
                    case CLOSING -> patch.closing();
                    default -> null;
                };
                TextKind textKind = switch (block.kind()) {
                    case OPENING -> TextKind.OPENING;
                    case CLOSING -> TextKind.CLOSING;
                    case CORE -> TextKind.CORE;
                    case PROTECTED -> null;
                };
                String text = textKind != null && ordinaryProse(part.text())
                        && terms.stream().anyMatch(term -> term.applies(view.id(), textKind))
                        ? replaceTerms(part.text(), view.id(), textKind, terms) : part.text();
                if (edit != null && edit.action() != Action.KEEP) {
                    text = editedText(part.text(), edit.action(), edit.replacement());
                }
                body.append(text);
            }
            result.add(new Segment(view.id(), title, body.toString()));
        }
        return new Result(result, guide);
    }

    static String responseSchema() {
        return """
                {
                  "type":"object",
                  "additionalProperties":false,
                  "required":["schemaVersion","baseDocumentHash","guide","segment_patches","terminology_map"],
                  "properties":{
                    "schemaVersion":{"const":1},
                    "baseDocumentHash":{"type":"string"},
                    "guide":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/guide"}]},
                    "segment_patches":{"type":"array","items":{"$ref":"#/$defs/segmentPatch"}},
                    "terminology_map":{"type":"array","items":{"$ref":"#/$defs/term"}}
                  },
                  "$defs":{
                    "guide":{"type":"object","additionalProperties":false,
                      "required":["overview","keyPoints","learningPath"],
                      "properties":{
                        "overview":{"type":["string","null"]},
                        "keyPoints":{"type":"array","items":{"type":"string"}},
                        "learningPath":{"type":"array","items":{"type":"string"}}
                      }
                    },
                    "segmentPatch":{"type":"object","additionalProperties":false,
                      "required":["segmentId","segmentHash"],
                      "properties":{
                        "segmentId":{"type":"string"},
                        "segmentHash":{"type":"string"},
                        "titlePatch":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/titlePatch"}]},
                        "openingPatch":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/blockPatch"}]},
                        "closingPatch":{"oneOf":[{"type":"null"},{"$ref":"#/$defs/blockPatch"}]}
                      }
                    },
                    "titlePatch":{"type":"object","additionalProperties":false,
                      "required":["expectedHash","action"],
                      "properties":{
                        "expectedHash":{"type":"string"},
                        "action":{"enum":["keep","replace","delete"]},
                        "replacement":{"type":"string"}
                      }
                    },
                    "blockPatch":{"type":"object","additionalProperties":false,
                      "required":["blockId","expectedHash","action"],
                      "properties":{
                        "blockId":{"type":"string"},
                        "expectedHash":{"type":"string"},
                        "action":{"enum":["keep","replace","delete"]},
                        "replacement":{"type":"string"}
                      }
                    },
                    "term":{"type":"object","additionalProperties":false,
                      "required":["source","replacement","segmentIds","textKinds"],
                      "properties":{
                        "source":{"type":"string"},
                        "replacement":{"type":"string"},
                        "segmentIds":{"type":"array","items":{"type":"string"}},
                        "textKinds":{"type":"array","items":{"type":"string","enum":["TITLE","OPENING","CORE","CLOSING"]}}
                      }
                    }
                  }
                }
                """;
    }

    private static JsonNode strictJson(String rawJson) {
        if (blank(rawJson)) throw invalid("patch JSON is required");
        try {
            return JSON.reader().with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(rawJson);
        } catch (Exception exception) {
            throw invalid("patch JSON is malformed or has duplicate fields");
        }
    }

    private static OverviewSummary parseGuide(JsonNode node, boolean required) {
        if (node == null || node.isNull()) {
            if (required) throw invalid("guide is required");
            return null;
        }
        if (!required) throw invalid("guide must be null for this mode");
        Set<String> fields = Set.of("overview", "keyPoints", "learningPath");
        requireObjectFields(node, fields, fields);
        String overview = nullableString(node.get("overview"));
        List<String> keyPoints = stringList(node.get("keyPoints"));
        List<String> learningPath = stringList(node.get("learningPath"));
        return new OverviewSummary(overview, keyPoints, learningPath);
    }

    private static TitleEdit parseTitlePatch(JsonNode node, SegmentView segment) {
        if (node == null || node.isNull()) return null;
        requireObjectFields(node, Set.of("expectedHash", "action"), TITLE_PATCH_FIELDS);
        if (!segment.titleHash().equals(string(node.get("expectedHash")))) throw invalid("title hash mismatch");
        return new TitleEdit(action(node), nullableString(node.get("replacement")));
    }

    private static BlockEdit parseBlockPatch(JsonNode node, SegmentView segment, BlockKind expectedKind) {
        if (node == null || node.isNull()) return null;
        requireObjectFields(node, Set.of("blockId", "expectedHash", "action"), BLOCK_PATCH_FIELDS);
        String id = string(node.get("blockId"));
        BoundaryBlock block = segment.blocks().stream().filter(candidate -> candidate.id().equals(id))
                .findFirst().orElseThrow(() -> invalid("unknown boundary block"));
        if (block.kind() != expectedKind || !block.hash().equals(string(node.get("expectedHash")))) {
            throw invalid("boundary block is not permitted or its hash mismatches");
        }
        return new BlockEdit(id, action(node), nullableString(node.get("replacement")));
    }

    private static List<Term> parseTerms(JsonNode node, Map<String, SegmentView> segments) {
        if (node == null || !node.isArray()) throw invalid("terminology_map must be an array");
        List<Term> terms = new ArrayList<>();
        for (JsonNode item : node) {
            requireObjectFields(item, TERM_FIELDS, TERM_FIELDS);
            String source = string(item.get("source"));
            String replacement = string(item.get("replacement"));
            if (!singleInlineTerm(source) || !singleInlineTerm(replacement) || source.equals(replacement)) {
                throw invalid("terminology entries must be single inline lexical terms");
            }
            List<String> ids = stringList(item.get("segmentIds"));
            List<String> kinds = stringList(item.get("textKinds"));
            if (ids.isEmpty() || kinds.isEmpty()) throw invalid("terminology scope must be explicit");
            Set<TextKind> parsedKinds = new HashSet<>();
            for (String kind : kinds) {
                try { parsedKinds.add(TextKind.valueOf(kind)); }
                catch (IllegalArgumentException exception) { throw invalid("unknown terminology text kind"); }
            }
            if (ids.stream().anyMatch(id -> !segments.containsKey(id))
                    || ids.size() != new HashSet<>(ids).size() || parsedKinds.size() != kinds.size()) {
                throw invalid("terminology scope contains an unknown or duplicate value");
            }
            if (source.codePoints().anyMatch(Character::isISOControl)) throw invalid("invalid literal term");
            terms.add(new Term(source, replacement, Set.copyOf(ids), Set.copyOf(parsedKinds)));
        }
        return List.copyOf(terms);
    }

    private static void rejectTermConflicts(List<Term> terms) {
        for (int i = 0; i < terms.size(); i++) {
            Term left = terms.get(i);
            for (int j = i + 1; j < terms.size(); j++) {
                Term right = terms.get(j);
                if (!java.util.Collections.disjoint(left.segmentIds(), right.segmentIds())
                        && !java.util.Collections.disjoint(left.textKinds(), right.textKinds())
                        && left.source().equals(right.source())) {
                    throw invalid("duplicate terminology mapping scope");
                }
                if (!java.util.Collections.disjoint(left.segmentIds(), right.segmentIds())
                        && !java.util.Collections.disjoint(left.textKinds(), right.textKinds())
                        && (left.source().contains(right.source()) || right.source().contains(left.source()))) {
                    throw invalid("overlapping terminology mappings are ambiguous");
                }
            }
        }
    }

    private static void validateTermRanges(List<SegmentView> segments, List<Term> terms) {
        for (SegmentView segment : segments) {
            validateTermRange(segment.originalTitle(), segment.id(), TextKind.TITLE, terms);
            for (BlockPart part : blockParts(segment.id(), segment.originalBody())) {
                BoundaryBlock block = part.metadata();
                TextKind kind = switch (block.kind()) {
                    case OPENING -> TextKind.OPENING;
                    case CLOSING -> TextKind.CLOSING;
                    case CORE -> TextKind.CORE;
                    case PROTECTED -> null;
                };
                if (kind != null && ordinaryProse(part.text())) {
                    validateTermRange(part.text(), segment.id(), kind, terms);
                }
            }
        }
    }

    private static void validateTermRange(String text, String segmentId, TextKind kind, List<Term> terms) {
        List<MatchRange> ranges = new ArrayList<>();
        for (Term term : terms) {
            if (!term.applies(segmentId, kind)) continue;
            int from = 0;
            while (from <= text.length() - term.source().length()) {
                int start = text.indexOf(term.source(), from);
                if (start < 0) break;
                int end = start + term.source().length();
                if (termBoundary(text, start, end)) ranges.add(new MatchRange(start, end));
                from = start + 1;
            }
        }
        ranges.sort(Comparator.comparingInt(MatchRange::start).thenComparingInt(MatchRange::end));
        for (int i = 1; i < ranges.size(); i++) {
            if (ranges.get(i).start() < ranges.get(i - 1).end()) {
                throw invalid("terminology matches overlap in the original snapshot");
            }
        }
    }

    private static String replaceTerms(String original, String segmentId, TextKind kind, List<Term> terms) {
        List<Term> applicable = terms.stream().filter(term -> term.applies(segmentId, kind))
                .sorted(Comparator.comparingInt((Term term) -> term.source().length()).reversed()
                        .thenComparing(Term::source)).toList();
        StringBuilder output = new StringBuilder();
        for (int index = 0; index < original.length();) {
            Term matched = null;
            for (Term term : applicable) {
                int end = index + term.source().length();
                if (end <= original.length() && original.startsWith(term.source(), index)
                        && termBoundary(original, index, end)) {
                    matched = term;
                    break;
                }
            }
            if (matched == null) output.append(original.charAt(index++));
            else {
                output.append(matched.replacement());
                index += matched.source().length();
            }
        }
        return output.toString();
    }

    private static boolean termBoundary(String text, int start, int end) {
        if (start > 0 && identifierPart(text.codePointBefore(start))) return false;
        return end >= text.length() || !identifierPart(text.codePointAt(end));
    }

    private static boolean identifierPart(int codePoint) {
        if (Character.isUnicodeIdentifierPart(codePoint)) {
            Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
            return script != Character.UnicodeScript.HAN
                    && script != Character.UnicodeScript.HIRAGANA
                    && script != Character.UnicodeScript.KATAKANA
                    && script != Character.UnicodeScript.HANGUL;
        }
        return false;
    }

    private static void validateSnapshot(Snapshot snapshot) {
        if (snapshot == null || blank(snapshot.baseDocumentHash()) || snapshot.segments() == null
                || snapshot.segments().isEmpty()) throw invalid("snapshot is invalid");
        Set<String> ids = new HashSet<>();
        List<SegmentView> rebuilt = new ArrayList<>();
        for (SegmentView view : snapshot.segments()) {
            if (view == null || blank(view.id()) || view.originalTitle() == null || view.originalBody() == null
                    || !ids.add(view.id())) throw invalid("snapshot contains invalid segment data");
            SegmentView expected = new SegmentView(view.id(), view.originalTitle(), view.originalBody(),
                    segmentHash(view.id(), view.originalTitle(), view.originalBody()), hash(view.originalTitle()),
                    hash(view.originalBody()), blocks(view.id(), view.originalBody()));
            if (!expected.equals(view)) throw invalid("snapshot segment or boundary hashes were tampered");
            rebuilt.add(expected);
        }
        if (!snapshot.baseDocumentHash().equals(documentHash(rebuilt))) throw invalid("snapshot hash mismatch");
    }

    private static List<BoundaryBlock> blocks(String segmentId, String body) {
        return blockParts(segmentId, body).stream().map(BlockPart::metadata).toList();
    }

    private static PromptBlock promptBlock(BlockPart part) {
        BoundaryBlock metadata = part.metadata();
        return new PromptBlock(metadata.id(), metadata.kind(), metadata.hash(), part.text());
    }

    private static boolean headingOnlyBlock(String text) {
        boolean foundHeading = false;
        for (String line : text.split("\\R")) {
            if (line.isBlank()) continue;
            if (!ATX_HEADING.matcher(line).matches()) return false;
            foundHeading = true;
        }
        return foundHeading;
    }

    private static List<String> bodyHeadings(String body) {
        List<String> headings = new ArrayList<>();
        String activeFence = null;
        for (String line : body.split("\\R", -1)) {
            String stripped = line.strip();
            Matcher fenceMatcher = FENCE.matcher(stripped);
            String fence = fenceMatcher.find() ? fenceMatcher.group(1) : null;
            boolean wasFenced = activeFence != null;
            boolean closesFence = wasFenced && fence != null
                    && fence.charAt(0) == activeFence.charAt(0) && fence.length() >= activeFence.length()
                    && stripped.substring(fenceMatcher.end()).isBlank();
            if (!wasFenced && fence != null) activeFence = fence;
            else if (closesFence) activeFence = null;
            else if (!wasFenced) {
                Matcher headingMatcher = ATX_HEADING.matcher(line);
                if (headingMatcher.matches()) {
                    String heading = headingMatcher.group(2) == null ? "" : headingMatcher.group(2).strip();
                    heading = heading.replaceFirst("[ \\t]+#+[ \\t]*$", "").strip();
                    if (!heading.isEmpty()) headings.add(heading);
                }
            }
        }
        return List.copyOf(headings);
    }

    private static List<BlockPart> blockParts(String segmentId, String body) {
        List<String> raw = new ArrayList<>();
        List<Boolean> separators = new ArrayList<>();
        Matcher matcher = BLOCK_SEPARATOR.matcher(body);
        int start = 0;
        while (matcher.find()) {
            if (matcher.start() > start) {
                raw.add(body.substring(start, matcher.start()));
                separators.add(false);
            }
            raw.add(body.substring(matcher.start(), matcher.end()));
            separators.add(true);
            start = matcher.end();
        }
        if (start < body.length() || raw.isEmpty()) {
            raw.add(body.substring(start));
            separators.add(false);
        }
        List<Boolean> protectedBlocks = new ArrayList<>();
        String activeFence = null;
        for (int i = 0; i < raw.size(); i++) {
            String text = raw.get(i);
            String trimmed = text.strip();
            Matcher fenceMatcher = FENCE.matcher(trimmed);
            String fence = fenceMatcher.find() ? fenceMatcher.group(1) : null;
            boolean wasFenced = activeFence != null;
            boolean closesFence = wasFenced && fence != null
                    && fence.charAt(0) == activeFence.charAt(0) && fence.length() >= activeFence.length()
                    && trimmed.substring(fenceMatcher.end()).isBlank();
            boolean isProtected = separators.get(i) || wasFenced || fence != null || protectedMarkdown(trimmed);
            protectedBlocks.add(isProtected);
            if (!wasFenced && fence != null) activeFence = fence;
            else if (closesFence) activeFence = null;
        }
        int firstProse = -1;
        int lastProse = -1;
        for (int i = 0; i < raw.size(); i++) {
            String trimmed = raw.get(i).strip();
            if (!separators.get(i) && !protectedBlocks.get(i) && ordinaryProse(trimmed)) {
                if (firstProse < 0) firstProse = i;
                lastProse = i;
            }
        }
        List<BlockPart> blocks = new ArrayList<>();
        for (int i = 0; i < raw.size(); i++) {
            String trimmed = raw.get(i).strip();
            BlockKind kind = protectedBlocks.get(i) ? BlockKind.PROTECTED : BlockKind.CORE;
            if (!separators.get(i) && firstProse >= 0 && firstProse != lastProse && i == firstProse
                    && navigationOpening(trimmed)) kind = BlockKind.OPENING;
            if (!separators.get(i) && firstProse >= 0 && firstProse != lastProse && i == lastProse
                    && navigationClosing(trimmed)) kind = BlockKind.CLOSING;
            String id = segmentId + ":block:" + i;
            BoundaryBlock metadata = new BoundaryBlock(id, kind, hash(raw.get(i)));
            blocks.add(new BlockPart(metadata, raw.get(i)));
        }
        return List.copyOf(blocks);
    }

    private static boolean protectedMarkdown(String text) {
        if (text.isEmpty()) return false;
        String[] lines = text.split("\\R");
        boolean table = false;
        for (String line : lines) {
            String stripped = line.strip();
            if (stripped.startsWith(">") || stripped.startsWith("|")
                    || stripped.startsWith("<code") || stripped.startsWith("<pre")
                    || stripped.startsWith("<script")
                    || stripped.matches("#{1,6}\\s+.*")
                    || stripped.matches("\\[[^\\]]+\\]:\\s*\\S+.*")
                    || stripped.matches("\\|?\\s*:?-{3,}:?\\s*(\\|\\s*:?-{3,}:?\\s*)+\\|?")) table = true;
        }
        return table || text.matches("(?s).*\\$\\$.*") || text.startsWith("\\[")
                || text.startsWith("\\begin{") || INLINE_PROTECTED.matcher(text).find()
                || SQL_LIKE.matcher(text).find() || EQUATION_LIKE.matcher(text).matches();
    }

    private static boolean singleInlineTerm(String value) {
        if (blank(value) || value.codePoints().anyMatch(Character::isWhitespace)) return false;
        // Regex punctuation remains literal; Markdown structure characters are excluded from term tokens.
        return value.codePoints().anyMatch(Character::isLetterOrDigit)
                && value.codePoints().noneMatch(codePoint -> "`$\\*_~#>|[]()!".indexOf(codePoint) >= 0)
                && !value.contains("<!--") && !value.contains("-->");
    }

    private static boolean ordinaryProse(String text) {
        return text != null && !text.isBlank() && !protectedMarkdown(text.strip());
    }

    private static boolean navigationOpening(String text) {
        return ordinaryProse(text) && NAVIGATION_OPENING.matcher(text).matches();
    }

    private static boolean navigationClosing(String text) {
        return ordinaryProse(text) && NAVIGATION_CLOSING.matcher(text).matches();
    }

    private static String editedText(String original, Action action, String replacement) {
        return switch (action) {
            case KEEP -> original;
            case REPLACE -> replacement;
            case DELETE -> "";
        };
    }

    private static Action action(JsonNode node) {
        String action = string(node.get("action"));
        JsonNode replacementNode = node.get("replacement");
        Action parsed;
        try {
            parsed = Action.valueOf(action.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw invalid("unknown patch action");
        }
        if (parsed == Action.REPLACE) {
            if (replacementNode == null || !replacementNode.isTextual() || replacementNode.asString().isBlank()) {
                throw invalid("replace action requires replacement text");
            }
            String replacement = replacementNode.asString();
            String structuralStart = replacement.stripLeading();
            if (replacement.indexOf('\n') >= 0 || replacement.indexOf('\r') >= 0
                    || protectedMarkdown(replacement)
                    || structuralStart.matches("(?s)(?:#{1,6}\\s|>|```|~~~|\\$\\$|\\[|\\|).*")) {
                throw invalid("replacement cannot introduce Markdown block or inline structure");
            }
        } else if (replacementNode != null && !replacementNode.isNull()) {
            throw invalid("keep/delete action cannot include replacement text");
        }
        return parsed;
    }

    private static void requireObjectFields(JsonNode node, Set<String> required, Set<String> allowed) {
        if (node == null || !node.isObject()) throw invalid("expected JSON object");
        Set<String> actual = new HashSet<>();
        node.properties().forEach(entry -> actual.add(entry.getKey()));
        if (!allowed.containsAll(actual) || !actual.containsAll(required)) throw invalid("unknown or missing JSON field");
    }

    private static List<String> stringList(JsonNode node) {
        if (node == null || !node.isArray()) throw invalid("expected string array");
        List<String> values = new ArrayList<>();
        for (JsonNode item : node) {
            if (!item.isTextual()) throw invalid("expected string array");
            values.add(item.asString());
        }
        return List.copyOf(values);
    }

    private static int integer(JsonNode node) {
        if (node == null || !node.isIntegralNumber() || !node.canConvertToInt()) throw invalid("expected integer");
        return node.intValue();
    }

    private static String string(JsonNode node) {
        if (node == null || !node.isTextual()) throw invalid("expected string");
        return node.asString();
    }

    private static String nullableString(JsonNode node) {
        return node == null || node.isNull() ? null : string(node);
    }

    private static String segmentHash(String id, String title, String body) {
        return hash("segment-v1" + id.length() + ":" + id + title.length() + ":" + title
                + body.length() + ":" + body);
    }

    private static String documentHash(List<SegmentView> segments) {
        StringBuilder value = new StringBuilder("overview-boundary-v1\u0000");
        for (SegmentView segment : segments) {
            value.append(segment.id().length()).append(':').append(segment.id())
                    .append(segment.originalTitle().length()).append(':').append(segment.originalTitle())
                    .append(segment.originalBody().length()).append(':').append(segment.originalBody());
        }
        return hash(value.toString());
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }

    private static IllegalArgumentException invalid(String message) { return new IllegalArgumentException(message); }

    private enum Action { KEEP, REPLACE, DELETE }
    private record TitleEdit(Action action, String replacement) { }
    private record BlockEdit(String blockId, Action action, String replacement) { }
    private record Patch(TitleEdit title, BlockEdit opening, BlockEdit closing) { }
    private record MatchRange(int start, int end) { }
    private record BlockPart(BoundaryBlock metadata, String text) { }
    private record Term(String source, String replacement, Set<String> segmentIds, Set<TextKind> textKinds) {
        boolean applies(String id, TextKind kind) { return segmentIds.contains(id) && textKinds.contains(kind); }
    }
}
