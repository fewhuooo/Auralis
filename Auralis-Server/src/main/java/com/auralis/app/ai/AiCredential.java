package com.auralis.app.ai;

public record AiCredential(String baseUrl, String apiKey, String model) {

    public AiCredential(String baseUrl, String apiKey) {
        this(baseUrl, apiKey, null);
    }

    @Override
    public String toString() {
        return "AiCredential[baseUrl=" + baseUrl + ", apiKey=<redacted>, model=" + model + "]";
    }
}
