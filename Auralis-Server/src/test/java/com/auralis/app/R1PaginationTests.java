package com.auralis.app;

import com.auralis.app.knowledge.KnowledgeBlockCommand;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.relation.RelationCommand;
import com.auralis.app.relation.RelationNodeType;
import com.auralis.app.relation.RelationService;
import com.auralis.app.relation.RelationType;
import com.auralis.app.shared.pagination.CursorPage;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.subject.SubjectView;
import com.auralis.app.task.TaskCommand;
import com.auralis.app.task.TaskService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class R1PaginationTests {

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private KnowledgeBlockService knowledgeBlockService;

    @Autowired
    private TaskService taskService;

    @Autowired
    private SourceService sourceService;

    @Autowired
    private RelationService relationService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void allCoreCursorListsReturnStablePages() {
        UUID userId = insertUser("r1-page-" + UUID.randomUUID());
        SubjectView firstSubject = subjectService.create(userId,
                new SubjectCommand("Page A", null, null, null, "001"));
        SubjectView secondSubject = subjectService.create(userId,
                new SubjectCommand("Page B", null, null, null, "002"));
        SubjectView thirdSubject = subjectService.create(userId,
                new SubjectCommand("Page C", null, null, null, "003"));

        var subjects = subjectService.list(userId, null, 2);
        var subjectsNext = subjectService.list(userId, subjects.nextCursor(), 2);
        assertPageBoundary(subjects, subjectsNext, 3);

        knowledgeBlockService.create(userId, new KnowledgeBlockCommand(
                firstSubject.id(), null, "Block A", null, "content A", java.util.List.of(), null));
        knowledgeBlockService.create(userId, new KnowledgeBlockCommand(
                secondSubject.id(), null, "Block B", null, "content B", java.util.List.of(), null));
        var blocks = knowledgeBlockService.list(userId, null, 1);
        assertThat(blocks.items()).hasSize(1);
        assertThat(blocks.nextCursor()).isNotBlank();
        assertThat(knowledgeBlockService.list(userId, blocks.nextCursor(), 1).items()).hasSize(1);

        taskService.create(userId, new TaskCommand(
                firstSubject.id(), "Task A", null, null, null, null, null, null, "001", null));
        taskService.create(userId, new TaskCommand(
                secondSubject.id(), "Task B", null, null, null, null, null, null, "002", null));
        var tasks = taskService.list(userId, null, 1);
        assertThat(tasks.items()).hasSize(1);
        assertThat(tasks.nextCursor()).isNotBlank();

        sourceService.create(userId, new SourceCommand(
                firstSubject.id(), SourceType.TEXT, "Source A", null, null, "raw A", null));
        sourceService.create(userId, new SourceCommand(
                secondSubject.id(), SourceType.TEXT, "Source B", null, null, "raw B", null));
        var sources = sourceService.list(userId, null, 1);
        assertThat(sources.items()).hasSize(1);
        assertThat(sources.nextCursor()).isNotBlank();

        relationService.create(userId, new RelationCommand(
                RelationNodeType.SUBJECT, firstSubject.id(), RelationNodeType.SUBJECT,
                secondSubject.id(), RelationType.CONTAINS, null));
        relationService.create(userId, new RelationCommand(
                RelationNodeType.SUBJECT, secondSubject.id(), RelationNodeType.SUBJECT,
                thirdSubject.id(), RelationType.CONTAINS, null));
        var relations = relationService.list(userId, null, 1);
        assertThat(relations.items()).hasSize(1);
        assertThat(relations.nextCursor()).isNotBlank();
    }

    private void assertPageBoundary(CursorPage<SubjectView> first, CursorPage<SubjectView> second, int total) {
        assertThat(first.items()).hasSize(2);
        assertThat(first.hasMore()).isTrue();
        assertThat(first.nextCursor()).isNotBlank();
        assertThat(second.items()).hasSize(total - 2);
        assertThat(second.hasMore()).isFalse();
        assertThat(second.nextCursor()).isNull();
        assertThat(first.items()).extracting(SubjectView::id)
                .doesNotContainAnyElementsOf(second.items().stream().map(SubjectView::id).toList());
    }

    private UUID insertUser(String username) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users(id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                id, username, username, "{noop}r1-test-password");
        return id;
    }
}
