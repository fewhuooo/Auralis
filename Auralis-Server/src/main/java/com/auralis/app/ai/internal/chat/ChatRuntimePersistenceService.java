package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiMessageStatus;
import com.auralis.app.ai.AiMessageCommand;
import com.auralis.app.ai.ChatConversationScope;
import com.auralis.app.ai.ChatConversationScopeState;
import com.auralis.app.ai.internal.persistence.ChatActivityEntity;
import com.auralis.app.ai.internal.persistence.ChatActivityRepository;
import com.auralis.app.ai.internal.persistence.ChatAttemptEntity;
import com.auralis.app.ai.internal.persistence.ChatAttemptRepository;
import com.auralis.app.ai.internal.persistence.ChatRunEntity;
import com.auralis.app.ai.internal.persistence.ChatRunRepository;
import com.auralis.app.ai.internal.persistence.ConversationEntity;
import com.auralis.app.ai.internal.persistence.ConversationRepository;
import com.auralis.app.ai.internal.persistence.MessageEntity;
import com.auralis.app.ai.internal.persistence.MessageRepository;
import com.auralis.app.ai.retrieval.ReadingContext;
import com.auralis.app.source.SourceService;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.ChatAgentProperties;
import com.auralis.app.shared.error.DomainException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import tools.jackson.core.type.TypeReference;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Short-transaction persistence boundary for a Chat run. Provider and tools never execute here. */
@Service
public class ChatRuntimePersistenceService {
    private static final String EMPTY_ARRAY = "[]";
    private final ConversationRepository conversations;
    private final MessageRepository messages;
    private final ChatRunRepository runs;
    private final ChatAttemptRepository attempts;
    private final ChatActivityRepository activities;
    private final SourceService sources;
    private final ChatReadTools readTools;
    private final ObjectMapper mapper;
    private final ChatAgentProperties properties;
    private final String workerInstanceId;

    @Autowired
    public ChatRuntimePersistenceService(ConversationRepository conversations, MessageRepository messages,
            ChatRunRepository runs, ChatAttemptRepository attempts, ChatActivityRepository activities,
            SourceService sources, ChatReadTools readTools, ObjectMapper mapper, ChatAgentProperties properties,
            @Value("${auralis.instance-id:local}") String workerInstanceId) {
        this.conversations = conversations; this.messages = messages; this.runs = runs;
        this.attempts = attempts; this.activities = activities; this.sources = sources; this.readTools = readTools;
        this.mapper = mapper;
        this.properties = properties;
        String instance = workerInstanceId == null || workerInstanceId.isBlank() ? "local" : workerInstanceId.trim();
        this.workerInstanceId = instance.substring(0, Math.min(instance.length(), 90)) + ":" + UUID.randomUUID();
    }

    public ChatRuntimePersistenceService(ConversationRepository conversations, MessageRepository messages,
            ChatRunRepository runs, ChatAttemptRepository attempts, ChatActivityRepository activities,
            SourceService sources, ObjectMapper mapper, ChatAgentProperties properties, String workerInstanceId) {
        this(conversations, messages, runs, attempts, activities, sources, null, mapper, properties, workerInstanceId);
    }

    @Transactional(readOnly = true)
    public Admission findReplay(UUID userId, AiMessageCommand command) {
        command.validateProtocol();
        var replay = runs.findByUserIdAndRequestId(userId, command.requestId());
        if (replay.isEmpty()) return null;
        ChatRunEntity run = replay.get();
        requireSameHash(run.getRequestHash(), requestHash(command));
        if (!run.getConversationId().equals(command.conversationId())) throw requestConflict();
        return current(run, true);
    }

    @Transactional(readOnly = true)
    public Admission findRetryReplay(UUID userId, UUID conversationId, UUID runId, String requestId) {
        var replay = attempts.findByUserIdAndRequestId(userId, requestId);
        if (replay.isEmpty()) return null;
        ChatAttemptEntity attempt = replay.get();
        if (!runId.equals(attempt.getRunId())) throw requestConflict();
        ChatRunEntity run = runs.findByIdAndUserIdAndConversationId(runId, userId, conversationId)
                .orElseThrow(() -> notFound("Chat run was not found"));
        return new Admission(run, attempt, run.getUserMessageId(), true);
    }

