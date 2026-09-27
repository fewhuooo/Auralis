package com.auralis.app;

import com.auralis.app.identity.AccountDeletionObjectStoragePort;
import com.auralis.app.source.internal.storage.InMemoryAssetStorage;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@Profile("test")
class TestAccountDeletionObjectStorageAdapter implements AccountDeletionObjectStoragePort {

    private final InMemoryAssetStorage storage;
    private final AtomicInteger deleteCount = new AtomicInteger();
    private volatile CountDownLatch entered = new CountDownLatch(0);
    private volatile CountDownLatch released = new CountDownLatch(0);
    private volatile boolean failNextDelete;

    TestAccountDeletionObjectStorageAdapter(InMemoryAssetStorage storage) {
        this.storage = storage;
    }

    @Override
    public void deleteObject(String objectKey) {
        deleteCount.incrementAndGet();
        if (failNextDelete) {
            failNextDelete = false;
            throw new IllegalStateException("Injected test storage failure");
        }
        CountDownLatch activeEntered = entered;
        CountDownLatch activeReleased = released;
        if (activeEntered.getCount() > 0) {
            activeEntered.countDown();
            try {
                if (!activeReleased.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Test storage delete was not released");
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Test storage delete was interrupted", exception);
            }
            entered = new CountDownLatch(0);
            released = new CountDownLatch(0);
        }
        storage.deleteObject(objectKey);
    }

    void blockNextDelete() {
        entered = new CountDownLatch(1);
        released = new CountDownLatch(1);
    }

    void failNextDelete() {
        failNextDelete = true;
    }

    boolean awaitDeleteStarted() throws InterruptedException {
        return entered.await(5, TimeUnit.SECONDS);
    }

    void releaseDelete() {
        released.countDown();
    }

    int deleteCount() {
        return deleteCount.get();
    }
}
