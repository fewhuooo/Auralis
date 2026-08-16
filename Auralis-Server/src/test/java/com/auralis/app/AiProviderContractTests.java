package com.auralis.app;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AiProviderContractTests {

    @Test
    void providerPortCarriesConversationMessagesAndNeverRequiresAConcreteSdk() {
        AiProviderPort provider = new FakeProvider();
        AiProviderResponse response = provider.complete(
                new AiProviderRequest(
                        "deepseek-chat",
                        List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")),
                        0.2,
                        1200),
                new AiCredential("https://provider.test", "secret"));

        assertThat(response.content()).isEqualTo("hello");
        assertThat(response.inputTokens()).isEqualTo(1);
    }

    private static final class FakeProvider implements AiProviderPort {
        @Override
        public AiProviderType type() {
            return AiProviderType.DEEPSEEK;
        }

        @Override
        public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            return new AiProviderResponse(request.messages().get(0).content(), 1, 1);
        }
    }
}
