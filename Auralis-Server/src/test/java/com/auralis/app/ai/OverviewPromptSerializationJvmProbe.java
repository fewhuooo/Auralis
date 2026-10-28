package com.auralis.app.ai;

public final class OverviewPromptSerializationJvmProbe {

    private OverviewPromptSerializationJvmProbe() {
    }

    public static void main(String[] args) throws Exception {
        OverviewAdaptiveGenerationTests.captureAdaptivePromptHashes().forEach(System.out::println);
    }
}
