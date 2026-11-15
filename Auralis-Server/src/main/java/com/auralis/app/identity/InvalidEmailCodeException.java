package com.auralis.app.identity;

class InvalidEmailCodeException extends IdentityException {

    InvalidEmailCodeException() {
        super("VALIDATION_FAILED", "The email verification code is invalid or expired");
    }
}
