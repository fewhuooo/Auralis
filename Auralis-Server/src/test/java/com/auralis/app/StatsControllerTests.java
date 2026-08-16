package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class StatsControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void statsRoutesRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/stats/overview")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/stats/weekly")).andExpect(status().isUnauthorized());
    }
}
