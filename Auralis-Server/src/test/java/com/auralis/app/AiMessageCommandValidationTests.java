package com.auralis.app;

import com.auralis.app.ai.AiMessageCommand;
import com.auralis.app.shared.error.DomainException;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiMessageCommandValidationTests {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void validatesProtocolOneTurnAndSelectionLimit() {
        AiMessageCommand atLimit = new AiMessageCommand(1, "turn", java.util.UUID.randomUUID(), "req-1",
                "question", null, "x".repeat(4000), null, null, null, null);
        AiMessageCommand overLimit = new AiMessageCommand(1, "turn", java.util.UUID.randomUUID(), "req-2",
                "question", null, "x".repeat(4001), null, null, null, null);

        assertThat(validator.validate(atLimit)).isEmpty();
        assertThatCode(atLimit::validateProtocol).doesNotThrowAnyException();
        assertThat(validator.validate(overLimit))
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("selectionText");
    }

    @Test
    void rejectsActivityFieldsOnTurnAndUnsupportedProtocol() {
        AiMessageCommand wrongActionShape = new AiMessageCommand(1, "turn", java.util.UUID.randomUUID(), "req-1",
                "question", null, null, java.util.UUID.randomUUID(), null, null, null);
        AiMessageCommand unsupported = new AiMessageCommand(2, "turn", java.util.UUID.randomUUID(), "req-2",
                "question", null, null, null, null, null, null);

        assertThatThrownBy(wrongActionShape::validateProtocol).isInstanceOf(DomainException.class);
        assertThatThrownBy(unsupported::validateProtocol).isInstanceOf(DomainException.class);
    }

    @Test
    void acceptsOnlyRawTextOrStringArrayAnswerJsonShapes() throws Exception {
        var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
        var base = new AiMessageCommand(1, "activity_submission", java.util.UUID.randomUUID(), "submission-1",
                null, null, null, java.util.UUID.randomUUID(), 1, java.util.UUID.randomUUID(),
                mapper.readTree("\"raw answer\""));
        var choices = new AiMessageCommand(1, "activity_submission", base.conversationId(), "submission-2",
                null, null, null, base.activityId(), 1, java.util.UUID.randomUUID(), mapper.readTree("[\"A\",\"B\"]"));
        var wrapped = new AiMessageCommand(1, "activity_submission", base.conversationId(), "submission-3",
                null, null, null, base.activityId(), 1, java.util.UUID.randomUUID(), mapper.readTree("{\"text\":\"raw answer\"}"));

        assertThatCode(base::validateProtocol).doesNotThrowAnyException();
        assertThatCode(choices::validateProtocol).doesNotThrowAnyException();
        assertThatThrownBy(wrapped::validateProtocol).isInstanceOf(DomainException.class);
    }
}
