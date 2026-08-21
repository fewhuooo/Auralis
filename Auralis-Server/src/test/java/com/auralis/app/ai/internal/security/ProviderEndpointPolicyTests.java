package com.auralis.app.ai.internal.security;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProviderEndpointPolicyTests {

    @Test
    void keepsPublicDnsAnswersWhenResolverAlsoReturnsSyntheticPrivateAddress() throws Exception {
        InetAddress synthetic = InetAddress.getByAddress("provider.test", new byte[]{(byte) 198, 18, 0, 29});
        InetAddress publicAddress = InetAddress.getByAddress("provider.test", new byte[]{47, (byte) 239, (byte) 184, 63});
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(
                List.of("provider.test"),
                ignored -> new InetAddress[]{synthetic, publicAddress});

        ResolvedProviderEndpoint endpoint = policy.resolve(
                AiProviderType.SILICONFLOW,
                URI.create("https://provider.test/v1"));

        assertThat(endpoint.addresses()).containsExactly(publicAddress);
    }

    @Test
    void rejectsProviderWhenDnsOnlyReturnsPrivateAddresses() throws Exception {
        InetAddress synthetic = InetAddress.getByAddress("provider.test", new byte[]{(byte) 198, 18, 0, 29});
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(
                List.of("provider.test"),
                ignored -> new InetAddress[]{synthetic});

        assertThatThrownBy(() -> policy.resolve(
                AiProviderType.SILICONFLOW,
                URI.create("https://provider.test/v1")))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("VALIDATION_FAILED");
    }
}
