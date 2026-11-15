package com.auralis.app.support;

import com.auralis.app.identity.AuthEmailDelivery;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.IdentityService;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfiguration
public class AuthTestAccounts {

    private static final Pattern CODE = Pattern.compile("[0-9]{6}");
    private static final ConcurrentHashMap<String, String> MAIL = new ConcurrentHashMap<>();

    @Bean
    @Primary
    AuthEmailDelivery testAuthEmailDelivery() {
        return new AuthEmailDelivery() {
            @Override
            public void requireConfigured() {
            }

            @Override
            public void send(String email, String subject, String text) {
                var code = CODE.matcher(text);
                if (!code.find()) {
                    throw new IllegalStateException("Verification code missing from test email");
                }
                MAIL.put(email, code.group());
            }
        };
    }

    public static AuthResult register(
            IdentityService service, String username, String password, DeviceCommand device) {
        String email = newEmail();
        service.sendRegistrationCode(email);
        return service.register(username.split("@", 2)[0], email, awaitCode(email), password, device);
    }

    public static String newEmail() {
        return UUID.randomUUID() + "@example.test";
    }

    public static String registrationFields(MockMvc mockMvc, String email) throws Exception {
        mockMvc.perform(post("/api/auth/register/email-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent());
        return "\"email\":\"" + email + "\",\"emailCode\":\"" + awaitCode(email) + "\",";
    }

    public static String awaitCode(String email) {
        String emailKey = email.toLowerCase(Locale.ROOT);
        await().pollInterval(java.time.Duration.ofMillis(10)).until(() -> MAIL.containsKey(emailKey));
        return MAIL.remove(emailKey);
    }
}