    @Transactional
    public Admission admit(UUID userId, AiMessageCommand command, ExecutionProfile executionProfile) {
        command.validateProtocol();
        ConversationEntity conversation = lockConversation(userId, command.conversationId());
        requireProtocolOne(conversation);
        String hash = requestHash(command);
        var replay = runs.findByUserIdAndRequestId(userId, command.requestId());
        if (replay.isPresent()) {
            ChatRunEntity run = replay.get();
            requireSameHash(run.getRequestHash(), hash);
            return current(run, true);
        }
        ChatConversationScope conversationScope = resolveConversationScope(conversation, command);
        ChatActivityEntity activity = null;
        if ("activity_submission".equals(command.action())) {
            activity = activities.findByIdAndUserId(command.activityId(), userId)
                    .orElseThrow(() -> notFound("Activity was not found"));
            if (!activitiesBelongToConversation(activity, command.conversationId(), userId)) {
                throw notFound("Activity was not found");
            }
            ChatRunEntity activityRun = lockRun(activity.getRunId(), userId, command.conversationId());
            if (!java.util.Objects.equals(conversationScope, runScope(activityRun))) throw scopeConflict();
            activity = activities.findForUpdate(activity.getId(), activity.getRunId(), userId)
                    .orElseThrow(() -> notFound("Activity was not found"));
            String submittedHash = answerHash(command.answer());
            if ("SUBMITTED".equals(activity.getState())) {
                if (command.submissionId().equals(activity.getSubmissionId())
                        && submittedHash.equals(activity.getAnswerHash()) && activity.getReplyRunId() != null) {
                    ChatRunEntity priorRun = runs.findByIdAndUserIdAndConversationId(
                                    activity.getReplyRunId(), userId, conversation.getId())
                            .orElseThrow(() -> notFound("Activity response run was not found"));
                    return current(priorRun, true);
                }
                throw new DomainException("CHAT_ACTIVITY_CONFLICT", "Activity has already been submitted");
            }
            if (!"READY".equals(activity.getState()) || activity.getQuestionVersion() != command.questionVersion()) {
                throw new DomainException("CHAT_ACTIVITY_CONFLICT", "Activity is no longer ready for submission");
            }
            validateAnswer(activity, command.answer());
        }
        if (conversation.getActiveChatRunId() != null) throw activeRun();

        UUID runId = UUID.randomUUID();
        UUID userMessageId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        UUID replyId = UUID.randomUUID();
        long fence = conversation.reserveChatRun(runId);
        MessageEntity userMessage = new MessageEntity(userMessageId, conversation.getId(), userId,
                conversation.allocateNextMessageSequence(), AiMessageRole.USER, AiMessageStatus.COMPLETED,
                userMessageText(command, activity), null, null, null, command.requestId(), null);
        userMessage.enableChatProtocolOne();
        messages.saveAndFlush(userMessage);
        ChatRunEntity run = runs.saveAndFlush(new ChatRunEntity(runId, userId, conversation.getId(),
                command.requestId(), hash, requestContext(command, executionProfile, conversationScope), command.action(), userMessageId,
                AiTaskContext.chatAgentLedgerTaskId(userId, runId), fence));
        ChatAttemptEntity attempt = attempts.saveAndFlush(new ChatAttemptEntity(attemptId, runId, userId,
                command.requestId(), hash, 1, workerInstanceId, fence, replyId, EMPTY_ARRAY, EMPTY_ARRAY,
                deadlineFromNow()));
        run.pointToAttempt(attempt.getId(), replyId);
        runs.saveAndFlush(run);
        if (activity != null) {
            Map<String, Object> publicPayload = mapper.readValue(activity.getPublicPayloadJson(),
                    new TypeReference<Map<String, Object>>() {});
            publicPayload.put("state", "SUBMITTED");
            publicPayload.put("submittedAnswer", answerValue(command.answer()));
            activity.markSubmitted(command.submissionId(), answerHash(command.answer()), command.answer().toString(),
                    userMessageId, runId, mapper.writeValueAsString(publicPayload));
            ChatAttemptEntity sourceAttempt = lockAttempt(activity.getAttemptId(), activity.getRunId(), userId);
            List<Map<String, Object>> sourceParts = mapper.readValue(sourceAttempt.getPublicPartsJson(),
                    new TypeReference<List<Map<String, Object>>>() {});
            for (int index = 0; index < sourceParts.size(); index++) {
                Map<String, Object> part = sourceParts.get(index);
                if (activity.getBlockId().toString().equals(part.get("id"))) {
                    Map<String, Object> submittedPart = new java.util.LinkedHashMap<>(part);
                    submittedPart.put("state", "SUBMITTED");
                    submittedPart.put("submittedAnswer", publicPayload.get("submittedAnswer"));
                    sourceParts.set(index, submittedPart);
                }
            }
            sourceAttempt.updateSnapshot(mapper.writeValueAsString(sourceParts), sourceAttempt.getToolTraceJson(),
                    sourceAttempt.getLastSequence());
            attempts.saveAndFlush(sourceAttempt);
            messages.findById(activity.getMessageId()).ifPresent(message -> {
                message.replacePublicProjection(ChatPublicProjection.markdown(sourceParts));
                messages.saveAndFlush(message);
            });
            activities.saveAndFlush(activity);
        }
        conversations.saveAndFlush(conversation);
        return new Admission(run, attempt, userMessageId, false);
    }

    @Transactional
    public Admission retry(UUID userId, UUID conversationId, UUID runId, String requestId) {
        if (requestId == null || requestId.isBlank() || requestId.length() > 128) {
            throw new DomainException("VALIDATION_FAILED", "requestId must contain 1 to 128 characters");
        }
        ConversationEntity conversation = lockConversation(userId, conversationId);
        requireProtocolOne(conversation);
        ChatRunEntity run = lockRun(runId, userId, conversationId);
        ChatAttemptEntity previousRow = attempts.findTopByRunIdOrderByAttemptNoDesc(runId)
                .orElseThrow(() -> notFound("Chat run was not found"));
        ChatAttemptEntity previous = lockAttempt(previousRow.getId(), runId, userId);
        var replay = attempts.findByUserIdAndRequestId(userId, requestId);
        if (replay.isPresent()) {
            if (!runId.equals(replay.get().getRunId())) throw requestConflict();
            return new Admission(run, replay.get(), run.getUserMessageId(), true);
        }
        requireBoundScopeForRun(conversation, run);
        boolean safePendingRecovery = "PENDING".equals(previous.getStatus())
                && !workerInstanceId.equals(previous.getWorkerInstanceId())
                && !previous.getDeadlineAt().isAfter(Instant.now());
        if (!safePendingRecovery && !"FAILED".equals(previous.getStatus()) && !"CANCELLED".equals(previous.getStatus())) {
            if ("PENDING".equals(previous.getStatus()) && runId.equals(conversation.getActiveChatRunId())) {
                throw activeRun();
            }
            throw new DomainException("CHAT_RETRY_NOT_ALLOWED", "Only a settled failed or cancelled attempt can be retried");
        }
        long fence;
        if (safePendingRecovery) {
            if (!runId.equals(conversation.getActiveChatRunId())) throw activeRun();
            settleUndispatched(conversation, run, previous, "FAILED", "CHAT_ATTEMPT_NOT_DISPATCHED", previous.getLastSequence());
            fence = conversation.advancePendingChatRunFence(runId);
        } else {
            if (conversation.getActiveChatRunId() != null) throw activeRun();
            fence = conversation.reserveChatRun(runId);
        }
        UUID attemptId = UUID.randomUUID();
        UUID replyId = UUID.randomUUID();
        ChatAttemptEntity attempt = attempts.saveAndFlush(new ChatAttemptEntity(attemptId, runId, userId,
                requestId, run.getRequestHash(), previous.getAttemptNo() + 1, workerInstanceId, fence,
                replyId, EMPTY_ARRAY, EMPTY_ARRAY, deadlineFromNow()));
        run.advanceFence(fence);
        run.pointToAttempt(attemptId, replyId);
        run.mark("PENDING");
        runs.saveAndFlush(run);
        conversations.saveAndFlush(conversation);
        return new Admission(run, attempt, run.getUserMessageId(), false);
    }

