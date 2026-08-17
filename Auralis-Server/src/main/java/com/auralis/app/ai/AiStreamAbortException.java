package com.auralis.app.ai;

/** Signals that the downstream SSE client disconnected while the model was streaming. */
public class AiStreamAbortException extends RuntimeException {

    public AiStreamAbortException(String message) {
        super(message);
    }

    public AiStreamAbortException(String message, Throwable cause) {
        super(message, cause);
    }
}
