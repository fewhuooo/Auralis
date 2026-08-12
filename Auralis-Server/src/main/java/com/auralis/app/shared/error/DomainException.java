package com.auralis.app.shared.error;

public class DomainException extends RuntimeException {

    private final String code;
    private final Object current;

    public DomainException(String code, String message) {
        this(code, message, null);
    }

    public DomainException(String code, String message, Object current) {
        super(message);
        this.code = code;
        this.current = current;
    }

    public String code() {
        return code;
    }

    public Object current() {
        return current;
    }
}