    @Transactional
    public ClaimResult claim(UUID userId, UUID conversationId, UUID runId, UUID attemptId, long fence) {
        ConversationEntity conversation = lockConversation(userId, conversationId);
        ChatRunEntity run = lockRun(runId, userId, conversationId);
        ChatAttemptEntity attempt = lockAttempt(attemptId, runId, userId);
        if (!owns(conversation, run, attempt, fence) || !"PENDING".equals(attempt.getStatus())) return ClaimResult.FENCE_LOST;
        if (!attempt.getDeadlineAt().isAfter(Instant.now())) {
            settleUndispatched(conversation, run, attempt, "FAILED", "CHAT_ATTEMPT_DEADLINE", 1);
            attempt.updateSnapshot(attempt.getPublicPartsJson(), attempt.getToolTraceJson(), 1);
            attempts.saveAndFlush(attempt);
            conversation.releaseChatRun(runId, fence);
            conversations.saveAndFlush(conversation);
            return ClaimResult.DEADLINE_EXPIRED;
        }
        attempt.markRunning(); run.mark("RUNNING");
        attempts.saveAndFlush(attempt); runs.saveAndFlush(run);
        return ClaimResult.CLAIMED;
    }

    @Transactional
    public void checkpoint(UUID userId, UUID conversationId, UUID runId, UUID attemptId, long fence,
                           Map<UUID, UUID> sourceRevisions, String publicPartsJson, String toolTraceJson, long sequence) {
        checkpoint(userId, conversationId, runId, attemptId, fence, sourceRevisions,
                publicPartsJson, toolTraceJson, sequence, null);
    }

    @Transactional
    public void checkpoint(UUID userId, UUID conversationId, UUID runId, UUID attemptId, long fence,
            Map<UUID, UUID> sourceRevisions, String publicPartsJson, String toolTraceJson, long sequence,
            String privateToolEvidenceJson) {
        ConversationEntity conversation = lockConversation(userId, conversationId);
        ChatRunEntity run = lockRun(runId, userId, conversationId);
        ChatAttemptEntity attempt = lockAttempt(attemptId, runId, userId);
        requireOwner(conversation, run, attempt, fence);
        requireSourceRevisions(userId, sourceRevisions);
        attempt.updateSnapshot(publicPartsJson, toolTraceJson, sequence);
        if (privateToolEvidenceJson != null) attempt.updatePrivateToolEvidence(privateToolEvidenceJson);
        attempts.saveAndFlush(attempt);
    }

    /** Persists local display-tool evidence after checking the existing source revision fence. */
    @Transactional
    public void checkpointLocalToolEvidence(UUID userId, UUID conversationId, UUID runId, UUID attemptId,
            long fence, Map<UUID, UUID> sourceRevisions, String publicPartsJson, String toolTraceJson,
            long sequence, String privateToolEvidenceJson) {
        ConversationEntity conversation = lockConversation(userId, conversationId);
        ChatRunEntity run = lockRun(runId, userId, conversationId);
        ChatAttemptEntity attempt = lockAttempt(attemptId, runId, userId);
        requireOwner(conversation, run, attempt, fence);
        requireRunning(attempt);
        requireSourceRevisions(userId, sourceRevisions);
        attempt.updateSnapshot(publicPartsJson, toolTraceJson, sequence);
        attempt.updatePrivateToolEvidence(privateToolEvidenceJson);
        attempts.saveAndFlush(attempt);
    }

    /** Short, lock-free ownership check for gating public stream output. */
    @Transactional(readOnly = true)
    public void validatePublicationOwner(UUID userId, UUID conversationId, UUID runId, UUID attemptId, long fence) {
        ConversationEntity conversation = conversations.findByIdAndUserIdAndDeletedAtIsNull(conversationId, userId)
                .orElseThrow(() -> notFound("Conversation was not found"));
        ChatRunEntity run = runs.findByIdAndUserIdAndConversationId(runId, userId, conversationId)
                .orElseThrow(() -> notFound("Chat run was not found"));
        ChatAttemptEntity attempt = attempts.findByIdAndRunIdAndUserId(attemptId, runId, userId)
                .orElseThrow(() -> notFound("Chat attempt was not found"));
        requireOwner(conversation, run, attempt, fence);
    }

