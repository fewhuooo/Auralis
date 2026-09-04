package com.auralis.app;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class JacksonNamespaceGuardTests {

    @Test
    void serverCodeDoesNotImportJackson2Namespaces() throws IOException {
        List<Path> jackson2Imports = List.of("src/main/java", "src/test/java").stream()
                .flatMap(this::javaFiles)
                .filter(this::importsJackson2)
                .toList();

        assertThat(jackson2Imports)
                .as("all server JSON code must use the tools.jackson Jackson 3 namespace")
                .isEmpty();
    }

    private java.util.stream.Stream<Path> javaFiles(String sourceRoot) {
        try {
            return Files.walk(Path.of(sourceRoot))
                    .filter(path -> path.toString().endsWith(".java"));
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private boolean importsJackson2(Path path) {
        try {
            return Files.readString(path).contains("import " + "com.fasterxml.jackson.");
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
