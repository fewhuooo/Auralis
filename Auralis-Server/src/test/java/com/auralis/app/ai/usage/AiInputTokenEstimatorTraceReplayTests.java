package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/** Local only: activates when the caller explicitly supplies the private trace export directory. */
class AiInputTokenEstimatorTraceReplayTests {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String MODEL = "deepseek-v4-flash";
    private static final String TARGET_RUN_ID = "4259b5e4-a9fd-4499-858d-cd2bb1630abf";
    private static final String MIMO_ENDPOINT = "https://api.xiaomimimo.com/v1";
    private static final String MIMO_MODEL = "mimo-v2.6-flash";
    private static final Set<String> MIMO_TRACE_RUN_IDS = Set.of(
            "95875b4b-7462-405d-a751-f6299e9d4741", "f99e36a7-09d1-44ef-ac4c-0b1c4f81eda5");

    @Test
    void usageParserAcceptsOnlyNonnegativeIntegralValues() {
        assertThat(optionalLong(JSON.readTree("12"))).isEqualTo(12L);
        assertThat(optionalLong(JSON.readTree("\"12\""))).isEqualTo(12L);
        assertThat(optionalLong(JSON.readTree("12.9"))).isNull();
        assertThat(optionalLong(JSON.readTree("-12"))).isNull();
        assertThat(optionalLong(JSON.readTree("9223372036854775808"))).isNull();
        assertThat(optionalLong(JSON.readTree("\"-12\""))).isNull();
        assertThat(optionalLong(JSON.readTree("\"12.0\""))).isNull();
        assertThat(optionalLong(JSON.readTree("\"9223372036854775808\""))).isNull();
    }

