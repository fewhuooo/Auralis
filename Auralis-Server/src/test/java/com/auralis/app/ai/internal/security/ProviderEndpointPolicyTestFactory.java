package com.auralis.app.ai.internal.security;

import java.net.InetAddress;
import java.util.List;

/** Test-only construction seam for provider tests that need deterministic DNS results. */
public final class ProviderEndpointPolicyTestFactory {
    private ProviderEndpointPolicyTestFactory() { }

    public static ProviderEndpointPolicy fakeDns() {
        return new ProviderEndpointPolicy(List.of(), host -> new InetAddress[]{
                InetAddress.getByAddress(host, new byte[]{47, (byte) 239, (byte) 184, 63})});
    }
}