    @Transactional
    public ChatActivityEntity readyActivity(UUID userId, UUID conversationId, UUID runId, UUID attemptId,
            long fence, Map<UUID, UUID> sourceRevisions, UUID activityId, UUID blockId, int questionVersion, String questionType,
            String publicPayloadJson, String privateReferenceJson, String partsJson,
            String toolTraceJson, String privateToolEvidenceJson, String markdown, String model, long sequence) {
        ConversationEntity conversation = lockConversation(userId, conversationId);
        ChatRunEntity run = lockRun(runId, userId, conversationId);
        ChatAttemptEntity attempt = lockAttempt(attemptId, runId, userId);
        requireOwner(conversation, run, attempt, fence);
        requireRunning(attempt);
        requireSourceRevisions(userId, sourceRevisions);
        UUID replyId = attempt.getAllocatedReplyMessageId();
        if (!messages.existsById(replyId)) {
            MessageEntity reply = new MessageEntity(replyId, conversationId, userId,
                    conversation.allocateNextMessageSequence(), AiMessageRole.ASSISTANT,
                    AiMessageStatus.COMPLETED, markdown == null ? "" : markdown, model,
                    null, null, null, run.getUserMessageId());
            reply.enableChatProtocolOne();
            messages.saveAndFlush(reply);
        }
        attempt.updateSnapshot(partsJson, toolTraceJson, sequence);
        attempt.updatePrivateToolEvidence(privateToolEvidenceJson);
        attempt.attachCompletedBusinessMessage(replyId);
        run.mark("COMPLETED");
        attempts.saveAndFlush(attempt);
        runs.saveAndFlush(run);
        conversations.saveAndFlush(conversation);
        ChatActivityEntity activity = new ChatActivityEntity(activityId, runId, userId, attemptId,
                replyId, blockId, questionVersion, questionType, "READY", publicPayloadJson, privateReferenceJson);
        return activities.saveAndFlush(activity);
    }

    @Transactional
    public Terminal finish(UUID userId, UUID conversationId, UUID runId, UUID attemptId, long fence,
                           Map<UUID, UUID> sourceRevisions,
                           String status, String publicPartsJson, String toolTraceJson, long sequence,
                           String markdown, String model, String safeErrorCode) {
        ConversationEntity conversation = lockConversation(userId, conversationId);
        ChatRunEntity run = lockRun(runId, userId, conversationId);
        ChatAttemptEntity attempt = lockAttempt(attemptId, runId, userId);
        requireOwner(conversation, run, attempt, fence);
        boolean activityBusinessComplete = "COMPLETED".equals(run.getStatus());
        if (!activityBusinessComplete && !sourceRevisionsCurrent(userId, sourceRevisions)) {
            status = "FAILED";
            publicPartsJson = EMPTY_ARRAY;
            markdown = "";
            safeErrorCode = "SOURCE_SCOPE_CHANGED";
        }
        attempt.updateSnapshot(publicPartsJson, toolTraceJson, sequence);
        UUID replyId = attempt.getAllocatedReplyMessageId();
        if (!messages.existsById(replyId)) {
            MessageEntity reply = new MessageEntity(replyId, conversationId, userId,
                    conversation.allocateNextMessageSequence(), AiMessageRole.ASSISTANT,
                    terminalMessageStatus(status), markdown == null ? "" : markdown, model,
                    safeErrorCode, null, null, run.getUserMessageId());
            reply.enableChatProtocolOne();
            messages.saveAndFlush(reply);
        }
        String effectiveTerminalStatus = activityBusinessComplete ? "COMPLETED" : status;
        attempt.completeMessage(replyId, effectiveTerminalStatus, activityBusinessComplete ? null : safeErrorCode);
        if (!activityBusinessComplete) run.mark(status);
        runs.saveAndFlush(run); attempts.saveAndFlush(attempt);
        if (!"UNKNOWN".equals(effectiveTerminalStatus)) conversation.releaseChatRun(runId, fence);
        conversations.saveAndFlush(conversation);
        return new Terminal(run, attempt, replyId);
    }

    @Transactional
    public ChatAttemptEntity requestCancel(UUID userId, UUID conversationId, UUID runId) {
        ConversationEntity conversation = lockConversation(userId, conversationId);
        ChatRunEntity run = lockRun(runId, userId, conversationId);
        ChatAttemptEntity attempt = lockAttempt(run.getCurrentAttemptId(), runId, userId);
        if (!runId.equals(conversation.getActiveChatRunId())) {
            return attempt;
        }
        if ("PENDING".equals(attempt.getStatus())) {
            if (runId.equals(conversation.getActiveChatRunId())) {
                settleUndispatched(conversation, run, attempt, "CANCELLED", null, attempt.getLastSequence());
                conversation.releaseChatRun(runId, attempt.getFenceVersion());
                attempts.saveAndFlush(attempt); runs.saveAndFlush(run); conversations.saveAndFlush(conversation);
            }
        } else if ("RUNNING".equals(attempt.getStatus())) {
            attempt.requestCancel(); attempts.saveAndFlush(attempt);
        }
        return attempt;
    }

    @Transactional(readOnly = true)
    public boolean cancellationRequested(UUID userId, UUID runId, UUID attemptId) {
        return attempts.existsByIdAndRunIdAndUserIdAndStatus(attemptId, runId, userId, "CANCEL_REQUESTED");
    }

    @Transactional(readOnly = true)
    public boolean executionOwner(UUID userId, UUID conversationId, UUID runId, UUID attemptId, long fence) {
        ConversationEntity conversation = conversations.findByIdAndUserIdAndDeletedAtIsNull(conversationId, userId).orElse(null);
        ChatRunEntity run = runs.findByIdAndUserIdAndConversationId(runId, userId, conversationId).orElse(null);
        ChatAttemptEntity attempt = attempts.findByIdAndRunIdAndUserId(attemptId, runId, userId).orElse(null);
        return conversation != null && run != null && attempt != null
                && fence == conversation.getChatFence() && fence == run.getFenceVersion() && fence == attempt.getFenceVersion()
                && runId.equals(conversation.getActiveChatRunId()) && attemptId.equals(run.getCurrentAttemptId())
                && ("RUNNING".equals(attempt.getStatus()) || "CANCEL_REQUESTED".equals(attempt.getStatus()));
    }