    @Test
    void replaysCompletePrivateTracesAsHoldoutValidationWithoutPrintingPrompts() throws Exception {
        String configuredRoot = System.getProperty("auralis.ai.overview-token-estimator-replay-dir");
        Assumptions.assumeTrue(configuredRoot != null && !configuredRoot.isBlank(),
                "Private trace replay is opt-in and requires an explicit local directory");
        Path root = Path.of(configuredRoot).toAbsolutePath().normalize();
        String endpoint = System.getProperty("auralis.ai.overview-token-estimator-replay-endpoint",
                "https://api.deepseek.com");
        List<Sample> samples = loadSamples(root, endpoint);
        List<Sample> targetRun = samples.stream().filter(sample -> TARGET_RUN_ID.equals(sample.runId())).toList();
        long targetRunUniquePairs = targetRun.stream().map(Sample::promptHash).distinct().count();

        Map<String, List<Sample>> unique = new HashMap<>();
        for (Sample sample : samples) unique.computeIfAbsent(sample.promptHash(), ignored -> new ArrayList<>()).add(sample);
        int callUnderruns = (int) samples.stream().filter(sample -> sample.actualInput() != null
                && sample.estimatedTokens() < sample.actualInput()).count();
        List<Sample> uniqueValidation = unique.values().stream()
                .filter(group -> group.stream().anyMatch(sample -> sample.actualInput() != null))
                .map(group -> group.stream().filter(sample -> sample.actualInput() != null)
                        .max(java.util.Comparator.comparingLong(sample -> sample.actualInput())).orElseThrow())
                .toList();
        long supportedCompleteUnique = unique.values().stream()
                .filter(group -> group.stream().anyMatch(sample -> sample.actualInput() != null
                        && sample.actualOutput() != null && sample.estimate().categoryMessages() > 0)).count();
        int uniqueUnderruns = (int) uniqueValidation.stream()
                .filter(sample -> sample.estimatedTokens() < sample.actualInput()).count();
        long actualTotal = uniqueValidation.stream().mapToLong(Sample::actualInput).sum();
        long legacyTotal = uniqueValidation.stream().mapToLong(Sample::legacyTokens).sum();
        long estimateTotal = uniqueValidation.stream().mapToLong(Sample::estimatedTokens).sum();
        double legacyErrorPct = percent(legacyTotal - actualTotal, actualTotal);
        double estimateErrorPct = percent(estimateTotal - actualTotal, actualTotal);
        double reservationReductionPct = percent(legacyTotal - estimateTotal, legacyTotal);
        long legacyAbsoluteError = uniqueValidation.stream()
                .mapToLong(sample -> Math.abs(sample.legacyTokens() - sample.actualInput())).sum();
        long estimateAbsoluteError = uniqueValidation.stream()
                .mapToLong(sample -> Math.abs(sample.estimatedTokens() - sample.actualInput())).sum();
        double meanAbsoluteErrorPct = uniqueValidation.stream().filter(sample -> sample.actualInput() > 0)
                .mapToDouble(sample -> Math.abs(sample.estimatedTokens() - sample.actualInput())
                        * 100.0 / sample.actualInput()).average().orElse(0);
        double minimumCoveragePct = uniqueValidation.stream().filter(sample -> sample.actualInput() > 0)
                .mapToDouble(sample -> sample.estimatedTokens() * 100.0 / sample.actualInput()).min().orElse(0);

        Map<String, StageStats> byStage = new HashMap<>();
        for (Sample sample : samples) {
            byStage.computeIfAbsent(sample.stage(), ignored -> new StageStats()).addCall(sample);
        }
        Map<String, Map<String, List<Sample>>> uniqueByStage = new HashMap<>();
        for (Sample sample : samples) {
            uniqueByStage.computeIfAbsent(sample.stage(), ignored -> new HashMap<>())
                    .computeIfAbsent(sample.promptHash(), ignored -> new ArrayList<>()).add(sample);
        }
        for (Map.Entry<String, Map<String, List<Sample>>> stage : uniqueByStage.entrySet()) {
            StageStats stats = byStage.computeIfAbsent(stage.getKey(), ignored -> new StageStats());
            for (List<Sample> group : stage.getValue().values()) {
                Sample representative = group.stream().filter(sample -> sample.actualInput() != null)
                        .max(java.util.Comparator.comparingLong(sample -> sample.actualInput()))
                        .orElseGet(() -> group.stream().findFirst().orElseThrow());
                stats.addUnique(representative);
            }
        }
        long indexCoveredPairs = unique.values().stream().filter(group -> group.stream()
                .anyMatch(sample -> sample.stage().contains("INDEX") && sample.estimate().categoryMessages() > 0)).count();
        long routeCoveredPairs = unique.values().stream().filter(group -> group.stream()
                .anyMatch(sample -> sample.stage().contains("ROUTE") && sample.estimate().categoryMessages() > 0)).count();
        long incompleteUsage = samples.stream().filter(sample -> sample.actualInput() == null
                || sample.actualOutput() == null).count();
        long uniqueUsageConflicts = unique.values().stream().filter(group -> group.stream()
                .map(Sample::actualInput).distinct().count() > 1).count();
        long writerSamples = samples.stream().filter(sample -> sample.stage().contains("WRITE")).count();
        String outcomes = samples.stream().map(Sample::runOutcome).distinct().sorted().reduce((a, b) -> a + "," + b)
                .orElse("unknown");
        String gate = gatePass(samples, supportedCompleteUnique, indexCoveredPairs,
                routeCoveredPairs, callUnderruns, uniqueUnderruns) ? "PASS" : "HOLD";

        System.out.printf(Locale.ROOT,
                "OVERVIEW_TOKEN_ESTIMATOR_HOLDOUT runs=%d calls=%d uniquePromptPairs=%d targetRunCalls=%d "
                        + "targetRunUniquePairs=%d "
                        + "requestCharacterCountsVerified=true "
                        + "categoryCalls=%d categoryMessages=%d byteMessages=%d supportedCompleteUniquePairs=%d "
                        + "indexUniquePairs=%d "
                        + "indexCategoryPairs=%d routeUniquePairs=%d routeCategoryPairs=%d writerSamples=%d "
                        + "runOutcomes=%s "
                        + "legacyInput=%d estimatedInput=%d actualInput=%d legacyErrorPct=%.2f "
                        + "estimateErrorPct=%.2f legacyAbsoluteError=%d estimateAbsoluteError=%d "
                        + "meanAbsoluteErrorPct=%.2f minimumCoveragePct=%.2f reservationReductionPct=%.2f "
                        + "callUnderestimates=%d uniqueUnderestimates=%d incompleteUsage=%d "
                        + "duplicateUsageConflictPairs=%d gate=%s%n",
                countDistinctRuns(samples), samples.size(), unique.size(), targetRun.size(), targetRunUniquePairs,
                samples.stream().filter(sample -> sample.estimate().categoryMessages() > 0).count(),
                samples.stream().mapToInt(sample -> sample.estimate().categoryMessages()).sum(),
                samples.stream().mapToInt(sample -> sample.estimate().byteMessages()).sum(),
                supportedCompleteUnique,
                byStage.getOrDefault("ADAPTIVE_INDEX", new StageStats()).uniquePrompts(), indexCoveredPairs,
                byStage.getOrDefault("ADAPTIVE_METADATA_ROUTE", new StageStats()).uniquePrompts(), routeCoveredPairs,
                writerSamples, outcomes,
                legacyTotal, estimateTotal, actualTotal, legacyErrorPct, estimateErrorPct,
                legacyAbsoluteError, estimateAbsoluteError, meanAbsoluteErrorPct, minimumCoveragePct,
                reservationReductionPct, callUnderruns, uniqueUnderruns, incompleteUsage,
                uniqueUsageConflicts, gate);
        Path reportPath = reportPath(root);
        writeReport(reportPath, samples, unique.size(), targetRun.size(), targetRunUniquePairs,
                supportedCompleteUnique, indexCoveredPairs, routeCoveredPairs, writerSamples,
                incompleteUsage, legacyTotal, estimateTotal, actualTotal, legacyErrorPct,
                estimateErrorPct, legacyAbsoluteError, estimateAbsoluteError, meanAbsoluteErrorPct,
                minimumCoveragePct, reservationReductionPct, callUnderruns, uniqueUnderruns,
                uniqueUsageConflicts, byStage, gate);
        System.out.printf(Locale.ROOT, "OVERVIEW_TOKEN_ESTIMATOR_REPORT path=%s%n", reportPath);
        for (Map.Entry<String, StageStats> entry : byStage.entrySet().stream().sorted(Map.Entry.comparingByKey()).toList()) {
            StageStats stage = entry.getValue();
            System.out.printf(Locale.ROOT,
                    "OVERVIEW_TOKEN_ESTIMATOR_STAGE stage=%s calls=%d uniquePromptPairs=%d "
                            + "categoryCalls=%d legacyInput=%d estimatedInput=%d actualInput=%d "
                            + "underestimates=%d%n",
                    entry.getKey(), stage.calls(), stage.uniquePrompts(), stage.categoryCalls(),
                    stage.legacyInput(), stage.estimatedInput(), stage.actualInput(), stage.underestimates());
        }

        assertThat(samples).as("complete, sequentially matched trace requests").isNotEmpty();
        assertThat(targetRun).as("target 4259 run has 11 sequentially matched Provider responses").hasSize(11);
        assertThat(targetRunUniquePairs).as("target 4259 run has 11 distinct system/user prompt hashes").isEqualTo(11);
        assertThat(gate).as("opt-in offline category admission gate; inspect the redacted report first")
                .isEqualTo("PASS");
        assertThat(targetRunUniquePairs).as("target run distinct captured system/user prompt pairs").isEqualTo(11);
    }

