package com.auralis.app.ai.internal.security;

import java.io.IOException;

public class ProviderHttpException extends IOException {

    private final int status;

    public ProviderHttpException(int status) {
        super("AI provider request failed with status " + status);
        this.status = status;
    }

    public int status() {
        return status;
    }
}
