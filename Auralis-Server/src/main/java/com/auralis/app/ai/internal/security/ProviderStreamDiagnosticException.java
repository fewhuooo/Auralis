package com.auralis.app.ai.internal.security;

import com.auralis.app.shared.error.DomainException;

/** Internal stream failure marker used to log safe failure context without response content. */
public final class ProviderStreamDiagnosticException extends RuntimeException {

    private final String phase;
    private final String diagnosticErrorCode;

    private ProviderStreamDiagnosticException(String phase, String diagnosticErrorCode, Throwable cause) {
        super("AI provider stream processing failed", cause);
        this.phase = phase;
        this.diagnosticErrorCode = diagnosticErrorCode;
    }

    public static ProviderStreamDiagnosticException providerFrameJson(Throwable cause) {
        return new ProviderStreamDiagnosticException("provider_frame_json", "MODEL_PROVIDER_ERROR", cause);
    }

    public static ProviderStreamDiagnosticException providerFrameProtocol(Throwable cause) {
        return new ProviderStreamDiagnosticException("provider_frame_protocol", domainCodeOrDefault(cause), cause);
    }

    public static ProviderStreamDiagnosticException consumerCallback(Throwable cause) {
        return new ProviderStreamDiagnosticException("consumer_callback", domainCode(cause), cause);
    }

    public String phase() {
        return phase;
    }

    public String diagnosticErrorCode() {
        return diagnosticErrorCode;
    }

    private static String domainCodeOrDefault(Throwable cause) {
        String code = domainCode(cause);
        return code == null ? "MODEL_PROVIDER_ERROR" : code;
    }

    private static String domainCode(Throwable cause) {
        for (Throwable current = cause; current != null; current = current.getCause()) {
            if (current instanceof DomainException domainException) return domainException.code();
        }
        return null;
    }

}
