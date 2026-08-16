package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class SyncControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void syncRoutesRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/sync/pull")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/sync/snapshot")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/sync/push")
                        .contentType(APPLICATION_JSON)
                        .content("{\"deviceId\":\"00000000-0000-0000-0000-000000000001\",\"mutations\":[]}"))
                .andExpect(status().isUnauthorized());
    }
}
