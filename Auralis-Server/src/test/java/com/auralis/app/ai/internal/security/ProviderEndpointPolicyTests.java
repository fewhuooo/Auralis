package com.auralis.app.ai.internal.security;

import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.internal.provider.OpenAiCompatibleProvider;
import com.auralis.app.shared.error.DomainException;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.URI;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.ArrayList;
import java.util.concurrent.ThreadPoolExecutor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProviderEndpointPolicyTests {

    @Test
    void alreadyCancelledOverviewDoesNotStartDnsOrProviderDispatch() {
        AtomicInteger dnsCalls = new AtomicInteger();
        AtomicInteger providerDispatches = new AtomicInteger();
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of(), host -> {
            dnsCalls.incrementAndGet();
            return publicAddress(host);
        });
        OverviewCancellation cancellation = new OverviewCancellation();
        cancellation.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED);

        assertThatThrownBy(() -> provider(policy, providerDispatches).complete(request(),
                new AiCredential("https://vendor.example/v1", "synthetic"), 2_000, cancellation))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_TIMEOUT");
        assertThat(dnsCalls).hasValue(0);
        assertThat(providerDispatches).hasValue(0);
    }

    @Test
    void overviewCancellationReturnsWhileControlledDnsResolutionIsBlocked() throws Exception {
        CountDownLatch dnsEntered = new CountDownLatch(1);
        CountDownLatch releaseDns = new CountDownLatch(1);
        CountDownLatch workerExited = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        AtomicInteger providerDispatches = new AtomicInteger();
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of(), host -> {
            dnsEntered.countDown();
            try {
                if (!releaseDns.await(3, TimeUnit.SECONDS)) throw new java.net.UnknownHostException(host);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new java.net.UnknownHostException(host);
            }
            return new InetAddress[]{InetAddress.getByAddress(host, new byte[]{47, (byte) 239, (byte) 184, 63})};
        });
        OverviewCancellation cancellation = new OverviewCancellation();
        OpenAiCompatibleProvider provider = provider(policy, providerDispatches);
        Future<?> providerCall = executor.submit(() -> {
            try {
                provider.complete(request(), new AiCredential("https://vendor.example/v1", "synthetic"),
                        2_000, cancellation);
            } finally {
                workerExited.countDown();
            }
        });
        try {
            assertThat(dnsEntered.await(1, TimeUnit.SECONDS)).isTrue();
            cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
            assertThat(workerExited.await(150, TimeUnit.MILLISECONDS))
                    .as("provider worker exits promptly after Overview deadline cancellation")
                    .isTrue();
            assertThat(providerDispatches).hasValue(0);
        } finally {
            releaseDns.countDown();
            try { providerCall.get(1, TimeUnit.SECONDS); }
            catch (Exception ignored) { }
            executor.shutdownNow();
            assertThat(executor.awaitTermination(1, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void deadlineTimeoutReturnsWhileDnsResolverRemainsBlocked() throws Exception {
        CountDownLatch dnsEntered = new CountDownLatch(1);
        CountDownLatch releaseDns = new CountDownLatch(1);
        CountDownLatch workerExited = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        ScheduledExecutorService canceller = Executors.newSingleThreadScheduledExecutor();
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of(), host -> {
            dnsEntered.countDown();
            try {
                if (!releaseDns.await(3, TimeUnit.SECONDS)) throw new java.net.UnknownHostException(host);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new java.net.UnknownHostException(host);
            }
            return publicAddress(host);
        });
        OverviewCancellation cancellation = new OverviewCancellation();
        OpenAiCompatibleProvider provider = provider(policy, new AtomicInteger());
        Future<?> providerCall = executor.submit(() -> {
            try {
                provider.complete(request(), new AiCredential("https://vendor.example/v1", "synthetic"),
                        2_000, cancellation);
            } catch (DomainException failure) {
                if (!"MODEL_TIMEOUT".equals(failure.code())) throw failure;
            } finally {
                workerExited.countDown();
            }
        });
        try {
            assertThat(dnsEntered.await(1, TimeUnit.SECONDS)).isTrue();
            canceller.schedule(() -> cancellation.cancel(OverviewCancellation.Reason.DEADLINE),
                    100, TimeUnit.MILLISECONDS);
            assertThat(workerExited.await(500, TimeUnit.MILLISECONDS)).isTrue();
        } finally {
            cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
            releaseDns.countDown();
            try { providerCall.get(1, TimeUnit.SECONDS); }
            catch (Exception ignored) { }
            executor.shutdownNow();
            canceller.shutdownNow();
            assertThat(executor.awaitTermination(1, TimeUnit.SECONDS)).isTrue();
            assertThat(canceller.awaitTermination(1, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void dnsLookupHonorsItsCallTimeoutEvenWithoutCancellation() throws Exception {
        CountDownLatch dnsEntered = new CountDownLatch(1);
        CountDownLatch releaseDns = new CountDownLatch(1);
        CountDownLatch callerExited = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of(), host -> {
            dnsEntered.countDown();
            try {
                if (!releaseDns.await(3, TimeUnit.SECONDS)) throw new java.net.UnknownHostException(host);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new java.net.UnknownHostException(host);
            }
            return publicAddress(host);
        });
        Future<?> lookup = executor.submit(() -> {
            try {
                policy.resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create("https://vendor.example/v1"), 100, null);
            } finally {
                callerExited.countDown();
            }
        });
        try {
            assertThat(dnsEntered.await(1, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> lookup.get(500, TimeUnit.MILLISECONDS))
                    .isInstanceOf(java.util.concurrent.ExecutionException.class)
                    .hasCauseInstanceOf(DomainException.class)
                    .cause().extracting(error -> ((DomainException) error).code())
                    .isEqualTo("MODEL_TIMEOUT");
            assertThat(callerExited.getCount()).isZero();
        } finally {
            releaseDns.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(1, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void boundedDnsQueueRejectsOverflowAndRemovesCancelledQueuedLookup() throws Exception {
        CountDownLatch activeDnsEntered = new CountDownLatch(4);
        CountDownLatch releaseDns = new CountDownLatch(1);
        CountDownLatch queuedCallersReady = new CountDownLatch(8);
        ExecutorService callers = Executors.newFixedThreadPool(14);
        AtomicInteger activeDns = new AtomicInteger();
        AtomicInteger maxActiveDns = new AtomicInteger();
        AtomicBoolean daemonDnsThreads = new AtomicBoolean(true);
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of(), host -> {
            int active = activeDns.incrementAndGet();
            maxActiveDns.accumulateAndGet(active, Math::max);
            daemonDnsThreads.compareAndSet(true, Thread.currentThread().isDaemon()
                    && Thread.currentThread().getName().startsWith("overview-provider-dns-"));
            activeDnsEntered.countDown();
            boolean released = false;
            try {
                while (!released) {
                    try { released = releaseDns.await(3, TimeUnit.SECONDS); }
                    catch (InterruptedException ignored) { }
                }
                return publicAddress(host);
            } finally {
                activeDns.decrementAndGet();
            }
        });
        OpenAiCompatibleProvider provider = provider(policy, new AtomicInteger());
        List<OverviewCancellation> cancellations = new ArrayList<>();
        List<Future<?>> calls = new ArrayList<>();
        try {
            for (int index = 0; index < 4; index++) {
                OverviewCancellation cancellation = new OverviewCancellation();
                cancellations.add(cancellation);
                calls.add(callers.submit(() -> provider.complete(request(),
                        new AiCredential("https://vendor.example/v1", "synthetic"), 5_000, cancellation)));
            }
            assertThat(activeDnsEntered.await(2, TimeUnit.SECONDS)).isTrue();
            for (int index = 0; index < 8; index++) {
                OverviewCancellation cancellation = new OverviewCancellation();
                cancellations.add(cancellation);
                calls.add(callers.submit(() -> {
                    queuedCallersReady.countDown();
                    return provider.complete(request(), new AiCredential("https://vendor.example/v1", "synthetic"),
                            5_000, cancellation);
                }));
            }
            assertThat(queuedCallersReady.await(1, TimeUnit.SECONDS)).isTrue();
            long fullQueueDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
            while (dnsQueue().size() != 8 && System.nanoTime() < fullQueueDeadline) Thread.sleep(5);
            assertThat(dnsQueue()).hasSize(8);
            assertThat(maxActiveDns).hasValue(4);
            assertThat(daemonDnsThreads.get()).isTrue();

            Future<?> overflow = callers.submit(() -> provider.complete(request(),
                    new AiCredential("https://vendor.example/v1", "synthetic"), 5_000, new OverviewCancellation()));
            assertThatThrownBy(() -> overflow.get(500, TimeUnit.MILLISECONDS))
                    .isInstanceOf(java.util.concurrent.ExecutionException.class)
                    .hasCauseInstanceOf(DomainException.class)
                    .cause().extracting(error -> ((DomainException) error).code())
                    .isEqualTo("SERVICE_UNAVAILABLE");

            cancellations.get(4).cancel(OverviewCancellation.Reason.DEADLINE);
            assertThatThrownBy(() -> calls.get(4).get(500, TimeUnit.MILLISECONDS))
                    .isInstanceOf(java.util.concurrent.ExecutionException.class);
            assertThat(dnsQueue()).hasSize(7);
            Future<?> replacement = callers.submit(() -> provider.complete(request(),
                    new AiCredential("https://vendor.example/v1", "synthetic"), 5_000, new OverviewCancellation()));
            long refilledQueueDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
            while (dnsQueue().size() != 8 && System.nanoTime() < refilledQueueDeadline) Thread.sleep(5);
            assertThat(dnsQueue()).hasSize(8);
            assertThat(replacement).isNotDone();
        } finally {
            releaseDns.countDown();
            for (OverviewCancellation cancellation : cancellations) {
                cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
            }
            callers.shutdownNow();
            assertThat(callers.awaitTermination(2, TimeUnit.SECONDS)).isTrue();
        }
    }

    private static OpenAiCompatibleProvider provider(ProviderEndpointPolicy policy, AtomicInteger dispatches) {
        byte[] response = "{\"choices\":[{\"message\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1}}"
                .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        ProviderHttpClient client = new ProviderHttpClient(new ObjectMapper(),
                (endpoint, path, apiKey, requestBody) -> { dispatches.incrementAndGet(); return response; },
                4096, 100, 100);
        return new OpenAiCompatibleProvider(policy, client);
    }

    private static AiProviderRequest request() {
        return new AiProviderRequest("model",
                List.of(new AiProviderRequest.Message(AiMessageRole.USER, "synthetic")), null, null);
    }

    private static InetAddress[] publicAddress(String host) throws java.net.UnknownHostException {
        return new InetAddress[]{InetAddress.getByAddress(host, new byte[]{47, (byte) 239, (byte) 184, 63})};
    }

    @SuppressWarnings("unchecked")
    private static java.util.concurrent.BlockingQueue<Runnable> dnsQueue() {
        try {
            var field = ProviderEndpointPolicy.class.getDeclaredField("OVERVIEW_DNS_EXECUTOR");
            field.setAccessible(true);
            return ((ThreadPoolExecutor) field.get(null)).getQueue();
        } catch (ReflectiveOperationException failure) {
            throw new AssertionError("Overview DNS executor is unavailable to the regression", failure);
        }
    }

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
