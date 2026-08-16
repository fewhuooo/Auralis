package com.auralis.app.ai.retrieval;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.List;

public class EmbeddingVectorCodec {

    private static final int DIMENSION = 1024;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public String encode(List<Double> vector) {
        validate(vector);
        try {
            return objectMapper.writeValueAsString(vector);
        } catch (JsonProcessingException exception) {
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