    @Test
    void replaysMimoTraceCallsAsIndependentOfflineHoldoutWithoutPrintingPrompts() throws Exception {
        String configuredRoot = System.getProperty("auralis.ai.mimo-estimator-replay-dir");
        Assumptions.assumeTrue(configuredRoot != null && !configuredRoot.isBlank(),
                "MiMo trace replay is opt-in and requires the local private trace owner directory");
        Path root = Path.of(configuredRoot).toAbsolutePath().normalize();
        List<Sample> samples = loadMimoSamples(root);
        Map<String, List<Sample>> byPrompt = new HashMap<>();
        for (Sample sample : samples) {
            byPrompt.computeIfAbsent(sample.promptHash(), ignored -> new ArrayList<>()).add(sample);
        }
        List<Sample> unique = byPrompt.values().stream()
                .map(group -> group.stream().filter(sample -> sample.actualInput() != null)
                        .max(java.util.Comparator.comparingLong(Sample::actualInput)).orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
        List<Sample> holdout = unique.stream().filter(AiInputTokenEstimatorTraceReplayTests::isHoldout).toList();
        List<Sample> training = unique.stream().filter(sample -> !isHoldout(sample)).toList();
        int underestimates = (int) holdout.stream()
                .filter(sample -> sample.estimatedTokens() < sample.actualInput()).count();
        long estimateTotal = holdout.stream().mapToLong(Sample::estimatedTokens).sum();
        long actualTotal = holdout.stream().mapToLong(Sample::actualInput).sum();
        long legacyTotal = holdout.stream().mapToLong(Sample::legacyTokens).sum();
        long supported = holdout.stream().filter(sample -> sample.estimate().categoryMessages() > 0).count();
        String gate = holdout.size() >= 10 && training.size() >= 10 && supported > 0 && underestimates == 0
                ? "PASS" : "HOLD";
        System.out.printf(Locale.ROOT,
                "MIMO_TOKEN_ESTIMATOR_HOLDOUT runs=%d pairedCalls=%d uniquePrompts=%d training=%d holdout=%d "
                        + "supportedHoldout=%d candidateInput=%d actualInput=%d legacyInput=%d "
                        + "underestimates=%d unavailableUsage=%d cacheReuseCountedAsUsage=false gate=%s%n",
                MIMO_TRACE_RUN_IDS.size(), samples.size(), unique.size(), training.size(), holdout.size(), supported,
                estimateTotal, actualTotal, legacyTotal, underestimates,
                loadMimoUnavailableCount(root) + samples.stream()
                        .filter(sample -> sample.actualInput() == null || sample.actualOutput() == null).count(), gate);

        assertThat(samples).hasSize(86);
        assertThat(holdout).hasSizeGreaterThanOrEqualTo(10);
        assertThat(gate).isEqualTo("PASS");
    }

    private static List<Sample> loadMimoSamples(Path root) throws IOException {
        if (!Files.isDirectory(root)) throw new IOException("Configured MiMo trace directory is not a directory");
        List<Sample> output = new ArrayList<>();
        for (String runId : MIMO_TRACE_RUN_IDS) {
            Path file = root.resolve(runId).resolve("events.ndjson");
            Path summaryFile = root.resolve(runId).resolve("summary.json");
            if (!Files.isRegularFile(file) || !Files.isRegularFile(summaryFile)) {
                throw new IOException("A configured MiMo trace run is incomplete");
            }
            JsonNode summary = JSON.readTree(summaryFile.toFile());
            if (!summary.path("captureComplete").asBoolean(false)
                    || summary.path("droppedEvents").asInt(-1) != 0) {
                throw new IOException("MiMo trace capture is incomplete or has dropped events");
            }
            JsonNode pending = null;
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                JsonNode event = JSON.readTree(line);
                String type = event.path("type").asText();
                if ("PROVIDER_REQUEST_ATTEMPT".equals(type)) {
                    if (pending != null) throw new IOException("Overlapping MiMo provider attempts are ambiguous");
                    pending = event;
                } else if ("PROVIDER_RESPONSE".equals(type) && pending != null) {
                    output.add(pairMimo(pending, event, runId));
                    pending = null;
                } else if ("PROVIDER_ERROR".equals(type) && pending != null) {
                    pending = null; // A failed call has no actual input usage and is not estimated as zero.
                }
            }
            if (pending != null) throw new IOException("MiMo trace ended with an unmatched provider attempt");
        }
        return output;
    }

