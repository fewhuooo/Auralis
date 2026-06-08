package com.studycore.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableScheduling
@EnableAsync
public class StudyCoreApplication {

    public static void main(String[] args) {
        SpringApplication.run(StudyCoreApplication.class, args);
    }

}

