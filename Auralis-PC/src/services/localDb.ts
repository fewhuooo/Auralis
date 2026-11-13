import Database from '@tauri-apps/plugin-sql';
import {
  createLocalRepository,
  DocumentProcessingJobRepository,
  type LocalRepository,
} from '@/services/localRepository';
import { createVersionedLocalSchema, type LocalSqlDatabase } from '@/services/localSchema';
import { LocalDatabaseRuntime } from '@/services/localDatabaseRuntime';
import { LocalSqlQueue, serializeLocalSqlDatabase } from '@/services/localSqlQueue';
import { initializeLocalDatabasePool, isTauriEnvironment } from '@/api/tauri';
import { OverviewRepository } from '@/services/overviewRepository';
import { FocusSessionRepository } from '@/services/focusSessionRepository';
import { LocalAssetRepository } from '@/services/localAssetRepository';
import { LocalParsedDocumentRepository } from '@/services/localParsedDocumentRepository';

let db: LocalSqlDatabase | 'localstorage' | undefined;
const localDatabaseRuntime = new LocalDatabaseRuntime<LocalSqlDatabase | 'localstorage'>();
const localSqlQueue = new LocalSqlQueue();

export const getLocalSqlDatabase = (): LocalSqlDatabase | 'localstorage' => {
  if (!db) throw new Error('LOCAL_DATABASE_NOT_INITIALIZED');
  return db;
};

export const localDb = {
  async init() {
    db = await localDatabaseRuntime.initialize(async () => {
      if (!isTauriEnvironment()) {
        console.warn('[SQLite PC] Not running in Tauri context, using localStorage fallback.');
        return 'localstorage';
      }
      const rawDatabase = await Database.load('sqlite:auralis.db') as LocalSqlDatabase;
      await initializeLocalDatabasePool();
      const loaded = serializeLocalSqlDatabase(rawDatabase, localSqlQueue);
      await loaded.execute('PRAGMA journal_mode = WAL');
      await loaded.execute('PRAGMA busy_timeout = 5000');
      await createVersionedLocalSchema(loaded);
      console.log('[SQLite PC] Database initialized and tables verified.');
      return loaded;
    });
    return db;
  },
};

/** Returns the current owner/device-scoped resource repository. */
export async function getLocalRepository(userId: string, serverDeviceId: string): Promise<LocalRepository> {
  const database = await localDb.init();
  if (database === 'localstorage') {
    const repository = localDatabaseRuntime.getOrCreate(
      `repository:${userId}:${serverDeviceId}`,
      () => createLocalRepository(userId, serverDeviceId)
    );
    await repository.backupLegacyData();
    return repository;
  }
  return localDatabaseRuntime.getOrCreate(
    `repository:${userId}:${serverDeviceId}`,
    () => createLocalRepository(userId, serverDeviceId, {
      sql: database,
      schemaReady: Promise.resolve(),
    }),
  );
}

/**
 * Returns the durable, user/device-isolated document job repository used by
 * the Tauri processing runtime. It intentionally shares the same initialized
 * SQLite connection as the rest of the local repository layer.
 */
export async function getDocumentProcessingJobRepository(
  userId: string,
  serverDeviceId: string,
): Promise<DocumentProcessingJobRepository> {
  const database = await localDb.init();
  if (database === 'localstorage') {
    return localDatabaseRuntime.getOrCreate(
      `document-jobs:${userId}:${serverDeviceId}`,
      () => new DocumentProcessingJobRepository(userId, serverDeviceId),
    );
  }
  return localDatabaseRuntime.getOrCreate(
    `document-jobs:${userId}:${serverDeviceId}`,
    () => new DocumentProcessingJobRepository(userId, serverDeviceId, { sql: database, schemaReady: Promise.resolve() }),
  );
}

/** Returns the owner/device-scoped derived overview cache on the shared DB. */
export async function getOverviewRepository(userId: string, serverDeviceId: string): Promise<OverviewRepository> {
  const database = await localDb.init();
  if (database === 'localstorage') return new OverviewRepository(userId, serverDeviceId);
  return new OverviewRepository(userId, serverDeviceId, { sql: database, schemaReady: Promise.resolve() });
}

/** Returns the durable, owner/device-scoped Pomodoro runtime and focus outbox. */
export async function getFocusSessionRepository(userId: string, serverDeviceId: string): Promise<FocusSessionRepository> {
  const database = await localDb.init();
  if (database === 'localstorage') {
    return localDatabaseRuntime.getOrCreate(
      `focus-sessions:${userId}:${serverDeviceId}`,
      () => new FocusSessionRepository(userId, serverDeviceId),
    );
  }
  return localDatabaseRuntime.getOrCreate(
    `focus-sessions:${userId}:${serverDeviceId}`,
    () => new FocusSessionRepository(userId, serverDeviceId, { sql: database, schemaReady: Promise.resolve() }),
  );
}

/** Returns the owner/device-scoped LocalAssetRepository on the shared DB. */
export async function getLocalAssetRepository(userId: string, serverDeviceId: string): Promise<LocalAssetRepository> {
  const database = await localDb.init();
  if (database === 'localstorage') {
    return localDatabaseRuntime.getOrCreate(
      `local-assets:${userId}:${serverDeviceId}`,
      () => new LocalAssetRepository(userId, serverDeviceId),
    );
  }
  return localDatabaseRuntime.getOrCreate(
    `local-assets:${userId}:${serverDeviceId}`,
    () => new LocalAssetRepository(userId, serverDeviceId, { sql: database, schemaReady: Promise.resolve() }),
  );
}

/** Returns the owner/device-scoped LocalParsedDocumentRepository on the shared DB. */
export async function getLocalParsedDocumentRepository(
  userId: string,
  serverDeviceId: string,
): Promise<LocalParsedDocumentRepository> {
  const database = await localDb.init();
  if (database === 'localstorage') {
    return localDatabaseRuntime.getOrCreate(
      `local-parsed-docs:${userId}:${serverDeviceId}`,
      () => new LocalParsedDocumentRepository(userId, serverDeviceId),
    );
  }
  return localDatabaseRuntime.getOrCreate(
    `local-parsed-docs:${userId}:${serverDeviceId}`,
    () => new LocalParsedDocumentRepository(userId, serverDeviceId, { sql: database, schemaReady: Promise.resolve() }),
  );
}