    @Transactional
    public void recoverAfterRestart(UUID userId, UUID conversationId, UUID runId, UUID attemptId) {
        ConversationEntity conversation = lockConversation(userId, conversationId);
        ChatRunEntity run = lockRun(runId, userId, conversationId);
        ChatAttemptEntity attempt = lockAttempt(attemptId, runId, userId);
        if (!runId.equals(conversation.getActiveChatRunId()) || !run.getCurrentAttemptId().equals(attemptId)) return;
        if (workerInstanceId.equals(attempt.getWorkerInstanceId()) || attempt.getDeadlineAt().isAfter(Instant.now())) return;
        if (hasCommittedActivity(attemptId, runId, userId)) {
            settleCommittedActivity(conversation, run, attempt);
            conversations.saveAndFlush(conversation);
            return;
        }
        if ("PENDING".equals(attempt.getStatus())) {
            settleUndispatched(conversation, run, attempt, "FAILED", "CHAT_ATTEMPT_NOT_DISPATCHED", attempt.getLastSequence());
            conversation.releaseChatRun(runId, attempt.getFenceVersion());
            conversations.saveAndFlush(conversation);
            return;
        }
        if (("RUNNING".equals(attempt.getStatus()) || "CANCEL_REQUESTED".equals(attempt.getStatus()))
                && !workerInstanceId.equals(attempt.getWorkerInstanceId())) {
            conversation.fenceUnknownChatRun(runId);
            run.markUnknown();
            attempt.markUnknown();
            UUID replyId = attempt.getAllocatedReplyMessageId();
            if (!messages.existsById(replyId)) {
                List<Map<String, Object>> publicParts;
                try { publicParts = readPublicList(attempt.getPublicPartsJson()); }
                catch (DomainException corruptedSnapshot) { publicParts = List.of(); }
                MessageEntity reply = new MessageEntity(replyId, conversationId, userId,
                        conversation.allocateNextMessageSequence(), AiMessageRole.ASSISTANT,
                        AiMessageStatus.FAILED, ChatPublicProjection.markdown(publicParts), null,
                        "CHAT_WORKER_OWNERSHIP_UNKNOWN", null, null, run.getUserMessageId());
                reply.enableChatProtocolOne();
                messages.saveAndFlush(reply);
            }
            attempt.attachCompletedBusinessMessage(replyId);
            runs.saveAndFlush(run); attempts.saveAndFlush(attempt); conversations.saveAndFlush(conversation);
        }
    }

    @Transactional
    public void recoverUnknown(UUID userId, UUID conversationId, UUID runId, UUID attemptId) {
        ConversationEntity conversation = lockConversation(userId, conversationId);
        requireProtocolOne(conversation);
        ChatRunEntity run = lockRun(runId, userId, conversationId);
        ChatAttemptEntity attempt = lockAttempt(attemptId, runId, userId);
        boolean targetIsCurrent = attemptId.equals(run.getCurrentAttemptId());
        boolean alreadyResolved = isResolvedUnknown(attempt);
        if (alreadyResolved && (!targetIsCurrent || !runId.equals(conversation.getActiveChatRunId()))) return;
        if (!targetIsCurrent || !runId.equals(conversation.getActiveChatRunId())) {
            throw new DomainException("CHAT_RECOVERY_NOT_ALLOWED", "This Chat attempt cannot be recovered");
        }
        if (alreadyResolved) return;
        if (!"UNKNOWN".equals(run.getStatus()) || !"UNKNOWN".equals(attempt.getStatus())) {
            throw new DomainException("CHAT_RECOVERY_NOT_ALLOWED", "Only an unknown Chat attempt can be recovered");
        }
        if (hasCommittedActivity(attemptId, runId, userId)) {
            settleCommittedActivity(conversation, run, attempt);
            conversations.saveAndFlush(conversation);
            return;
        }

        conversation.fenceUnknownChatRun(runId);
        List<Map<String, Object>> publicParts;
        try { publicParts = invalidateGeneratingParts(readPublicList(attempt.getPublicPartsJson())); }
        catch (DomainException corruptedSnapshot) { publicParts = List.of(); }
        String markdown = ChatPublicProjection.markdown(publicParts);
        attempt.updateSnapshot(mapper.writeValueAsString(publicParts), attempt.getToolTraceJson(),
                attempt.getLastSequence());
        attempt.completeMessage(attempt.getAllocatedReplyMessageId(), "FAILED", "CHAT_UNKNOWN_ABANDONED");
        MessageEntity reply = messages.findById(attempt.getAllocatedReplyMessageId()).orElse(null);
        if (reply == null) {
            reply = new MessageEntity(attempt.getAllocatedReplyMessageId(), conversationId, userId,
                    conversation.allocateNextMessageSequence(), AiMessageRole.ASSISTANT,
                    AiMessageStatus.FAILED, markdown, null, "CHAT_UNKNOWN_ABANDONED", null, null,
                    run.getUserMessageId());
            reply.enableChatProtocolOne();
        } else {
            reply.replacePublicProjection(markdown, AiMessageStatus.FAILED, "CHAT_UNKNOWN_ABANDONED");
        }
        run.mark("FAILED");
        conversation.releaseChatRun(runId, conversation.getChatFence());
        messages.saveAndFlush(reply);
        runs.saveAndFlush(run);
        attempts.saveAndFlush(attempt);
        conversations.saveAndFlush(conversation);
    }

    private boolean hasCommittedActivity(UUID attemptId, UUID runId, UUID userId) {
        return activities.findAllByAttemptIdAndRunIdAndUserIdOrderByCreatedAtAsc(attemptId, runId, userId)
                .stream().anyMatch(activity -> "READY".equals(activity.getState())
                        || "SUBMITTED".equals(activity.getState()));
    }

    private void settleCommittedActivity(ConversationEntity conversation, ChatRunEntity run,
            ChatAttemptEntity attempt) {
        conversation.fenceUnknownChatRun(run.getId());
        UUID replyId = attempt.getAllocatedReplyMessageId();
        attempt.completeMessage(replyId, "COMPLETED", null);
        run.mark("COMPLETED");
        messages.findById(replyId).ifPresent(reply -> {
            if (reply.getStatus() != AiMessageStatus.COMPLETED) {
                List<Map<String, Object>> publicParts;
                try { publicParts = readPublicList(attempt.getPublicPartsJson()); }
                catch (DomainException corruptedSnapshot) { publicParts = List.of(); }
                reply.replacePublicProjection(ChatPublicProjection.markdown(publicParts), AiMessageStatus.COMPLETED, null);
                messages.saveAndFlush(reply);
            }
        });
        attempts.saveAndFlush(attempt);
        runs.saveAndFlush(run);
        conversation.releaseChatRun(run.getId(), conversation.getChatFence());
    }

