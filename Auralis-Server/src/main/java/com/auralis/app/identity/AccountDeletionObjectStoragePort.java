package com.auralis.app.identity;

/** Deletes a previously persisted object key as part of account data cleanup. */
public interface AccountDeletionObjectStoragePort {
    void deleteObject(String objectKey);
}
