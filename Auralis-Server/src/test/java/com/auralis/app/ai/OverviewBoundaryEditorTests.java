package com.auralis.app.ai;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OverviewBoundaryEditorTests {

    @Test
    void replacesOnlyAuthorizedTitleAndEditorialBoundaries() {
        OverviewBoundaryEditor.Snapshot snapshot = snapshot(
                "intro", "原标题", "本节将介绍路线。\n\n核心定义是状态转移条件。\n\n本节内容到此结束。");
        var segment = snapshot.segments().getFirst();
        var opening = segment.blocks().stream().filter(block -> block.kind() == OverviewBoundaryEditor.BlockKind.OPENING)
                .findFirst().orElseThrow();
        var closing = segment.blocks().stream().filter(block -> block.kind() == OverviewBoundaryEditor.BlockKind.CLOSING)
                .findFirst().orElseThrow();
        String patch = "[{\"segmentId\":\"intro\",\"segmentHash\":" + q(segment.segmentHash())
                + ",\"titlePatch\":{\"expectedHash\":" + q(segment.titleHash())
                + ",\"action\":\"replace\",\"replacement\":\"新标题\"},\"openingPatch\":{\"blockId\":"
                + q(opening.id()) + ",\"expectedHash\":" + q(opening.hash())
                + ",\"action\":\"replace\",\"replacement\":\"本节先说明阅读顺序。\"},\"closingPatch\":{\"blockId\":"
                + q(closing.id()) + ",\"expectedHash\":" + q(closing.hash()) + ",\"action\":\"delete\"}}]";

        var result = apply(snapshot, patch, "[]");
        assertEquals(result, apply(snapshot, patch, "[]"), "reapplying the same patch to its base is deterministic");
        assertEquals("新标题", result.segments().getFirst().title());
        assertEquals("本节先说明阅读顺序。\n\n核心定义是状态转移条件。\n\n", result.segments().getFirst().body());
        assertEquals(snapshot.segments().getFirst().originalBody(), segment.originalBody(),
                "applying edits must not mutate the immutable source snapshot");
    }

    @Test
    void rejectsUnknownDuplicateFieldsAndTrailingJson() {
        var snapshot = snapshot("s1", "标题", "内容。");
        String valid = root(snapshot, "[]", "[]", "null");
        assertThrows(IllegalArgumentException.class,
                () -> OverviewBoundaryEditor.apply(snapshot, valid.replace("\"guide\":null", "\"guide\":null,\"extra\":1"), false));
        assertThrows(IllegalArgumentException.class,
                () -> OverviewBoundaryEditor.apply(snapshot, valid.replace("\"schemaVersion\":1", "\"schemaVersion\":1,\"schemaVersion\":1"), false));
        assertThrows(IllegalArgumentException.class,
                () -> OverviewBoundaryEditor.apply(snapshot, valid + " {}", false));
    }

    @Test
    void rejectsUnknownSegmentIdsAndStaleHashesWithoutPartialResult() {
        var snapshot = snapshot("s1", "标题", "本节将介绍路线。\n\n核心知识。");
        String unknown = "[{\"segmentId\":\"missing\",\"segmentHash\":\"x\",\"titlePatch\":null}]";
        assertThrows(IllegalArgumentException.class, () -> apply(snapshot, unknown, "[]"));
        var segment = snapshot.segments().getFirst();
        String stale = "[{\"segmentId\":\"s1\",\"segmentHash\":\"stale\",\"titlePatch\":null}]";
        assertThrows(IllegalArgumentException.class, () -> apply(snapshot, stale, "[]"));
        String duplicate = "[{\"segmentId\":\"s1\",\"segmentHash\":" + q(segment.segmentHash())
                + "},{\"segmentId\":\"s1\",\"segmentHash\":" + q(segment.segmentHash()) + "}]";
        assertThrows(IllegalArgumentException.class, () -> apply(snapshot, duplicate, "[]"));
        var opening = segment.blocks().stream().filter(block -> block.kind() == OverviewBoundaryEditor.BlockKind.OPENING)
                .findFirst().orElseThrow();
        String staleBlock = "[{\"segmentId\":\"s1\",\"segmentHash\":" + q(segment.segmentHash())
                + ",\"openingPatch\":{\"blockId\":" + q(opening.id())
                + ",\"expectedHash\":\"stale\",\"action\":\"delete\"}}]";
        assertThrows(IllegalArgumentException.class, () -> apply(snapshot, staleBlock, "[]"));
        String nestedUnknown = "[{\"segmentId\":\"s1\",\"segmentHash\":" + q(segment.segmentHash())
                + ",\"extra\":true}]";
        assertThrows(IllegalArgumentException.class, () -> apply(snapshot, nestedUnknown, "[]"));
    }

    @Test
    void acceptsIdentityOnlyAndNullPatchesAsNoOpAndKeepsAllGuide() throws Exception {
        var snapshot = snapshot("s1", "原题", "原正文。");
        var segment = snapshot.segments().getFirst();
        String identityOnly = "[{\"segmentId\":\"s1\",\"segmentHash\":" + q(segment.segmentHash()) + "}]";
        String explicitNulls = "[{\"segmentId\":\"s1\",\"segmentHash\":" + q(segment.segmentHash())
                + ",\"titlePatch\":null,\"openingPatch\":null,\"closingPatch\":null}]";
        String guide = "{\"overview\":\"导读\",\"keyPoints\":[\"重点\"],\"learningPath\":[\"先读\"]}";

        var omitted = OverviewBoundaryEditor.apply(snapshot, root(snapshot, identityOnly, "[]", guide), true);
        var explicit = OverviewBoundaryEditor.apply(snapshot, root(snapshot, explicitNulls, "[]", guide), true);

        assertEquals("原题", omitted.segments().getFirst().title());
        assertEquals("原正文。", omitted.segments().getFirst().body());
        assertEquals("导读", omitted.guide().overview());
        assertEquals(omitted, explicit);
    }

    @Test
    void emptyPatchCanCoexistWithRealEdit() {
        var snapshot = OverviewBoundaryEditor.snapshot(List.of(
                new OverviewBoundaryEditor.Segment("s1", "保持标题", "保持正文。"),
                new OverviewBoundaryEditor.Segment("s2", "旧标题", "编辑正文。")));
        var noOp = snapshot.segments().getFirst();
        var editable = snapshot.segments().getLast();
        String patches = "[{\"segmentId\":\"s1\",\"segmentHash\":" + q(noOp.segmentHash())
                + ",\"titlePatch\":null},{\"segmentId\":\"s2\",\"segmentHash\":" + q(editable.segmentHash())
                + ",\"titlePatch\":{\"expectedHash\":" + q(editable.titleHash())
                + ",\"action\":\"replace\",\"replacement\":\"新标题\"}}]";

        var result = apply(snapshot, patches, "[]");

        assertEquals("保持标题", result.segments().getFirst().title());
        assertEquals("保持正文。", result.segments().getFirst().body());
        assertEquals("新标题", result.segments().getLast().title());
    }

    @Test
    void factBearingAndProtectedBlocksAreNotEditableOrTermTargets() {
        String body = "首段定义条件并给出例如说明。\n\n> 引用 a.b\n\n| a.b | 表格 |\n| --- | --- |\n\nInline math $a.b$ stays protected.\n\nCheck [a.b](https://example.test) stays protected.\n\n```sql\nselect a.b;\n```\n\n尾段总结结论。";
        var snapshot = snapshot("s1", "标题", body);
        assertTrue(snapshot.segments().getFirst().blocks().stream()
                .noneMatch(block -> block.kind() == OverviewBoundaryEditor.BlockKind.OPENING
                        || block.kind() == OverviewBoundaryEditor.BlockKind.CLOSING));
        String terms = "[{\"source\":\"a.b\",\"replacement\":\"literal\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\"]}]";
        var result = apply(snapshot, "[]", terms);
        assertEquals(body, result.segments().getFirst().body(),
                "fact-bearing and protected content must remain byte-for-byte unchanged");
    }

    @Test
    void factBearingClausesDoNotPassTheClosedEditorialBoundaryAllowlist() {
        var chinese = snapshot("zh", "标题",
                "本章将介绍神经网络，层间权重决定信号传播。\n\n核心正文。");
        assertTrue(chinese.segments().getFirst().blocks().stream()
                .noneMatch(block -> block.kind() == OverviewBoundaryEditor.BlockKind.OPENING));

        var english = snapshot("en", "Title",
                "This section will introduce the plan. Each state controls the next transition.\n\nCore content.");
        assertTrue(english.segments().getFirst().blocks().stream()
                .noneMatch(block -> block.kind() == OverviewBoundaryEditor.BlockKind.OPENING));

        var pureEditorial = snapshot("pure", "Title",
                "This section will introduce the plan.\n\nCore content.\n\nThis concludes the section.");
        assertTrue(pureEditorial.segments().getFirst().blocks().stream()
                .anyMatch(block -> block.kind() == OverviewBoundaryEditor.BlockKind.OPENING));
        assertTrue(pureEditorial.segments().getFirst().blocks().stream()
                .anyMatch(block -> block.kind() == OverviewBoundaryEditor.BlockKind.CLOSING));
    }

    @Test
    void treatsRegexAndReplacementMetacharactersAsLiteralText() {
        String body = "The token a.b appears.\n\nQuoted \"a.b\" stays protected.\n\n```sql\nselect a.b;\n```";
        var snapshot = snapshot("s1", "a.b title", body);
        String terms = "[{\"source\":\"a.b\",\"replacement\":\"x+y?\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\",\"TITLE\"]}]";
        var result = apply(snapshot, "[]", terms).segments().getFirst();
        assertEquals("x+y? title", result.title());
        assertEquals("The token x+y? appears.\n\nQuoted \"a.b\" stays protected.\n\n```sql\nselect a.b;\n```",
                result.body());
    }

    @Test
    void mismatchedFenceMarkerDoesNotExposeCodeToTermReplacement() {
        String body = "```java\nfirst a.b\n\n~~~\nsecond a.b\n```";
        var snapshot = snapshot("s1", "标题", body);
        String terms = "[{\"source\":\"a.b\",\"replacement\":\"x.y\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\"]}]";
        assertEquals(body, apply(snapshot, "[]", terms).segments().getFirst().body());
    }

    @Test
    void terminologyReplacementUsesOriginalSnapshotAndDoesNotCascade() {
        var snapshot = snapshot("s1", "标题", "alpha then beta");
        String terms = "[{\"source\":\"alpha\",\"replacement\":\"beta\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\"]},"
                + "{\"source\":\"beta\",\"replacement\":\"gamma\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\"]}]";
        assertEquals("beta then gamma", apply(snapshot, "[]", terms).segments().getFirst().body());
        String overlap = "[{\"source\":\"alpha\",\"replacement\":\"x\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\"]},"
                + "{\"source\":\"alpha then\",\"replacement\":\"y\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\"]}]";
        assertThrows(IllegalArgumentException.class, () -> apply(snapshot, "[]", overlap));
    }

    @Test
    void chineseLiteralTermsMatchWithinChineseProse() {
        var snapshot = snapshot("s1", "标题", "我们学习数据库系统的设计。");
        String terms = "[{\"source\":\"数据库\",\"replacement\":\"资料库\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\"]}]";
        assertEquals("我们学习资料库系统的设计。", apply(snapshot, "[]", terms).segments().getFirst().body());
    }

    @Test
    void latinTermsMayTouchCjkButNotIdentifierCharacters() {
        var snapshot = snapshot("s1", "标题", "学习DBMS系统。MyDBMS、DBMS2和x_DBMS保持原样。");
        String terms = "[{\"source\":\"DBMS\",\"replacement\":\"数据库\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\"]}]";
        assertEquals("学习数据库系统。MyDBMS、DBMS2和x_DBMS保持原样。",
                apply(snapshot, "[]", terms).segments().getFirst().body());
    }

    @Test
    void promptViewOmitsMiddleBodyButSnapshotRetainsItAndExtractsActualHeadings() throws Exception {
        String middle = "MIDDLE_SENTINEL_".repeat(24);
        String body = "# Visible title\n\nFirst edge.\n\n" + middle
                + "\n\n```md\n# Fake fenced heading\n```\n\n## Middle topic\n\nLast edge.";
        var snapshot = snapshot("s1", "Section", body);
        var projection = OverviewBoundaryEditor.promptView(snapshot);
        String serialized = new ObjectMapper().writeValueAsString(projection);

        assertEquals(body, snapshot.segments().getFirst().originalBody());
        assertEquals(List.of("Visible title", "Middle topic"), projection.segments().getFirst().bodyHeadings());
        assertEquals(List.of("First edge.", "Last edge."), projection.segments().getFirst().blocks().stream()
                .map(OverviewBoundaryEditor.PromptBlock::text).toList());
        assertFalse(serialized.contains("originalBody"));
        assertFalse(serialized.contains("originalBodyHash"));
        assertFalse(serialized.contains(middle));
        assertFalse(serialized.contains("Fake fenced heading"));
    }

    @Test
    void promptViewSelectsSingleAndTwoNaturalEdgesWithoutDuplicates() {
        var single = OverviewBoundaryEditor.promptView(snapshot("one", "One", "Only paragraph."));
        assertEquals(List.of("Only paragraph."), single.segments().getFirst().blocks().stream()
                .map(OverviewBoundaryEditor.PromptBlock::text).toList());

        var two = OverviewBoundaryEditor.promptView(snapshot("two", "Two", "First paragraph.\n\n\nSecond paragraph."));
        assertEquals(List.of("First paragraph.", "Second paragraph."), two.segments().getFirst().blocks().stream()
                .map(OverviewBoundaryEditor.PromptBlock::text).toList());
    }

    @Test
    void projectedPatchMetadataAppliesToFullSnapshotAndHiddenCoreTermsUseExistingScope() {
        String middle = "hiddenmarker occurs hiddenmarker again";
        String body = "本节将介绍路线。\n\n" + middle + "\n\n本节内容到此结束。";
        var snapshot = snapshot("s1", "标题", body);
        var projection = OverviewBoundaryEditor.promptView(snapshot);
        var segment = projection.segments().getFirst();
        var opening = segment.blocks().stream().filter(block -> block.kind() == OverviewBoundaryEditor.BlockKind.OPENING)
                .findFirst().orElseThrow();
        var closing = segment.blocks().stream().filter(block -> block.kind() == OverviewBoundaryEditor.BlockKind.CLOSING)
                .findFirst().orElseThrow();
        String patches = "[{\"segmentId\":" + q(segment.id()) + ",\"segmentHash\":" + q(segment.segmentHash())
                + ",\"openingPatch\":{\"blockId\":" + q(opening.id()) + ",\"expectedHash\":" + q(opening.hash())
                + ",\"action\":\"replace\",\"replacement\":\"本节先说明路线。\"},\"closingPatch\":{\"blockId\":"
                + q(closing.id()) + ",\"expectedHash\":" + q(closing.hash()) + ",\"action\":\"keep\"}}]";
        String terms = "[{\"source\":\"hiddenmarker\",\"replacement\":\"可见词项\",\"segmentIds\":[\"s1\"],\"textKinds\":[\"CORE\"]}]";
        var result = OverviewBoundaryEditor.apply(snapshot,
                root(snapshot, patches, terms, "null"), false).segments().getFirst();

        assertEquals("本节先说明路线。\n\n可见词项 occurs 可见词项 again\n\n本节内容到此结束。", result.body());
        assertFalse(projection.segments().getFirst().blocks().stream().anyMatch(block -> block.text().contains("hiddenmarker")));
    }

    @Test
    void snapshotIsImmutableTamperEvidentAndRepeatable() {
        var snapshot = snapshot("s1", "标题", "普通正文。");
        var first = apply(snapshot, "[]", "[]");
        var second = apply(snapshot, "[]", "[]");
        assertEquals(first, second);
        assertEquals(snapshot.baseDocumentHash(), OverviewBoundaryEditor.snapshot(first.segments()).baseDocumentHash());
        assertThrows(UnsupportedOperationException.class,
                () -> snapshot.segments().add(snapshot.segments().getFirst()));
        var original = snapshot.segments().getFirst();
        var changed = new OverviewBoundaryEditor.SegmentView(original.id(), original.originalTitle(),
                original.originalBody() + " altered", original.segmentHash(), original.titleHash(),
                original.originalBodyHash(), original.blocks());
        var tampered = new OverviewBoundaryEditor.Snapshot(snapshot.baseDocumentHash(), List.of(changed));
        assertThrows(IllegalArgumentException.class, () -> apply(tampered, "[]", "[]"));
        var changedSnapshot = OverviewBoundaryEditor.snapshot(List.of(
                new OverviewBoundaryEditor.Segment("s1", "标题", "altered body")));
        assertThrows(IllegalArgumentException.class,
                () -> OverviewBoundaryEditor.apply(changedSnapshot, root(snapshot, "[]", "[]", "null"), false));
        assertNotEquals(snapshot.baseDocumentHash(), OverviewBoundaryEditor.snapshot(
                List.of(new OverviewBoundaryEditor.Segment("s1", "标题", "other"))).baseDocumentHash());
    }

    @Test
    void requiresGuideOnlyWhenRequestedAndValidatesItsExistingBounds() {
        var snapshot = snapshot("s1", "标题", "正文。");
        String guide = "{\"overview\":\"导读\",\"keyPoints\":[\"重点\"],\"learningPath\":[\"先读\"]}";
        assertEquals("导读", OverviewBoundaryEditor.apply(snapshot, root(snapshot, "[]", "[]", guide), true)
                .guide().overview());
        assertThrows(IllegalArgumentException.class,
                () -> OverviewBoundaryEditor.apply(snapshot, root(snapshot, "[]", "[]", "null"), true));
        assertThrows(IllegalArgumentException.class,
                () -> OverviewBoundaryEditor.apply(snapshot, root(snapshot, "[]", "[]", guide), false));
    }

    private static OverviewBoundaryEditor.Snapshot snapshot(String id, String title, String body) {
        return OverviewBoundaryEditor.snapshot(List.of(new OverviewBoundaryEditor.Segment(id, title, body)));
    }

    private static OverviewBoundaryEditor.Result apply(OverviewBoundaryEditor.Snapshot snapshot,
                                                       String patches, String terms) {
        return OverviewBoundaryEditor.apply(snapshot, root(snapshot, patches, terms, "null"), false);
    }

    private static String root(OverviewBoundaryEditor.Snapshot snapshot, String patches, String terms, String guide) {
        return "{\"schemaVersion\":1,\"baseDocumentHash\":" + q(snapshot.baseDocumentHash())
                + ",\"guide\":" + guide + ",\"segment_patches\":" + patches
                + ",\"terminology_map\":" + terms + "}";
    }

    private static String q(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r") + "\"";
    }
}