    private static Sample pairMimo(JsonNode request, JsonNode response, String runId) throws IOException {
        if (!request.hasNonNull("requestId") || !response.hasNonNull("requestId")
                || !request.path("requestId").asText().equals(response.path("requestId").asText())) {
            throw new IOException("MiMo request and response request identities do not match");
        }
        for (String identityField : List.of("runId", "generationId", "taskId", "step", "attempt")) {
            if (!request.hasNonNull(identityField) || !response.hasNonNull(identityField)
                    || !request.path(identityField).asText().equals(response.path(identityField).asText())) {
                throw new IOException("MiMo request and response call metadata do not match");
            }
        }
        JsonNode fields = request.path("fields");
        JsonNode responseFields = response.path("fields");
        if (!"OPENAI_COMPATIBLE".equals(fields.path("provider").asText())
                || !MIMO_MODEL.equals(fields.path("model").asText())
                || !"OPENAI_COMPATIBLE".equals(responseFields.path("provider").asText())
                || !MIMO_MODEL.equals(responseFields.path("model").asText())) {
            throw new IOException("MiMo trace identity does not match the candidate profile");
        }
        String system = requiredText(fields, "content.systemPrompt");
        String user = requiredText(fields, "content.userPrompt");
        if (fields.path("systemCharacters").asInt(-1) != system.length()
                || fields.path("userCharacters").asInt(-1) != user.length()
                || containsTruncationMarker(fields) || containsTruncationMarker(responseFields)) {
            throw new IOException("MiMo trace request content is incomplete or truncated");
        }
        Long actualInput = optionalLong(responseFields.get("inputTokens"));
        Long actualOutput = optionalLong(responseFields.get("outputTokens"));
        List<AiProviderRequest.Message> messages = List.of(
                new AiProviderRequest.Message(AiMessageRole.SYSTEM, system),
                new AiProviderRequest.Message(AiMessageRole.USER, user));
        AiInputTokenEstimator.Estimate estimate = AiInputTokenEstimator.resolve(AiProviderType.OPENAI_COMPATIBLE,
                MIMO_ENDPOINT, MIMO_MODEL, AiInputTokenEstimator.MODE_MIMO_BYTE_CATEGORY_CANDIDATE).estimate(messages);
        long legacy = (long) system.getBytes(StandardCharsets.UTF_8).length
                + user.getBytes(StandardCharsets.UTF_8).length + 8;
        byte[] promptPair = (system + "\u0000" + user).getBytes(StandardCharsets.UTF_8);
        String hash = java.util.HexFormat.of().formatHex(digest(promptPair));
        return new Sample(runId, response.path("outcome").asText("unknown"), hash,
                request.path("step").asText(), estimate, legacy, estimate.inputTokens(), actualInput, actualOutput);
    }

