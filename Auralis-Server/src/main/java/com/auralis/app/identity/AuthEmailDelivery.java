package com.auralis.app.identity;

public interface AuthEmailDelivery {

    void requireConfigured();

    void send(String email, String subject, String text);
}
