package com.auralis.app.ai.internal.chat;

/** Components produced by application-owned Chat display tools. */
public enum DisplayComponent {
    STEPS, COMPARE, ROADMAP, CHART, QUIZ, QUESTION;

    public boolean activity() {
        return this == QUIZ || this == QUESTION;
    }

    public String wireName() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
