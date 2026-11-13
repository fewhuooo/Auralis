package com.auralis.app.ai;

import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

/** Seeds rows from the retired writer protocol for the remaining retention and ledger tests. */
public final class OverviewHistoricalFixtures {
    private OverviewHistoricalFixtures() { }

    public static void insertCheckpoint(JdbcTemplate jdbc, OverviewGenerationCoordinator.GenerationLease lease,
                                        String step, String payload) {
        jdbc.update("insert into overview_generation_checkpoints (id,generation_id,step_key,input_fingerprint,"
                        + "profile_fingerprint,algorithm_version,payload_json,payload_sha256,schema_version) "
                        + "values (?,?,?,?,?,?,?,?,1)",
                UUID.randomUUID(), lease.generationId(), step, lease.inputFingerprint(), lease.profileFingerprint(),
                lease.algorithmVersion(), payload, sha256(payload));
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("SHA-256 is unavailable", unavailable);
        }
    }
}
