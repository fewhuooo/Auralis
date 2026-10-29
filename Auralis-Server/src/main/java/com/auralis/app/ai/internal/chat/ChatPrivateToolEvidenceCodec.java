package com.auralis.app.ai.internal.chat;

import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Serializes private evidence snapshots. This codec is not used by public DTO projections. */
@Component
public final class ChatPrivateToolEvidenceCodec {
    private static final TypeReference<List<ChatToolEvidence>> EVIDENCE_LIST = new TypeReference<>() {};
    private final ObjectMapper mapper;

    public ChatPrivateToolEvidenceCodec(ObjectMapper mapper) {
        this.mapper = Objects.requireNonNull(mapper);
    }

    public String encode(List<ChatToolEvidence> evidence) {
        try {
            return mapper.writeValueAsString(List.copyOf(evidence));
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("Private Chat tool evidence cannot be serialized", exception);
        }
    }

    public List<ChatToolEvidence> decode(String json) {
        if (json == null || json.isBlank()) throw new IllegalArgumentException("Private Chat tool evidence is missing");
        try {
            List<ChatToolEvidence> evidence = mapper.reader()
                    .with(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .forType(EVIDENCE_LIST).readValue(json);
            if (evidence == null) throw new IllegalArgumentException("Private Chat tool evidence is invalid");
            return List.copyOf(evidence);
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("Private Chat tool evidence cannot be parsed", exception);
        }
    }

    public String append(String json, ChatToolEvidence evidence) {
        Objects.requireNonNull(evidence);
        ArrayList<ChatToolEvidence> result = new ArrayList<>(decode(json));
        result.add(evidence);
        return encode(result);
    }
}
