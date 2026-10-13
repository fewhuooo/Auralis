package com.auralis.app;

import com.auralis.app.ai.AiMessageCommand;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AiMessageCommandValidationTests {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void acceptsASelectionAtTheMaximumAndRejectsOneCharacterOver() {
        AiMessageCommand atLimit = new AiMessageCommand(
                null, "question", null, null, null, null, "x".repeat(4000));
        AiMessageCommand overLimit = new AiMessageCommand(
                null, "question", null, null, null, null, "x".repeat(4001));

        assertThat(validator.validate(atLimit)).isEmpty();
        assertThat(validator.validate(overLimit))
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("selectionText");
    }
}
