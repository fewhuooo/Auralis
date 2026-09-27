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

    @Test
    void allowsArbitraryOpenAiCompatibleHttpsHostButKeepsOtherProviderAllowlist() {
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of("api.deepseek.com"));

        assertThat(policy.validate(AiProviderType.OPENAI_COMPATIBLE, "https://vendor.example/v1").getHost())
                .isEqualTo("vendor.example");
        assertThatThrownBy(() -> policy.validate(AiProviderType.DEEPSEEK, "https://vendor.example/v1"))
                .isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> policy.validate(AiProviderType.SILICONFLOW, "https://vendor.example/v1"))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void rejectsLocalOpenAiCompatibleHostsEvenWhenArbitraryHostsAreAllowed() {
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of());

        assertThatThrownBy(() -> policy.validate(AiProviderType.OPENAI_COMPATIBLE, "https://localhost/v1"))
                .isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> policy.validate(AiProviderType.OPENAI_COMPATIBLE, "https://service.internal/v1"))
                .isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> policy.resolve(
                AiProviderType.OPENAI_COMPATIBLE, URI.create("https://127.0.0.1/v1")))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void resolvesAndPinsPublicAddressesForArbitraryOpenAiCompatibleHost() throws Exception {
        InetAddress privateAddress = InetAddress.getByAddress("vendor.example", new byte[]{10, 1, 2, 3});
        InetAddress publicAddress = InetAddress.getByAddress(
                "vendor.example", new byte[]{47, (byte) 239, (byte) 184, 63});
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(
                List.of(), ignored -> new InetAddress[]{privateAddress, publicAddress});

        ResolvedProviderEndpoint endpoint = policy.resolve(
                AiProviderType.OPENAI_COMPATIBLE, URI.create("https://vendor.example/v1"));

        assertThat(endpoint.host()).isEqualTo("vendor.example");
        assertThat(endpoint.addresses()).containsExactly(publicAddress);
    }

    @Test
    void rejectsIpv6TransitionAddressesThatCanReachPrivateIpv4Targets() throws Exception {
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of());
        List<InetAddress> addresses = List.of(
                InetAddress.getByAddress(new byte[]{0, 0x64, (byte) 0xff, (byte) 0x9b,
                        0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 1}), // 64:ff9b::10.0.0.1
                InetAddress.getByAddress(new byte[]{0, 0x64, (byte) 0xff, (byte) 0x9b,
                        0, 1, 0, 0, 0, 0, 0, 0, 10, 0, 0, 1}), // 64:ff9b:1::10.0.0.1
                InetAddress.getByAddress(new byte[]{0x20, 0x02, 10, 0, 0, 1,
                        0, 0, 0, 0, 0, 0, 0, 0, 0, 1}), // 2002:0a00:1::1 (6to4)
                InetAddress.getByAddress(new byte[]{0x20, 0x01, 0, 0,
                        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1})); // 2001:0::1 (Teredo)

        for (InetAddress address : addresses) {
            String literal = address.getHostAddress();
            assertThatThrownBy(() -> policy.validate(
                    AiProviderType.OPENAI_COMPATIBLE, "https://[" + literal + "]/v1"))
                    .as("transition address %s", literal)
                    .isInstanceOf(DomainException.class);
        }
    }
}
