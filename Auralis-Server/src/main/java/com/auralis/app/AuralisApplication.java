package com.auralis.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class AuralisApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuralisApplication.class, args);
    }
}
