package com.auralis.app.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

@Component
class SmtpAuthEmailDelivery implements AuthEmailDelivery {

    private final JavaMailSenderImpl sender = new JavaMailSenderImpl();
    private final String from;

    SmtpAuthEmailDelivery(
            @Value("${auralis.mail.host:}") String host,
            @Value("${auralis.mail.port:587}") int port,
            @Value("${auralis.mail.username:}") String username,
            @Value("${auralis.mail.password:}") String password,
            @Value("${auralis.mail.from:}") String from,
            @Value("${auralis.mail.starttls:true}") boolean starttls) {
        this.from = from;
        sender.setHost(host);
        sender.setPort(port);
        sender.setUsername(username);
        sender.setPassword(password);
        var properties = sender.getJavaMailProperties();
        properties.setProperty("mail.smtp.auth", Boolean.toString(!username.isBlank()));
        properties.setProperty("mail.smtp.starttls.enable", Boolean.toString(starttls));
        properties.setProperty("mail.smtp.starttls.required", Boolean.toString(starttls));
        properties.setProperty("mail.smtp.ssl.checkserveridentity", Boolean.toString(starttls));
        properties.setProperty("mail.smtp.connectiontimeout", "5000");
        properties.setProperty("mail.smtp.timeout", "5000");
        properties.setProperty("mail.smtp.writetimeout", "5000");
    }

    @Override
    public void requireConfigured() {
        if (sender.getHost().isBlank() || from.isBlank()) {
            throw new IdentityException("SERVICE_UNAVAILABLE", "Account email delivery is unavailable");
        }
    }

    @Override
    public void send(String email, String subject, String text) {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject(subject);
        message.setText(text);
        try {
            sender.send(message);
        } catch (MailException exception) {
            throw new IdentityException("SERVICE_UNAVAILABLE", "Account email delivery is unavailable");
        }
    }
}
