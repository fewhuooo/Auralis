package com.auralis.app.source.internal.storage;

import com.auralis.app.identity.AccountDeletionObjectStoragePort;
import com.auralis.app.source.AssetStoragePort;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!test")
public class AccountDeletionObjectStorageAdapter implements AccountDeletionObjectStoragePort {

    private final AssetStoragePort assetStorage;

    public AccountDeletionObjectStorageAdapter(AssetStoragePort assetStorage) {
        this.assetStorage = assetStorage;
    }

    @Override
    public void deleteObject(String objectKey) {
        assetStorage.deleteObject(objectKey);
    }
}