    private boolean isResolvedUnknown(ChatAttemptEntity attempt) {
        return "COMPLETED".equals(attempt.getStatus())
                || ("FAILED".equals(attempt.getStatus())
                        && "CHAT_UNKNOWN_ABANDONED".equals(attempt.getSafeErrorCode()));
    }

    private List<Map<String, Object>> invalidateGeneratingParts(List<Map<String, Object>> parts) {
        return parts.stream().map(part -> {
            if (!"block".equals(part.get("kind")) || !"GENERATING".equals(part.get("state"))) return part;
            Map<String, Object> invalid = new LinkedHashMap<>(part);
            invalid.put("state", "INVALID");
            return Map.copyOf(invalid);
        }).toList();
    }

    public String workerInstanceId() { return workerInstanceId; }

    @Transactional(readOnly = true)
    public ChatRunEntity requireRun(UUID userId, UUID conversationId, UUID runId) {
        return runs.findByIdAndUserIdAndConversationId(runId, userId, conversationId)
                .orElseThrow(() -> notFound("Chat run was not found"));
    }

    @Transactional(readOnly = true)
    public ExecutionProfile executionProfile(UUID userId, UUID conversationId, UUID runId) {
        ChatRunEntity run = runs.findByIdAndUserIdAndConversationId(runId, userId, conversationId)
                .orElseThrow(() -> notFound("Chat run was not found"));
        try {
            JsonNode profile = mapper.readTree(run.getRequestContextJson()).path("executionProfile");
            return new ExecutionProfile(
                    com.auralis.app.ai.AiProviderType.valueOf(profile.path("provider").stringValue()),
                    profile.path("chatModel").stringValue(), profile.path("endpointHash").stringValue());
        } catch (RuntimeException exception) {
            throw new DomainException("CHAT_CONTEXT_UNAVAILABLE", "Chat provider profile is unavailable");
        }
    }

    @Transactional(readOnly = true)
    public List<ChatAttemptEntity> attemptHistory(UUID runId) { return attempts.findAllByRunIdOrderByAttemptNoAsc(runId); }

    @Transactional(readOnly = true)
    public List<ChatRunEntity> conversationRunHistory(UUID userId, UUID conversationId) {
        conversations.findByIdAndUserIdAndDeletedAtIsNull(conversationId, userId)
                .orElseThrow(() -> notFound("Conversation was not found"));
        return runs.findAllByConversationIdAndUserIdOrderByCreatedAtAsc(conversationId, userId);
    }

    @Transactional(readOnly = true)
    public String privateToolEvidence(UUID userId, UUID conversationId, UUID runId, UUID attemptId) {
        ChatRunEntity run = runs.findByIdAndUserIdAndConversationId(runId, userId, conversationId)
                .orElseThrow(() -> notFound("Chat run was not found"));
        if (!attemptId.equals(run.getCurrentAttemptId())) return "[]";
        return attempts.findByIdAndRunIdAndUserId(attemptId, runId, userId)
                .map(ChatAttemptEntity::getPrivateToolEvidenceJson).orElse("[]");
    }

    @Transactional(readOnly = true)
    public List<ChatActivityEntity> activityHistory(UUID runId) { return activities.findAllByRunIdOrderByCreatedAtAsc(runId); }

    @Transactional(readOnly = true)
    public ChatActivityEntity activityForSubmissionRun(UUID runId, UUID userId) {
        return activities.findByReplyRunIdAndUserId(runId, userId).orElse(null);
    }

    @Transactional(readOnly = true)
    public boolean executionActive(UUID userId, UUID conversationId, UUID runId) {
        return conversations.findByIdAndUserIdAndDeletedAtIsNull(conversationId, userId)
                .map(conversation -> runId.equals(conversation.getActiveChatRunId())).orElse(false);
    }

    @Transactional(readOnly = true)
    public boolean executionActive(UUID userId, UUID conversationId, UUID runId, UUID attemptId) {
        if (!executionActive(userId, conversationId, runId)) return false;
        return runs.findByIdAndUserIdAndConversationId(runId, userId, conversationId)
                .map(run -> attemptId.equals(run.getCurrentAttemptId())).orElse(false);
    }

    private Admission current(ChatRunEntity run, boolean replay) {
        ChatAttemptEntity attempt = attempts.findByIdAndRunIdAndUserId(run.getCurrentAttemptId(), run.getId(), run.getUserId())
                .orElseThrow(() -> notFound("Chat attempt was not found"));
        return new Admission(run, attempt, run.getUserMessageId(), replay);
    }

