package com.auralis.app;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class JacksonNamespaceGuardTests {
    private static final Pattern FORBIDDEN_JACKSON_2_IMPORT = Pattern.compile(
            "(?s)\\bimport\\s+(?:static\\s+)?com\\s*\\.\\s*fasterxml\\s*\\.\\s*jackson\\s*\\.\\s*"
                    + "(?!annotation\\b)(?:\\p{javaJavaIdentifierStart}\\p{javaJavaIdentifierPart}*|\\*)");

    @Test
    void serverCodeDoesNotImportJackson2Namespaces() throws IOException {
        List<Path> jackson2Imports = List.of("src/main/java", "src/test/java").stream()
                .flatMap(this::javaFiles)
                .filter(this::importsJackson2)
                .toList();

        assertThat(jackson2Imports)
                .as("all server JSON code must use the tools.jackson Jackson 3 namespace, except Jackson 3 annotations")
                .isEmpty();
    }

    @Test
    void onlyJackson3AnnotationNamespaceRemainsAllowedFromJackson2() {
        assertThat(isForbiddenJackson2Import("import " + "com.fasterxml.jackson.annotation.JsonInclude;")).isFalse();
        assertThat(isForbiddenJackson2Import("import " + "com.fasterxml.jackson.annotation.*;")).isFalse();
        assertThat(isForbiddenJackson2Import("import " + "com.fasterxml.jackson.core.JsonFactory;")).isTrue();
        assertThat(isForbiddenJackson2Import("import " + "com.fasterxml.jackson.core.*;")).isTrue();
        assertThat(isForbiddenJackson2Import("import " + "com.fasterxml.jackson.databind.ObjectMapper;")).isTrue();
        assertThat(isForbiddenJackson2Import("import " + "com.fasterxml.jackson.databind.*;")).isTrue();
        assertThat(isForbiddenJackson2Import("import " + "com.fasterxml.jackson.dataformat.yaml.YAMLMapper;")).isTrue();
        assertThat(isForbiddenJackson2Import("import " + "com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;")).isTrue();
        assertThat(isForbiddenJackson2Import("import " + "com.fasterxml.jackson.annotationX.JsonInclude;")).isTrue();
        assertThat(isForbiddenJackson2Import(" \timport\t" + "com.fasterxml.jackson.databind.ObjectMapper;")).isTrue();
        assertThat(isForbiddenJackson2Import("import static " + "com.fasterxml.jackson.core.JsonParser.Feature.*;")).isTrue();
        assertThat(isForbiddenJackson2Import("\n\timport\nstatic\t" + "com \n . fasterxml . jackson . core . JsonParser.Feature.*;")).isTrue();
        assertThat(isForbiddenJackson2Import(" \timport\ncom . fasterxml.jackson . annotation . JsonInclude;")).isFalse();
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
            return isForbiddenJackson2Import(Files.readString(path));
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private boolean isForbiddenJackson2Import(String javaSource) {
        return FORBIDDEN_JACKSON_2_IMPORT.matcher(javaSource).find();
    }
}
