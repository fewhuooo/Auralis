package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

class ArchitectureTests {
    @Test
    void verifiesApplicationModules() {
        ApplicationModules.of(AuralisApplication.class).verify();
    }
}
