package com.auralis.app.subject;

public record SubjectCommand(
        String name,
        String description,
        String iconKey,
        String color,
        String sortKey) {
}
