package com.auralis.app.ai.usage;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiGatewayBoundaryTests {
    @Test
    void missingOrHistoricalSourceCannotEnterANewPolicyCall() {
        assertThatThrownBy(() -> AiCredentialSource.requireKnown(null)).isInstanceOf(AiPolicyContractException.class);
        assertThatThrownBy(() -> AiCredentialSource.requireKnown(AiCredentialSource.LEGACY_UNKNOWN))
                .isInstanceOf(AiPolicyContractException.class);
    }
}
