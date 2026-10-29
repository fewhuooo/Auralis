package com.auralis.app.ai;

/** Cancellation signal shared by provider transports without coupling them to one business workflow. */
public interface AiProviderCallCancellation {

    boolean isCancelled();

    boolean cancel();

    Registration onCancel(Runnable listener);

    @FunctionalInterface
    interface Registration extends AutoCloseable {
        @Override
        void close();
    }
}
