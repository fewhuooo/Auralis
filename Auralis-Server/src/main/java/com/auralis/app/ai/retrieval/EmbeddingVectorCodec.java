package com.auralis.app.ai.retrieval;

import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

public class EmbeddingVectorCodec {

    private static final int DIMENSION = 1024;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public String encode(List<Double> vector) {
        validate(vector);
        try {
            return objectMapper.writeValueAsString(vector);
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("Embedding vector could not be serialized", exception);
        }
    }

    public List<Double> decode(String json) {
        try {
            List<Double> vector = objectMapper.readValue(json, new TypeReference<>() { });
            validate(vector);
            return List.copyOf(vector);
        } catch (Exception exception) {
            if (exception instanceof IllegalArgumentException illegalArgumentException) {
                throw illegalArgumentException;
            }
            throw new IllegalArgumentException("Embedding vector is invalid", exception);
        }
    }

    public void validate(List<Double> vector) {
        if (vector == null || vector.size() != DIMENSION
                || vector.stream().anyMatch(value -> value == null || !Double.isFinite(value))) {
            throw new IllegalArgumentException("Embedding vector must contain exactly 1024 finite values");
        }
    }
}
