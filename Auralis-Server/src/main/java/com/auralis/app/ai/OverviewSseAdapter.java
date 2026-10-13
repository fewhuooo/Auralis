package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.SourceOverviewRequest;
import com.auralis.app.ai.OverviewDtos.SubjectOverviewRequest;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.error.ApiErrorCode;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Bounded opt-in SSE transport for the existing Overview operations. */
@Component
public final class OverviewSseAdapter {

    private static final long HEARTBEAT_MILLIS = 750;
    private final OverviewGenerationService generationService;
    private final AsyncTaskExecutor requestExecutor;
    private final Executor generationExecutor;
    private final ScheduledExecutorService deadlineScheduler;
    private final ScheduledExecutorService heartbeatScheduler;
    private final ThreadPoolExecutor writerExecutor;
    private final AuralisProperties properties;
    private final Semaphore requestPermits = new Semaphore(24);
    private final Semaphore ssePermits = new Semaphore(8);

    public OverviewSseAdapter(OverviewGenerationService generationService,
            @Qualifier("mvcAsyncTaskExecutor") AsyncTaskExecutor requestExecutor,
            @Qualifier("overviewGenerationExecutor") Executor generationExecutor,
            @Qualifier("overviewDeadlineScheduler") ScheduledExecutorService deadlineScheduler,
            @Qualifier("overviewHeartbeatScheduler") ScheduledExecutorService heartbeatScheduler,
            @Qualifier("overviewSseWriterExecutor") ThreadPoolExecutor writerExecutor,
            AuralisProperties properties) {
        this.generationService = generationService;
        this.requestExecutor = requestExecutor;
        this.generationExecutor = generationExecutor;
        this.deadlineScheduler = deadlineScheduler;
        this.heartbeatScheduler = heartbeatScheduler;
        this.writerExecutor = writerExecutor;
        this.properties = properties;
    }

    public Permit acquireJsonPermit() {
        if (!requestPermits.tryAcquire()) throw new TaskRejectedException("Overview capacity is full");
        OverviewTaskDeadline deadline = newTaskDeadline();
        try {
            deadline.startWatchdog(deadlineScheduler);
            return new JsonPermit(deadline);
        } catch (RuntimeException failure) {
            deadline.finish();
            requestPermits.release();
            throw failure;
        }
    }

    public SseEmitter source(UUID userId, SourceOverviewRequest request, String requestId) {
        return stream(userId, requestId, (cancellation, deadline) -> generationService.generateSource(
                userId, request, requestId, cancellation, deadline), true, request);
    }

    public SseEmitter subject(UUID userId, SubjectOverviewRequest request, String requestId) {
        return stream(userId, requestId, (cancellation, deadline) -> generationService.generateSubject(
                userId, request, requestId, cancellation, deadline), false, request);
    }

