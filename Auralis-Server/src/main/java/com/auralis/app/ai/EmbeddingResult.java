package com.auralis.app.ai;

import java.util.List;

public record EmbeddingResult(List<List<Double>> vectors) {

    public EmbeddingResult {
        vectors = vectors.stream().map(List::copyOf).toList();
        for (List<Double> vector : vectors) {
            if (vector.size() != 1024 || vector.stream().anyMatch(value -> value == null || !Double.isFinite(value))) {
                throw new IllegalArgumentException("Embedding vectors must contain exactly 1024 finite values");
            }
        }
    }
}
