package com.auralis.app.ai;

@FunctionalInterface
public interface AiStreamSink {

    void emit(AiStreamEvent event);
}
