package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class RealtimeControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void ticketRouteRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/realtime/ticket"))
                .andExpect(status().isUnauthorized());
    }
}
