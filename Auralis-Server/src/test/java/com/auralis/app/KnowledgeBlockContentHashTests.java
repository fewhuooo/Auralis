package com.auralis.app;

import com.auralis.app.knowledge.KnowledgeBlockContentHash;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

class KnowledgeBlockContentHashTests {
    @Test
    void hashesKnownUtf8InputsWithoutNormalizingWhitespace() {
        assertThat(KnowledgeBlockContentHash.sha256(""))
                .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assertThat(KnowledgeBlockContentHash.sha256("Auralis"))
                .isEqualTo("ca0aff82988a2d88c95930e0e60b351db1969bedb7b088208676c6c1fdd19bc4");
        assertThat(KnowledgeBlockContentHash.sha256("复习-知识块-🧠"))
                .isEqualTo("4cb4ab086fd78ea385887ab411d0332c18039c4d86be9686938ef7c92cc15fd9");
        assertThat(KnowledgeBlockContentHash.sha256("  new body  "))
                .isEqualTo("7aa536c543f1cbbf5fb7783797393e6c0c828d109208f8a6e4608958866b021b");
        assertThat(KnowledgeBlockContentHash.sha256("new body"))
                .isEqualTo("ae907ab9a383483e5c37beee966723544b9e6f12148a7dcd56ceea7ad44c5a7b");
    }

    @Test
    void preservesTheExistingNullPrecondition() {
        assertThatNullPointerException()
                .isThrownBy(() -> KnowledgeBlockContentHash.sha256(null));
    }
}