    private SseEmitter stream(UUID userId, String requestId, SourceOperation sourceOperation,
                              boolean source, Object request) {
        if (!requestPermits.tryAcquire()) throw new TaskRejectedException("Overview capacity is full");
        if (!ssePermits.tryAcquire()) {
            requestPermits.release();
            throw new TaskRejectedException("Overview event stream capacity is full");
        }
        long timeoutMillis = taskTimeoutMillis();
        OverviewCancellation cancellation = requestCancellation();
        OverviewTaskDeadline ingressDeadline = newTaskDeadline();
        OverviewCancellation.Registration deadlineCancellation = ingressDeadline.cancellation()
                .onCancel(() -> cancellation.cancel(OverviewCancellation.Reason.DEADLINE));
        try {
            ingressDeadline.startWatchdog(deadlineScheduler);
        } catch (RuntimeException failure) {
            deadlineCancellation.close();
            ingressDeadline.finish();
            ssePermits.release();
            requestPermits.release();
            throw failure;
        }
        try {
            if (source) generationService.preflightSource(userId, (SourceOverviewRequest) request);
            else generationService.preflightSubject(userId, (SubjectOverviewRequest) request);
            if (cancellation.isCancelled()) {
                throw new DomainException("MODEL_TIMEOUT", "Overview generation exceeded its time limit");
            }
        } catch (RuntimeException failure) {
            deadlineCancellation.close();
            ingressDeadline.finish();
            ssePermits.release();
            requestPermits.release();
            throw failure;
        }
        SseEmitter emitter = new SseEmitter(timeoutMillis + 5_000L);
        AtomicBoolean heartbeatBusy = new AtomicBoolean();
        AtomicBoolean workerDone = new AtomicBoolean();
        AtomicBoolean workerExited = new AtomicBoolean();
        AtomicBoolean released = new AtomicBoolean();
        AtomicBoolean started = new AtomicBoolean();
        AtomicBoolean terminalStarted = new AtomicBoolean();
        java.util.concurrent.atomic.AtomicInteger pendingWriters = new java.util.concurrent.atomic.AtomicInteger();
        Object ownershipLock = new Object();
        AtomicReference<OverviewCancellation.Registration> timeoutRegistration =
                new AtomicReference<>(() -> { });
        Object writeLock = new Object();

        Runnable maybeRelease = () -> {
            synchronized (ownershipLock) {
                if (workerExited.get() && pendingWriters.get() == 0 && !heartbeatBusy.get()
                        && released.compareAndSet(false, true)) {
                    deadlineCancellation.close();
                    timeoutRegistration.get().close();
                    ingressDeadline.finish();
                    requestPermits.release();
                    ssePermits.release();
                }
            }
        };
        Runnable heartbeat = () -> {
            synchronized (ownershipLock) {
                if (released.get() || workerDone.get() || cancellation.isCancelled()
                        || !heartbeatBusy.compareAndSet(false, true)) return;
                pendingWriters.incrementAndGet();
            }
            try {
                writerExecutor.execute(() -> {
                    try {
                        if (workerDone.get() || cancellation.isCancelled()) return;
                        synchronized (writeLock) {
                            emitter.send(SseEmitter.event().comment("heartbeat"));
                            started.set(true);
                        }
                    } catch (IOException | IllegalStateException failure) {
                        cancellation.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
                        emitter.completeWithError(failure);
                    } finally {
                        heartbeatBusy.set(false);
                        pendingWriters.decrementAndGet();
                        maybeRelease.run();
                    }
                });
            } catch (RuntimeException rejected) {
                heartbeatBusy.set(false);
                pendingWriters.decrementAndGet();
                cancellation.cancel(OverviewCancellation.Reason.NO_INTEREST);
                emitter.completeWithError(rejected);
                maybeRelease.run();
            }
        };
        ScheduledFuture<?> heartbeatFuture = heartbeatScheduler.scheduleAtFixedRate(
                heartbeat, HEARTBEAT_MILLIS, HEARTBEAT_MILLIS, java.util.concurrent.TimeUnit.MILLISECONDS);
        Runnable emitDeadlineError = () -> {
            cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
            synchronized (ownershipLock) {
                if (released.get()) return;
                pendingWriters.incrementAndGet();
                if (!terminalStarted.compareAndSet(false, true)) {
                    pendingWriters.decrementAndGet();
                    maybeRelease.run();
                    return;
                }
            }
            try {
                writerExecutor.execute(() -> {
                    try {
                        sendError(emitter, writeLock, timeoutFailure());
                    } finally {
                        heartbeatFuture.cancel(false);
                        pendingWriters.decrementAndGet();
                        maybeRelease.run();
                    }
                });
            } catch (RuntimeException rejected) {
                pendingWriters.decrementAndGet();
                emitter.completeWithError(rejected);
                maybeRelease.run();
            }
        };
        timeoutRegistration.set(ingressDeadline.cancellation().onCancel(emitDeadlineError));
        emitter.onTimeout(() -> ingressDeadline.cancellation().cancel(OverviewCancellation.Reason.DEADLINE));
        emitter.onError(error -> cancellation.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED));
        emitter.onCompletion(() -> {
            if (!workerDone.get()) cancellation.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
            heartbeatFuture.cancel(false);
            maybeRelease.run();
        });
        try {
            requestExecutor.execute(() -> {
                try {
                    if (cancellation.isCancelled()) {
                        workerDone.set(true);
                        if (cancellation.reason() == OverviewCancellation.Reason.DEADLINE) {
                            if (terminalStarted.compareAndSet(false, true)) {
                                sendError(emitter, writeLock, timeoutFailure());
                            }
                        } else if (terminalStarted.compareAndSet(false, true)) {
                            emitter.complete();
                        }
                        return;
                    }
                    OverviewResponse response = source
                            ? sourceOperation.run(cancellation, ingressDeadline)
                            : generateSubjectOnBoundedPool(sourceOperation, cancellation, ingressDeadline);
                    if (!cancellation.isCancelled() && terminalStarted.compareAndSet(false, true)) {
                        synchronized (writeLock) {
                            emitter.send(SseEmitter.event().name("result").data(response, MediaType.APPLICATION_JSON));
                            started.set(true);
                        }
                        workerDone.set(true);
                        emitter.complete();
                    } else if (cancellation.reason() == OverviewCancellation.Reason.DEADLINE
                            && terminalStarted.compareAndSet(false, true)) {
                        workerDone.set(true);
                        sendError(emitter, writeLock, timeoutFailure());
                    } else if (terminalStarted.compareAndSet(false, true)) {
                        workerDone.set(true);
                        emitter.complete();
                    }
                } catch (Throwable failure) {
                    if (cancellation.reason() == OverviewCancellation.Reason.DEADLINE) {
                        workerDone.set(true);
                        if (terminalStarted.compareAndSet(false, true)) {
                            sendError(emitter, writeLock, timeoutFailure());
                        }
                    } else if (!cancellation.isCancelled()) {
                        workerDone.set(true);
                        if (terminalStarted.compareAndSet(false, true)) {
                            if (started.get()) sendError(emitter, writeLock, failure);
                            else emitter.completeWithError(failure);
                        }
                    } else if (terminalStarted.compareAndSet(false, true)) {
                        workerDone.set(true);
                        emitter.complete();
                    }
                } finally {
                    workerDone.set(true);
                    workerExited.set(true);
                    heartbeatFuture.cancel(false);
                    maybeRelease.run();
                }
            });
        } catch (RuntimeException rejected) {
            workerDone.set(true);
            workerExited.set(true);
            heartbeatFuture.cancel(false);
            deadlineCancellation.close();
            timeoutRegistration.get().close();
            maybeRelease.run();
            throw new TaskRejectedException("Overview capacity is full", rejected);
        }
        return emitter;
    }

    private OverviewResponse generateSubjectOnBoundedPool(SourceOperation operation,
                                                           OverviewCancellation cancellation,
                                                           OverviewTaskDeadline deadline) {
        var result = new java.util.concurrent.CompletableFuture<OverviewResponse>();
        try {
            generationExecutor.execute(() -> {
                try {
                    result.complete(operation.run(cancellation, deadline));
                } catch (Throwable failure) {
                    result.completeExceptionally(failure);
                }
            });
        } catch (RuntimeException rejected) {
            throw new TaskRejectedException("Overview capacity is full", rejected);
        }
        try {
            return result.get(deadline.remainingMillis(), java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (java.util.concurrent.ExecutionException failure) {
            Throwable cause = failure.getCause();
            if (cause instanceof RuntimeException runtime) throw runtime;
            throw new IllegalStateException("Overview generation failed", cause);
        } catch (java.util.concurrent.TimeoutException failure) {
            cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
            throw new DomainException("MODEL_TIMEOUT", "Overview generation exceeded its task deadline", null, failure);
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            cancellation.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
            throw new DomainException("MODEL_TIMEOUT", "Overview generation was interrupted", null, failure);
        }
    }

    private void sendError(SseEmitter emitter, Object lock, Throwable failure) {
        String code;
        int status;
        long retryAfter = 0;
        Instant resetAt = null;
        if (failure instanceof AiUsageLimitException usage) {
            code = usage.code(); status = usage.status(); retryAfter = usage.retryAfterSeconds(); resetAt = usage.resetAt();
        } else if (failure instanceof TaskRejectedException) {
            code = ApiErrorCode.SERVICE_UNAVAILABLE.name(); status = 503; retryAfter = 1;
        } else if (failure instanceof DomainException domain) {
            code = safeCode(domain.code()); status = statusFor(code);
            if (code.equals(ApiErrorCode.SERVICE_UNAVAILABLE.name())) retryAfter = 1;
        } else {
            code = ApiErrorCode.INTERNAL_ERROR.name(); status = 500;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("code", code);
        data.put("detail", safeDetail(code));
        data.put("status", status);
        if (retryAfter > 0) data.put("retryAfterSeconds", retryAfter);
        if (resetAt != null) data.put("resetAt", resetAt.toString());
        try {
            synchronized (lock) {
                emitter.send(SseEmitter.event().name("error").data(data, MediaType.APPLICATION_JSON));
            }
        } catch (IOException | IllegalStateException ignored) {
            // The connection is already gone; worker finalization still releases the bounded slot.
        } finally {
            emitter.complete();
        }
    }

    private DomainException timeoutFailure() {
        return new DomainException("MODEL_TIMEOUT", "Overview generation exceeded its time limit");
    }

    private String safeCode(String code) {
        try { return ApiErrorCode.valueOf(code).name(); }
        catch (IllegalArgumentException ignored) { return ApiErrorCode.INTERNAL_ERROR.name(); }
    }

    private int statusFor(String code) {
        return switch (code) {
            case "UNAUTHENTICATED" -> 401;
            case "FORBIDDEN" -> 403;
            case "RESOURCE_NOT_FOUND", "RESOURCE_DELETED" -> 404;
            case "VALIDATION_FAILED", "UPLOAD_VALIDATION_FAILED" -> 400;
            case "MODEL_TIMEOUT" -> 504;
            case "MODEL_UNAVAILABLE", "SERVICE_UNAVAILABLE" -> 503;
            case "RATE_LIMITED" -> 429;
            case "MODEL_PROVIDER_ERROR", "OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE", "OVERVIEW_PROMPT_BUDGET_EXCEEDED",
                    "OVERVIEW_PROVIDER_OUTPUT_TRUNCATED", "OVERVIEW_RECOVERY_EXHAUSTED", "OVERVIEW_REDUCE_NO_PROGRESS" -> 502;
            case "MUTATION_REJECTED", "RESOURCE_VERSION_CONFLICT" -> 409;
            default -> 500;
        };
    }

    private String safeDetail(String code) {
        return switch (code) {
            case "AI_CONCURRENCY_LIMIT", "AI_HOURLY_BUDGET_EXCEEDED", "AI_DAILY_BUDGET_EXCEEDED",
                    "AI_GLOBAL_DAILY_BUDGET_EXCEEDED", "AI_TASK_BUDGET_EXCEEDED", "AI_REQUEST_BUDGET_EXCEEDED" -> code;
            case "MODEL_TIMEOUT" -> "Overview generation exceeded its time limit";
            case "SERVICE_UNAVAILABLE" -> "Service is busy; retry shortly";
            case "MODEL_UNAVAILABLE", "MODEL_PROVIDER_ERROR", "RATE_LIMITED" -> "AI provider could not complete the overview";
            case "VALIDATION_FAILED" -> "Overview request is invalid";
            case "UNAUTHENTICATED" -> "Authentication is required";
            case "FORBIDDEN" -> "Access is not allowed";
            case "RESOURCE_NOT_FOUND", "RESOURCE_DELETED" -> "Requested resource is unavailable";
            case "MUTATION_REJECTED", "RESOURCE_VERSION_CONFLICT" -> "Requested resource changed";
            case "OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE", "OVERVIEW_PROMPT_BUDGET_EXCEEDED",
                    "OVERVIEW_PROVIDER_OUTPUT_TRUNCATED", "OVERVIEW_RECOVERY_EXHAUSTED",
                    "OVERVIEW_REDUCE_NO_PROGRESS" -> "Overview could not be generated";
            default -> "Overview generation failed";
        };
    }

    private long taskTimeoutMillis() {
        long timeout = properties.ai().overviewTaskTimeoutMillis();
        return timeout > 0 ? timeout : 240_000;
    }

    private OverviewCancellation requestCancellation() { return new OverviewCancellation(); }

    private OverviewTaskDeadline newTaskDeadline() {
        return new OverviewTaskDeadline(taskTimeoutMillis(), System::nanoTime);
    }

    @FunctionalInterface
    private interface SourceOperation {
        OverviewResponse run(OverviewCancellation cancellation, OverviewTaskDeadline deadline);
    }

    public interface Permit extends AutoCloseable {
        OverviewTaskDeadline deadline();
        @Override void close();
    }

    private final class JsonPermit implements Permit {
        private final OverviewTaskDeadline deadline;
        private final AtomicBoolean closed = new AtomicBoolean();

        private JsonPermit(OverviewTaskDeadline deadline) { this.deadline = deadline; }
        @Override public OverviewTaskDeadline deadline() { return deadline; }
        @Override public void close() {
            if (closed.compareAndSet(false, true)) {
                deadline.finish();
                requestPermits.release();
            }
        }
    }
}