    private static boolean isHoldout(Sample sample) {
        return Integer.parseInt(sample.promptHash().substring(0, 2), 16) % 5 == 0;
    }

    private static long loadMimoUnavailableCount(Path root) throws IOException {
        long unavailable = 0;
        for (String runId : MIMO_TRACE_RUN_IDS) {
            Path file = root.resolve(runId).resolve("events.ndjson");
            for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                if ("PROVIDER_ERROR".equals(JSON.readTree(line).path("type").asText())) unavailable++;
            }
        }
        return unavailable;
    }

    private static List<Sample> loadSamples(Path root, String endpoint) throws IOException {
        if (!Files.isDirectory(root)) throw new IOException("Configured trace directory is not a directory");
        List<Path> files;
        try (Stream<Path> walk = Files.walk(root)) {
            files = walk.filter(path -> path.getFileName().toString().equals("events.ndjson")).sorted().toList();
        }
        if (files.isEmpty()) throw new IOException("No events.ndjson files found in configured trace directory");
        List<Sample> output = new ArrayList<>();
        ObjectMapper mapper = JSON;
        for (Path file : files) {
            Path summaryFile = file.resolveSibling("summary.json");
            if (!Files.isRegularFile(summaryFile)) throw new IOException("Trace summary is missing");
            JsonNode summary = mapper.readTree(summaryFile.toFile());
            if (!summary.path("captureComplete").asBoolean(false)
                    || summary.path("droppedEvents").asInt(-1) != 0) {
                throw new IOException("Trace capture is incomplete or has dropped events");
            }
            String runOutcome = summary.path("outcome").asText("unknown");
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            JsonNode pending = null;
            for (String line : lines) {
                JsonNode event = mapper.readTree(line);
                String type = event.path("type").asText();
                if ("PROVIDER_REQUEST_ATTEMPT".equals(type)) {
                    if (pending != null) throw new IOException("Overlapping provider attempts make trace pairing ambiguous");
                    pending = event;
                } else if ("PROVIDER_RESPONSE".equals(type)) {
                    if (pending == null) throw new IOException("Provider response has no preceding request attempt");
                    output.add(pair(pending, event, endpoint, file.getParent().getFileName().toString(), runOutcome));
                    pending = null;
                }
            }
            if (pending != null) throw new IOException("Trace ended with an unmatched provider request attempt");
        }
        return output;
    }

    private static Sample pair(JsonNode request, JsonNode response, String endpoint, String runId,
                               String runOutcome) throws IOException {
        if (request.hasNonNull("reservationId") && response.hasNonNull("reservationId")
                && !request.path("reservationId").asText().equals(response.path("reservationId").asText())) {
            throw new IOException("Request and response reservation identities do not match");
        }
        String requestStep = request.path("step").asText();
        String responseStep = response.path("step").asText();
        if (!requestStep.isEmpty() && !responseStep.isEmpty() && !requestStep.equals(responseStep)) {
            throw new IOException("Request and response stages do not match");
        }
        JsonNode fields = request.path("fields");
        JsonNode responseFields = response.path("fields");
        String system = requiredText(fields, "content.systemPrompt");
        String user = requiredText(fields, "content.userPrompt");
        if (fields.path("systemCharacters").asInt(-1) != system.length()
                || fields.path("userCharacters").asInt(-1) != user.length()) {
            throw new IOException("Captured request text does not match the trace character counts");
        }
        if (containsTruncationMarker(fields) || containsTruncationMarker(responseFields)) {
            throw new IOException("Trace marks provider input or output content as truncated");
        }
        String providerValue = fields.path("provider").asText();
        AiProviderType provider = "DEEPSEEK".equals(providerValue) ? AiProviderType.DEEPSEEK : null;
        String model = fields.path("model").asText();
        AiInputTokenEstimator.Profile profile = AiInputTokenEstimator.resolve(provider, endpoint, model,
                AiInputTokenEstimator.MODE_CALIBRATED_CATEGORY);
        List<AiProviderRequest.Message> messages = List.of(
                new AiProviderRequest.Message(AiMessageRole.SYSTEM, system),
                new AiProviderRequest.Message(AiMessageRole.USER, user));
        AiInputTokenEstimator.Estimate estimate = profile.estimate(messages);
        long legacy = (long) system.getBytes(StandardCharsets.UTF_8).length
                + user.getBytes(StandardCharsets.UTF_8).length + 8;
        Long actualInput = optionalLong(responseFields.get("inputTokens"));
        Long actualOutput = optionalLong(responseFields.get("outputTokens"));
        if ((actualInput != null && actualInput < 0) || (actualOutput != null && actualOutput < 0)) {
            throw new IOException("Provider usage is negative");
        }
        byte[] pairBytes = (system + "\u0000" + user).getBytes(StandardCharsets.UTF_8);
        String hash = java.util.HexFormat.of().formatHex(digest(pairBytes));
        return new Sample(runId, runOutcome, hash, requestStep.isEmpty() ? responseStep : requestStep,
                estimate, legacy, estimate.inputTokens(), actualInput, actualOutput);
    }

    private static String requiredText(JsonNode fields, String name) throws IOException {
        JsonNode value = fields.get(name);
        if (value == null || !value.isTextual()) throw new IOException("Trace request text is missing");
        return value.asText();
    }

    private static Long optionalLong(JsonNode value) {
        if (value == null || value.isNull()) return null;
        if (value.isIntegralNumber() && value.canConvertToLong()) {
            long parsed = value.asLong();
            return parsed >= 0 ? parsed : null;
        }
        if (value.isTextual()) {
            String text = value.asText();
            if (!text.matches("[0-9]+")) return null;
            try {
                return Long.parseLong(text);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static boolean containsTruncationMarker(JsonNode fields) {
        for (String fieldName : fields.propertyNames()) {
            String name = fieldName.toLowerCase(Locale.ROOT);
            if (name.contains("truncated") || name.contains("clipped")) {
                JsonNode value = fields.get(fieldName);
                if (value != null && (value.asBoolean(false) || value.asInt(0) > 0)) return true;
            }
        }
        return false;
    }

    private static byte[] digest(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static int countDistinctRuns(List<Sample> samples) {
        return (int) samples.stream().map(Sample::runId).filter(value -> !value.isEmpty()).distinct().count();
    }

    private static boolean gatePass(List<Sample> samples, long supportedCompleteUnique,
                                    long indexCoveredPairs, long routeCoveredPairs,
                                    int callUnderruns, int uniqueUnderruns) {
        return !samples.isEmpty() && supportedCompleteUnique >= 10 && indexCoveredPairs > 0
                && routeCoveredPairs > 0 && callUnderruns == 0 && uniqueUnderruns == 0;
    }

    private static Path reportPath(Path traceRoot) {
        String configured = System.getProperty("auralis.ai.overview-token-estimator-replay-report");
        if (configured != null && !configured.isBlank()) return Path.of(configured).toAbsolutePath().normalize();
        return traceRoot.resolveSibling("auralis-token-estimator-holdout-report.json");
    }

    private static void writeReport(Path path, List<Sample> samples, int uniquePromptPairs,
                                    int targetRunCalls, long targetRunUniquePairs,
                                    long supportedCompleteUnique, long indexCoveredPairs,
                                    long routeCoveredPairs, long writerSamples, long incompleteUsage,
                                    long legacyInput, long estimatedInput, long actualInput,
                                    double legacyErrorPct, double estimateErrorPct,
                                    long legacyAbsoluteError, long estimateAbsoluteError,
                                    double meanAbsoluteErrorPct, double minimumCoveragePct,
                                    double reservationReductionPct, int callUnderestimates,
                                    int uniqueUnderestimates, long duplicateUsageConflictPairs,
                                    Map<String, StageStats> byStage, String gate) throws IOException {
        LinkedHashMap<String, Object> report = new LinkedHashMap<>();
        report.put("reportVersion", 1);
        report.put("runs", countDistinctRuns(samples));
        report.put("calls", samples.size());
        report.put("uniquePromptPairs", uniquePromptPairs);
        report.put("targetRunCalls", targetRunCalls);
        report.put("targetRunUniquePairs", targetRunUniquePairs);
        report.put("requestCharacterCountsVerified", true);
        report.put("supportedCompleteUniquePairs", supportedCompleteUnique);
        report.put("indexCategoryPairs", indexCoveredPairs);
        report.put("routeCategoryPairs", routeCoveredPairs);
        report.put("writerSamples", writerSamples);
        report.put("incompleteUsage", incompleteUsage);
        report.put("legacyInput", legacyInput);
        report.put("estimatedInput", estimatedInput);
        report.put("actualInput", actualInput);
        report.put("legacyErrorPct", legacyErrorPct);
        report.put("estimateErrorPct", estimateErrorPct);
        report.put("legacyAbsoluteError", legacyAbsoluteError);
        report.put("estimateAbsoluteError", estimateAbsoluteError);
        report.put("meanAbsoluteErrorPct", meanAbsoluteErrorPct);
        report.put("minimumCoveragePct", minimumCoveragePct);
        report.put("reservationReductionPct", reservationReductionPct);
        report.put("callUnderestimates", callUnderestimates);
        report.put("uniqueUnderestimates", uniqueUnderestimates);
        report.put("duplicateUsageConflictPairs", duplicateUsageConflictPairs);
        LinkedHashMap<String, Object> stages = new LinkedHashMap<>();
        for (Map.Entry<String, StageStats> entry : byStage.entrySet().stream().sorted(Map.Entry.comparingByKey()).toList()) {
            StageStats stats = entry.getValue();
            stages.put(entry.getKey(), Map.of(
                    "calls", stats.calls(),
                    "uniquePromptPairs", stats.uniquePrompts(),
                    "categoryCalls", stats.categoryCalls(),
                    "legacyInput", stats.legacyInput(),
                    "estimatedInput", stats.estimatedInput(),
                    "actualInput", stats.actualInput(),
                    "underestimates", stats.underestimates()));
        }
        report.put("stages", stages);
        report.put("gate", gate);
        Files.createDirectories(path.getParent());
        Files.writeString(path, JSON.writeValueAsString(report) + System.lineSeparator(), StandardCharsets.UTF_8);
    }

    private static double percent(long numerator, long denominator) {
        return denominator == 0 ? 0 : numerator * 100.0 / denominator;
    }

    private record Sample(String runId, String runOutcome, String promptHash, String stage,
                          AiInputTokenEstimator.Estimate estimate,
                          long legacyTokens, long estimatedTokens, Long actualInput, Long actualOutput) {
    }

    private static final class StageStats {
        private final Set<String> promptHashes = new HashSet<>();
        private int calls;
        private int categoryCalls;
        private long legacyInput;
        private long estimatedInput;
        private long actualInput;
        private int underestimates;

        private void addCall(Sample sample) {
            calls++;
            if (sample.estimate().categoryMessages() > 0) categoryCalls++;
        }

        private void addUnique(Sample sample) {
            promptHashes.add(sample.promptHash());
            if (sample.actualInput() == null) return;
            legacyInput += sample.legacyTokens();
            estimatedInput += sample.estimatedTokens();
            actualInput += sample.actualInput();
            if (sample.estimatedTokens() < sample.actualInput()) underestimates++;
        }

        private int calls() { return calls; }
        private int uniquePrompts() { return promptHashes.size(); }
        private int categoryCalls() { return categoryCalls; }
        private long legacyInput() { return legacyInput; }
        private long estimatedInput() { return estimatedInput; }
        private long actualInput() { return actualInput; }
        private int underestimates() { return underestimates; }
    }
}
