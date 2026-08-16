package com.auralis.app.ai.internal.security;

import java.io.IOException;

public class ProviderResponseTooLargeException extends IOException {

    public ProviderResponseTooLargeException() {
        super("AI provider response exceeded the configured limit");
    }
}
