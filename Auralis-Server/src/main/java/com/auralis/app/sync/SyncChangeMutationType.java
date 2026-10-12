package com.auralis.app.sync;

/** Mutation types recorded in the pull change log. Schedule commands emit Task UPDATE entries. */
public enum SyncChangeMutationType {
    CREATE,
    UPDATE,
    DELETE,
    RESTORE
}
