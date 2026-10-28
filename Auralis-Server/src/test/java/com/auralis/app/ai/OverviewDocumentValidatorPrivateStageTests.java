package com.auralis.app.ai;

import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverviewDocumentValidatorPrivateStageTests {

    @Test
    void privateIndexCoverageParsingDefersOnlyFinalDocumentVolumeCaps() {
        OverviewDocumentValidator validator = new OverviewDocumentValidator(new ObjectMapper(),
                new AuralisProperties.OverviewLimits(0, 0, 0, 0, 0,
                        20, 0, 0, 0, 1,
                        1, 3, 1, 1, 0,
                        0, 0, 0, 0, 0,
                        0, 0, 0, 3, 0, 0));
        String prose = "A private catalog section with enough text to exceed the final prose cap.";
        String rawJson = "{\"schemaVersion\":1,\"title\":\"long private catalog title\",\"outline\":["
                + "{\"title\":\"catalog chapter one\",\"sections\":[{\"title\":\"catalog concept one\","
                + "\"summary\":\"" + prose + "\",\"sourceIds\":[\"A\",\"B\"]}]},"
                + "{\"title\":\"catalog chapter two\",\"sections\":[{\"title\":\"catalog concept two\","
                + "\"summary\":\"" + prose + "\",\"sourceIds\":[\"A\",\"B\"]}]}],\"summary\":null}";

        var privateDocument = validator.validateProviderDocumentForIndexCoverage(rawJson, null, false);

        assertThat(privateDocument.title()).isEqualTo("long private catalog title");
        assertThat(privateDocument.outline()).hasSize(2);
        assertThat(privateDocument.outline()).allSatisfy(chapter -> assertThat(chapter.sections()).hasSize(1));
        assertThatThrownBy(() -> validator.validateProviderDocument(rawJson,
                Map.of("A", "source-a", "B", "source-b")))
                .isInstanceOf(RuntimeException.class);
    }
}