    private boolean activitiesBelongToConversation(ChatActivityEntity activity, UUID conversationId, UUID userId) {
        return runs.findByIdAndUserIdAndConversationId(activity.getRunId(), userId, conversationId).isPresent();
    }
    private List<Map<String, Object>> readPublicList(String json) {
        try {
            return mapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (RuntimeException exception) {
            throw new DomainException("CHAT_SNAPSHOT_UNAVAILABLE", "Chat snapshot is unavailable");
        }
    }
    private String userMessageText(AiMessageCommand command, ChatActivityEntity activity) {
        if ("turn".equals(command.action())) return command.content();
        return "Activity answer submitted: " + answerText(activity, command.answer());
    }
    private ConversationEntity lockConversation(UUID userId, UUID id) {
        return conversations.findForUpdateByIdAndUserIdAndDeletedAtIsNull(id, userId)
                .orElseThrow(() -> notFound("Conversation was not found"));
    }
    private ChatRunEntity lockRun(UUID id, UUID userId, UUID conversationId) {
        return runs.findForUpdate(id, userId, conversationId).orElseThrow(() -> notFound("Chat run was not found"));
    }
    private ChatAttemptEntity lockAttempt(UUID id, UUID runId, UUID userId) {
        return attempts.findForUpdate(id, runId, userId).orElseThrow(() -> notFound("Chat attempt was not found"));
    }
    private void requireProtocolOne(ConversationEntity conversation) {
        if (!Short.valueOf((short) 1).equals(conversation.getChatProtocolVersion())) {
            throw new DomainException("CHAT_PROTOCOL_UNSUPPORTED", "This conversation cannot be used with Chat protocol 1");
        }
    }
    private void requireOwner(ConversationEntity c, ChatRunEntity r, ChatAttemptEntity a, long fence) {
        if (!owns(c, r, a, fence)) throw new DomainException("CHAT_RUN_FENCE_LOST", "Chat run no longer owns this conversation");
    }
    private void requireRunning(ChatAttemptEntity attempt) {
        if ("CANCEL_REQUESTED".equals(attempt.getStatus())) {
            throw new DomainException("CHAT_RUN_CANCELLED", "Chat run was cancelled");
        }
        if (!"RUNNING".equals(attempt.getStatus())) {
            throw new DomainException("CHAT_RUN_FENCE_LOST", "Chat run no longer owns this conversation");
        }
    }
    private boolean owns(ConversationEntity c, ChatRunEntity r, ChatAttemptEntity a, long fence) {
        return fence == c.getChatFence() && fence == r.getFenceVersion() && fence == a.getFenceVersion()
                && r.getId().equals(c.getActiveChatRunId()) && r.getCurrentAttemptId().equals(a.getId());
    }
    private void requireSameHash(String expected, String actual) { if (!expected.equals(actual)) throw requestConflict(); }
    private void validateAnswer(ChatActivityEntity activity, JsonNode answer) {
        if ("open".equals(activity.getQuestionType())) {
                if (answer == null || !answer.isTextual() || answer.textValue().isBlank() || answer.textValue().length() > 4000) {
                    throw new DomainException("VALIDATION_FAILED", "Activity text answer is invalid");
                }
                return;
        }
        try {
            JsonNode keys = answer;
            if (keys == null || !keys.isArray() || keys.size() == 0 || keys.size() > 12) {
                throw new DomainException("VALIDATION_FAILED", "Activity option answer is invalid");
            }
            Map<String, Object> payload = mapper.readValue(activity.getPublicPayloadJson(),
                    new TypeReference<Map<String, Object>>() {});
            Object rawItems = payload.get("items");
            java.util.Set<String> allowed = new java.util.HashSet<>();
            if (rawItems instanceof List<?> list) for (Object item : list) {
                if (item instanceof Map<?, ?> map && map.get("key") instanceof String key) allowed.add(key);
            }
            java.util.Set<String> submitted = new java.util.HashSet<>();
            for (JsonNode item : keys) {
                if (!item.isTextual() || item.textValue().isBlank() || !allowed.contains(item.textValue())
                        || !submitted.add(item.textValue())) {
                    throw new DomainException("VALIDATION_FAILED", "Activity option answer is invalid");
                }
            }
            if ("single".equals(activity.getQuestionType()) && keys.size() != 1) {
                throw new DomainException("VALIDATION_FAILED", "A single choice activity requires one option");
            }
        } catch (DomainException exception) { throw exception; }
        catch (Exception exception) { throw new DomainException("CHAT_ACTIVITY_UNAVAILABLE", "Activity content is unavailable"); }
    }
    private String answerText(ChatActivityEntity activity, JsonNode answer) {
        if (answer == null) return "";
        if ("open".equals(activity.getQuestionType())) return answer.textValue();
        try {
            Map<String, Object> payload = mapper.readValue(activity.getPublicPayloadJson(),
                    new TypeReference<Map<String, Object>>() {});
            Map<String, String> labels = new java.util.HashMap<>();
            if (payload.get("items") instanceof List<?> items) for (Object item : items) {
                if (item instanceof Map<?, ?> map && map.get("key") instanceof String key
                        && map.get("text") instanceof String text) labels.put(key, text);
            }
            List<String> values = new java.util.ArrayList<>();
            answer.forEach(item -> values.add(item.textValue() + ". " + labels.getOrDefault(item.textValue(), "")));
            return String.join("; ", values);
        } catch (RuntimeException exception) {
            throw new DomainException("CHAT_ACTIVITY_UNAVAILABLE", "Activity content is unavailable");
        }
    }
    private Object answerValue(JsonNode answer) {
        if (answer.isTextual()) return answer.textValue();
        List<String> values = new java.util.ArrayList<>();
        answer.forEach(item -> values.add(item.textValue()));
        return List.copyOf(values);
    }
    private void requireSourceRevisions(UUID userId, Map<UUID, UUID> sourceRevisions) {
        if (!sourceRevisionsCurrent(userId, sourceRevisions)) {
            throw new DomainException("SOURCE_SCOPE_CHANGED", "Source changed during this Chat run");
        }
    }
    private boolean sourceRevisionsCurrent(UUID userId, Map<UUID, UUID> sourceRevisions) {
        if (sourceRevisions == null || sourceRevisions.isEmpty()) return true;
        return sources.lockAndCheckReadyRevisions(userId, sourceRevisions);
    }
    private void settleUndispatched(ConversationEntity conversation, ChatRunEntity run,
            ChatAttemptEntity attempt, String status, String safeErrorCode, long sequence) {
        UUID replyId = attempt.getAllocatedReplyMessageId();
        if (!messages.existsById(replyId)) {
            MessageEntity reply = new MessageEntity(replyId, conversation.getId(), run.getUserId(),
                    conversation.allocateNextMessageSequence(), AiMessageRole.ASSISTANT,
                    terminalMessageStatus(status), "", null, safeErrorCode, null, null, run.getUserMessageId());
            reply.enableChatProtocolOne();
            messages.saveAndFlush(reply);
        }
        attempt.updateSnapshot(attempt.getPublicPartsJson(), attempt.getToolTraceJson(), sequence);
        attempt.completeMessage(replyId, status, safeErrorCode);
        run.mark(status);
        attempts.saveAndFlush(attempt);
        runs.saveAndFlush(run);
    }
    String requestHash(Object command) {
        try {
            Object normalized = command;
            if (command instanceof AiMessageCommand body) {
                Map<String, Object> fields = new LinkedHashMap<>();
                fields.put("protocolVersion", body.protocolVersion());
                fields.put("action", body.action());
                fields.put("conversationId", body.conversationId());
                fields.put("content", body.content());
                fields.put("readingContext", body.readingContext());
                fields.put("selectionText", body.selectionText());
                fields.put("activityId", body.activityId());
                fields.put("questionVersion", body.questionVersion());
                fields.put("submissionId", body.submissionId());
                fields.put("answer", body.answer());
                normalized = fields;
            }
            return sha256(mapper.writeValueAsString(normalized));
        }
        catch (Exception e) { throw new IllegalStateException("Unable to fingerprint Chat request", e); }
    }
    private ChatConversationScope resolveConversationScope(ConversationEntity conversation, AiMessageCommand command) {
        if (conversation.getChatScopeState() == ChatConversationScopeState.LEGACY) throw scopeConflict();
        if (conversation.getChatScopeState() == ChatConversationScopeState.UNBOUND) {
            if (!"turn".equals(command.action())) throw scopeConflict();
            ReadingContext requested = command.readingContext();
            if (requested != null) {
                if (readTools == null) throw new IllegalStateException("Chat scope validation is unavailable");
                readTools.begin(conversation.getUserId(), requested);
            }
            ChatConversationScope scope = ChatConversationScope.from(requested);
            conversation.bindChatScope(scopeJson(scope));
            return scope;
        }
        ChatConversationScope bound = conversationScope(conversation);
        ChatConversationScope requested = ChatConversationScope.from(command.readingContext());
        if (requested != null && !requested.equals(bound)) throw scopeConflict();
        return bound;
    }

    private void requireBoundScopeForRun(ConversationEntity conversation, ChatRunEntity run) {
        if (conversation.getChatScopeState() != ChatConversationScopeState.BOUND
                || !java.util.Objects.equals(conversationScope(conversation), runScope(run))) {
            throw scopeConflict();
        }
    }

    private ChatConversationScope conversationScope(ConversationEntity conversation) {
        if (conversation.getChatScopeJson() == null) return null;
        try { return mapper.readValue(conversation.getChatScopeJson(), ChatConversationScope.class); }
        catch (RuntimeException exception) {
            throw new DomainException("CHAT_CONTEXT_UNAVAILABLE", "Chat conversation scope is unavailable");
        }
    }

    private ChatConversationScope runScope(ChatRunEntity run) {
        try {
            JsonNode readingContext = mapper.readTree(run.getRequestContextJson()).get("readingContext");
            return readingContext == null || readingContext.isString()
                    ? null : ChatConversationScope.from(mapper.treeToValue(readingContext, ReadingContext.class));
        } catch (RuntimeException exception) {
            throw new DomainException("CHAT_CONTEXT_UNAVAILABLE", "Chat request context is unavailable");
        }
    }

    private String scopeJson(ChatConversationScope scope) {
        if (scope == null) return null;
        try { return mapper.writeValueAsString(scope); }
        catch (RuntimeException exception) {
            throw new IllegalStateException("Unable to persist Chat conversation scope", exception);
        }
    }

    private String requestContext(AiMessageCommand command, ExecutionProfile executionProfile,
            ChatConversationScope conversationScope) {
        try { return mapper.writeValueAsString(Map.of("action", command.action(),
                "readingContext", conversationScope == null ? "" : conversationScope.toReadingContext(),
                "selectionText", command.effectiveSelectionText() == null ? "" : command.effectiveSelectionText(),
                "executionProfile", Map.of("provider", executionProfile.provider().name(),
                        "chatModel", executionProfile.chatModel(), "endpointHash", executionProfile.endpointHash()))); }
        catch (Exception e) { throw new IllegalStateException("Unable to persist Chat request context", e); }
    }
    private DomainException scopeConflict() {
        return new DomainException("CHAT_SCOPE_CONFLICT",
                "This conversation has a different or legacy reading scope; start a new conversation");
    }
    private String answerHash(Object answer) { return requestHash(answer); }
    private Instant deadlineFromNow() { return Instant.now().plusSeconds(properties.attemptDeadlineSeconds()); }
    private static String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private AiMessageStatus terminalMessageStatus(String status) {
        return switch (status) { case "COMPLETED" -> AiMessageStatus.COMPLETED; case "CANCELLED" -> AiMessageStatus.INTERRUPTED; default -> AiMessageStatus.FAILED; };
    }
    private DomainException activeRun() { return new DomainException("CHAT_RUN_ACTIVE", "A run is already active for this conversation"); }
    private DomainException requestConflict() { return new DomainException("CHAT_REQUEST_CONFLICT", "requestId was already used with a different payload"); }
    private DomainException notFound(String message) { return new DomainException("RESOURCE_NOT_FOUND", message); }

    public record Admission(ChatRunEntity run, ChatAttemptEntity attempt, UUID userMessageId, boolean replay) {}
    public record Terminal(ChatRunEntity run, ChatAttemptEntity attempt, UUID replyMessageId) {}
    public enum ClaimResult { CLAIMED, DEADLINE_EXPIRED, FENCE_LOST }
    public record ExecutionProfile(com.auralis.app.ai.AiProviderType provider, String chatModel, String endpointHash) {}
}
