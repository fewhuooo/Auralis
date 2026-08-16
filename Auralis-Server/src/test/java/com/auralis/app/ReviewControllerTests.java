package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.http.MediaType.APPLICATION_JSON;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class ReviewControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void reviewRoutesRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/reviews/due")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/reviews/history")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/reviews/events").contentType(APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }
}
