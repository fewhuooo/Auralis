package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles({"test", "prod"})
@TestPropertySource(properties = {
        "AURALIS_UPLOAD_MAX_FILE_SIZE_BYTES=52428800"
})
class ProductionConfigurationTests {
    @Autowired
    private Environment environment;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void disablesOpenApiEndpointsInProduction() throws Exception {
        assertThat(environment.getProperty("spring.jpa.open-in-view", Boolean.class)).isFalse();
        assertThat(environment.getProperty("springdoc.api-docs.enabled", Boolean.class)).isFalse();
        assertThat(environment.getProperty("springdoc.swagger-ui.enabled", Boolean.class)).isFalse();

        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isNotFound());
    }
}
