package com.auralis.app;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderModelIdentity;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.internal.provider.OpenAiCompatibleProvider;
import com.auralis.app.ai.internal.provider.SiliconFlowEmbeddingProvider;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.ai.usage.AiTokenUsage;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.lang.reflect.RecordComponent;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiProviderModelObservationTests {
    private static final String BASE_URL = "https://provider.test/v1";
    private static final ResolvedProviderEndpoint ENDPOINT =
            new ResolvedProviderEndpoint("provider.test", 443, List.of(), "/v1");

    @Test
    void completionKeepsReturnedModelSeparateFromRequestedModel() throws Exception {
        OpenAiCompatibleProvider provider = completionProvider(
                "{\"model\":\"vendor/model-v2\",\"choices\":[{\"message\":{\"content\":\"safe answer\"},\"finish_reason\":\"stop\"}],"
                        + "\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":2}} ");

        AiProviderResponse response = provider.complete(request("requested-model"), credential());

        assertThat(response.content()).isEqualTo("safe answer");
        assertThat(response.usage()).isEqualTo(new AiTokenUsage(5L, 2L));
        assertThat(recordComponentNames(AiProviderResponse.class)).contains("modelIdentity");
        Object identity = modelIdentity(response);
        assertThat(identityStatus(identity)).isEqualTo("OBSERVED");
        assertThat(identityModel(identity)).isEqualTo("vendor/model-v2");
    }

    @Test
    void missingAndUnsafeResponseModelsRemainUnknownWithoutChangingProviderResult() throws Exception {
        String vector = String.join(",", Collections.nCopies(1024, "0.1"));
        for (String responseModel : List.of("", "https://user:pass@provider.test/model?key=x", "model?query",
                "model#fragment", "user@host/model", "provider.test/model", "sk-secret-value", "model\nforged",
                "m".repeat(81))) {
            String field = responseModel.isEmpty() ? "\"model\":\"\"," : "\"model\":\"" + responseModel
                    .replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\",";
            AiProviderResponse response = completionProvider("{" + field
                    + "\"choices\":[{\"message\":{\"content\":\"unchanged\"},\"finish_reason\":\"length\"}],"
                    + "\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3}}")
                    .complete(request("requested-model"), credential());

            assertThat(response.content()).isEqualTo("unchanged");
            assertThat(response.usage()).isEqualTo(new AiTokenUsage(7L, 3L));
            Object identity = modelIdentity(response);
            assertThat(identityStatus(identity)).isEqualTo("INVALID");
            assertThat(identityModel(identity)).isEqualTo("unknown");
        }

        SiliconFlowEmbeddingProvider embeddingProvider = embeddingProvider(
                "{\"model\":\"https://provider.test/embed\",\"data\":[{\"index\":0,\"embedding\":[" + vector
                        + "]}],\"usage\":{\"prompt_tokens\":9,\"completion_tokens\":0}}");
        var embedding = embeddingProvider.embed(List.of("sample"), credential());
        assertThat(embedding.usage()).isEqualTo(new AiTokenUsage(9L, 0L));
        assertThat(recordComponentNames(embedding.getClass())).contains("modelIdentity");
        Object identity = modelIdentity(embedding);
        assertThat(identityStatus(identity)).isEqualTo("INVALID");
        assertThat(identityModel(identity)).isEqualTo("unknown");

        AiProviderResponse missing = completionProvider(
                "{\"choices\":[{\"message\":{\"content\":\"unchanged\"}}]}")
                .complete(request("requested-model"), credential());
        assertThat(identityStatus(modelIdentity(missing))).isEqualTo("MISSING");
        assertThat(identityModel(modelIdentity(missing))).isEqualTo("unknown");

        AiProviderResponse nonTextModel = completionProvider(
                "{\"model\":42,\"choices\":[{\"message\":{\"content\":\"unchanged\"}}],"
                        + "\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1}}")
                .complete(request("requested-model"), credential());
        assertThat(nonTextModel.content()).isEqualTo("unchanged");
        assertThat(nonTextModel.usage()).isEqualTo(new AiTokenUsage(2L, 1L));
        assertThat(identityStatus(modelIdentity(nonTextModel))).isEqualTo("INVALID");
        assertThat(identityModel(modelIdentity(nonTextModel))).isEqualTo("unknown");
    }

    @Test
    void streamingCarriesOnlyResponseIdentityAndKeepsDifferentObservationsVisibleForAggregation() throws Exception {
        ProviderEndpointPolicy policy = endpointPolicy();
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body) {
                throw new AssertionError("streaming must not use buffered JSON transport");
            }

            @Override
            public void postStream(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body,
                                  java.util.function.Consumer<String> lineConsumer) {
                lineConsumer.accept("data: {\"model\":\"vendor/model-a\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}");
                lineConsumer.accept("data: {\"choices\":[{\"delta\":{\"content\":\"x\"}}]}");
                lineConsumer.accept("data: {\"model\":\"vendor/model-b\",\"choices\":[],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":1}}");
                lineConsumer.accept("data: [DONE]");
            }
        };
        OpenAiCompatibleProvider provider = new OpenAiCompatibleProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 4096));
        List<AiProviderChunk> chunks = new ArrayList<>();

        provider.streamInto(request("requested-model"), credential(), chunks::add);

        assertThat(recordComponentNames(AiProviderChunk.class)).contains("modelIdentity");
        assertThat(chunks.stream().filter(chunk -> chunk.content() != null && !chunk.content().isEmpty()).count())
                .isEqualTo(1);
        assertThat(chunks.getFirst().content()).isEmpty();
        assertThat(identityStatus(modelIdentity(chunks.getFirst()))).isEqualTo("OBSERVED");
        assertThat(identityModel(modelIdentity(chunks.getFirst()))).isEqualTo("vendor/model-a");
        assertThat(chunks.stream().map(AiProviderModelObservationTests::modelIdentityUnchecked)
                .map(AiProviderModelObservationTests::identityStatusUnchecked).toList())
                .containsExactly("OBSERVED", "MISSING", "OBSERVED", "MISSING");
    }

    @Test
    void identityMergeIsMonotonicAndConflictsOnlyOnDifferentValidIdentifiers() {
        AiProviderModelIdentity first = AiProviderModelIdentity.fromProviderValue("vendor/model-a");
        AiProviderModelIdentity repeated = AiProviderModelIdentity.fromProviderValue("vendor/model-a");
        AiProviderModelIdentity different = AiProviderModelIdentity.fromProviderValue("vendor/model-b");

        assertThat(first.merge(AiProviderModelIdentity.missing())).isEqualTo(first);
        assertThat(first.merge(repeated)).isEqualTo(first);
        assertThat(first.merge(different).status()).isEqualTo(AiProviderModelIdentity.Status.CONFLICT);
        assertThat(first.merge(AiProviderModelIdentity.invalid()).status())
                .isEqualTo(AiProviderModelIdentity.Status.INVALID);
        assertThat(first.merge(AiProviderModelIdentity.invalid())
                .merge(repeated).status()).isEqualTo(AiProviderModelIdentity.Status.INVALID);
        assertThat(AiProviderModelIdentity.invalid().merge(first).status())
                .isEqualTo(AiProviderModelIdentity.Status.INVALID);
        assertThat(AiProviderModelIdentity.invalid().merge(different).merge(first).status())
                .isEqualTo(AiProviderModelIdentity.Status.INVALID);
    }

    @Test
    void requestedModelLoggingValueRejectsUrlsCredentialsAndUnboundedIdentifiers() {
        assertThat(AiProviderModelIdentity.safeRequestedModel("vendor/model-v2")).isEqualTo("vendor/model-v2");
        for (String unsafe : List.of("https://user:pass@provider.test/model?key=x", "model?query", "model#fragment",
                "user@host/model", "provider.test/model", "sk-secret-value", "bearer-token", "m".repeat(81))) {
            assertThat(AiProviderModelIdentity.safeRequestedModel(unsafe)).isEqualTo("unknown");
        }
    }

    private OpenAiCompatibleProvider completionProvider(String response) {
        ProviderEndpointPolicy policy = endpointPolicy();
        ProviderHttpTransport transport = (resolved, path, apiKey, body) -> response.getBytes(StandardCharsets.UTF_8);
        return new OpenAiCompatibleProvider(policy, new ProviderHttpClient(new ObjectMapper(), transport, 100_000));
    }

    private SiliconFlowEmbeddingProvider embeddingProvider(String response) {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        when(policy.resolve(AiProviderType.SILICONFLOW, URI.create(BASE_URL))).thenReturn(ENDPOINT);
        ProviderHttpTransport transport = (resolved, path, apiKey, body) -> response.getBytes(StandardCharsets.UTF_8);
        return new SiliconFlowEmbeddingProvider(policy, new ProviderHttpClient(new ObjectMapper(), transport, 100_000));
    }

    private ProviderEndpointPolicy endpointPolicy() {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        when(policy.resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create(BASE_URL))).thenReturn(ENDPOINT);
        return policy;
    }

    private static AiProviderRequest request(String model) {
        return new AiProviderRequest(model,
                List.of(new AiProviderRequest.Message(AiMessageRole.USER, "synthetic")), null, null);
    }

    private static AiCredential credential() {
        return new AiCredential(BASE_URL, "synthetic-key", "embedding-model");
    }

    private static List<String> recordComponentNames(Class<?> type) {
        return java.util.Arrays.stream(type.getRecordComponents()).map(RecordComponent::getName).toList();
    }

    private static Object modelIdentity(Object value) throws Exception {
        return value.getClass().getMethod("modelIdentity").invoke(value);
    }

    private static String identityStatus(Object identity) throws Exception {
        return identity.getClass().getMethod("status").invoke(identity).toString();
    }

    private static String identityModel(Object identity) throws Exception {
        return (String) identity.getClass().getMethod("modelId").invoke(identity);
    }

    private static Object modelIdentityUnchecked(AiProviderChunk chunk) {
        try {
            return modelIdentity(chunk);
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private static String identityStatusUnchecked(Object identity) {
        try {
            return identityStatus(identity);
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }
}
