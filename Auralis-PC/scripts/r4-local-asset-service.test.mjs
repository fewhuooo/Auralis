import assert from 'node:assert/strict'
import { register } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

const srcRootUrl = new URL('../src/', import.meta.url).href
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const root = '${srcRootUrl}';
    const subPath = specifier.slice(2);
    const withExt = subPath.endsWith('.ts') ? subPath : subPath + '.ts';
    return nextResolve(new URL(withExt, root).href, context);
  }
  return nextResolve(specifier, context);
}
`
register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`, import.meta.url)

const { createVersionedLocalSchema } = await import('../src/services/localSchema.ts')
const { LocalAssetRepository, computeLocalAssetRelativePath } = await import('../src/services/localAssetRepository.ts')
const {
  LocalAssetService,
  TauriLocalAssetNativeAdapter,
  TransientBrowserAssetAdapter,
} = await import('../src/services/localAssetService.ts')

class TemporarySqlite {
  constructor() {
    this.database = new DatabaseSync(':memory:')
  }

  async execute(sql, bindValues = []) {
    this.database.prepare(sql.replace(/\$\d+/g, '?')).run(...bindValues)
  }

  async select(sql, bindValues = []) {
    return this.database.prepare(sql.replace(/\$\d+/g, '?')).all(...bindValues)
  }

  close() {
    this.database.close()
  }
}

const sampleSha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

function setupTauriInvokeMock(handler) {
  const previousWindow = globalThis.window
  const calls = []
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args, options) => {
        calls.push({ cmd, args, options })
        return handler(cmd, args, options)
      },
    },
  }
  return {
    calls,
    restore() {
      globalThis.window = previousWindow
    },
  }
}

test('offline import validates exact Rust payload (serde camelCase) and establishes ready local asset with descriptor', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repository = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    const filesOnDisk = new Map()
    const tauriMock = setupTauriInvokeMock(async (cmd, args) => {
      if (cmd === 'import_local_asset') {
        // Assert exact Rust serde camelCase payload shape
        assert.ok(args.command, 'import_local_asset must wrap in command')
        assert.equal(args.command.userScope, 'user-a', 'userId must map to userScope')
        assert.equal(args.command.deviceId, 'device-1', 'serverDeviceId must map to deviceId')
        assert.ok(args.command.localAssetId)
        assert.equal(args.command.sourcePath, 'C:/Users/User/Documents/sample.pdf')
        assert.equal(args.command.safeExtension, 'pdf')
        assert.equal(args.command.expectedSize, 1024)
        assert.equal(args.command.expectedSha256, sampleSha)

        const descriptor = {
          localAssetId: args.command.localAssetId,
          safeExtension: args.command.safeExtension,
          sizeBytes: args.command.expectedSize,
          sha256: args.command.expectedSha256,
          absolutePath: `C:/AppData/assets/${args.command.userScope}/${args.command.localAssetId}/content.pdf`,
        }
        filesOnDisk.set(args.command.localAssetId, descriptor)
        return descriptor
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })

    try {
      const nativeAdapter = new TauriLocalAssetNativeAdapter()
      const service = new LocalAssetService(repository, { nativeAdapter })

      // Guard against any network calls
      let httpCallCount = 0
      const originalFetch = globalThis.fetch
      globalThis.fetch = async () => {
        httpCallCount += 1
        throw new Error('HTTP should not be called during offline import')
      }

      try {
        const handle = await service.importAsset({
          sourcePath: 'C:/Users/User/Documents/sample.pdf',
          originalName: 'sample.pdf',
          mimeType: 'application/pdf',
          expectedSize: 1024,
          expectedSha256: sampleSha,
          sourceDraft: {
            subjectId: 'subject-10',
            title: 'Sample Subject Document',
          },
        })

        assert.equal(httpCallCount, 0, 'No HTTP requests must be initiated during offline import')
        assert.ok(handle.localAssetId)
        assert.equal(handle.state, 'READY_LOCAL')
        assert.equal(handle.isPersistent, true)
        assert.equal(handle.storageType, 'native-tauri')

        // Validate descriptor: must NOT have nonexistent relativePath
        assert.equal('relativePath' in handle.descriptor, false, 'Descriptor must not declare relativePath')
        assert.equal(handle.descriptor.localAssetId, handle.localAssetId)
        assert.equal(handle.descriptor.safeExtension, 'pdf')
        assert.equal(handle.descriptor.sizeBytes, 1024)
        assert.equal(handle.descriptor.sha256, sampleSha)
        assert.ok(handle.descriptor.absolutePath.includes('content.pdf'))

        // Verify SQLite persisted computed relative_path and NEVER absolutePath
        const assetRow = await repository.getAssetFile(handle.localAssetId)
        assert.ok(assetRow)
        assert.equal(assetRow.state, 'READY_LOCAL')
        assert.equal(assetRow.relativePath, `assets/user-a/${handle.localAssetId}/content.pdf`)
        assert.equal('absolutePath' in assetRow, false, 'SQLite record must never persist absolutePath')

        // Verify raw SQL row has no absolute_path column
        const rawRow = sqlite.database
          .prepare('SELECT * FROM local_asset_files WHERE user_id = ? AND device_id = ? AND local_asset_id = ?')
          .get('user-a', 'device-1', handle.localAssetId)
        assert.equal(rawRow.relative_path, `assets/user-a/${handle.localAssetId}/content.pdf`)
        assert.equal(rawRow.absolute_path, undefined)

        // Verify draft and sync job were created
        const drafts = await repository.listSourceDrafts({ localAssetId: handle.localAssetId })
        assert.equal(drafts.length, 1)
        assert.equal(drafts[0].subjectId, 'subject-10')

        const syncJob = await repository.getActiveSyncJobForAsset(handle.localAssetId)
        assert.ok(syncJob)
        assert.equal(syncJob.phase, 'PENDING')
      } finally {
        globalThis.fetch = originalFetch
      }
    } finally {
      tauriMock.restore()
    }
  } finally {
    sqlite.close()
  }
})

test('native import requires sourcePath, expectedSize, expectedSha256, and safeExtension before calling native', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repository = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    let tauriInvoked = false
    const tauriMock = setupTauriInvokeMock(async () => {
      tauriInvoked = true
      throw new Error('Should not be reached')
    })

    try {
      const nativeAdapter = new TauriLocalAssetNativeAdapter()
      const service = new LocalAssetService(repository, { nativeAdapter })

      // Missing sourcePath
      await assert.rejects(
        () => service.importAsset({
          originalName: 'file.pdf',
          mimeType: 'application/pdf',
          expectedSize: 500,
          expectedSha256: sampleSha,
        }),
        /LOCAL_ASSET_IMPORT_PRECONDITIONS_MISSING/
      )

      // Missing expectedSize
      await assert.rejects(
        () => service.importAsset({
          sourcePath: 'C:/docs/file.pdf',
          originalName: 'file.pdf',
          mimeType: 'application/pdf',
          expectedSha256: sampleSha,
        }),
        /LOCAL_ASSET_IMPORT_PRECONDITIONS_MISSING/
      )

      // Missing expectedSha256
      await assert.rejects(
        () => service.importAsset({
          sourcePath: 'C:/docs/file.pdf',
          originalName: 'file.pdf',
          mimeType: 'application/pdf',
          expectedSize: 500,
        }),
        /LOCAL_ASSET_IMPORT_PRECONDITIONS_MISSING/
      )

      assert.equal(tauriInvoked, false, 'Native command must not be invoked when preconditions are missing')
    } finally {
      tauriMock.restore()
    }
  } finally {
    sqlite.close()
  }
})

test('browser fallback explicitly declares transient storage and non-persistent handle and computes hash', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repository = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })
    const browserAdapter = new TransientBrowserAssetAdapter()
    const service = new LocalAssetService(repository, { nativeAdapter: browserAdapter })

    const handle = await service.importAsset({
      originalName: 'lecture.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 500,
      sha256: sampleSha,
    })

    assert.equal(handle.isPersistent, false, 'Browser fallback must explicitly be non-persistent')
    assert.equal(handle.storageType, 'transient-browser')
    assert.equal(handle.state, 'READY_LOCAL')
    assert.equal('relativePath' in handle.descriptor, false, 'Descriptor must not declare relativePath')
    assert.equal(handle.descriptor.safeExtension, 'pdf')
    assert.equal(handle.descriptor.sizeBytes, 500)
    assert.equal(handle.descriptor.sha256, sampleSha)
  } finally {
    sqlite.close()
  }
})

test('resolve local asset checks native disk presence with exact payload and marks CORRUPT when native throws FILE_MISSING', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repository = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    const filesOnDisk = new Map()
    const tauriMock = setupTauriInvokeMock(async (cmd, args) => {
      if (cmd === 'import_local_asset') {
        const descriptor = {
          localAssetId: args.command.localAssetId,
          safeExtension: args.command.safeExtension,
          sizeBytes: args.command.expectedSize,
          sha256: args.command.expectedSha256,
          absolutePath: `C:/AppData/assets/${args.command.userScope}/${args.command.localAssetId}/content.pdf`,
        }
        filesOnDisk.set(args.command.localAssetId, descriptor)
        return descriptor
      }

      if (cmd === 'resolve_local_asset') {
        // Assert exact Rust serde camelCase payload shape
        assert.ok(args.command)
        assert.equal(args.command.userScope, 'user-a')
        assert.equal(args.command.deviceId, 'device-1')
        assert.ok(args.command.localAssetId)
        assert.equal(args.command.expectedSize, 1024)
        assert.equal(args.command.expectedSha256, sampleSha)

        const found = filesOnDisk.get(args.command.localAssetId)
        if (!found) {
          // Native throws FILE_MISSING rather than returning null
          throw new Error('FILE_MISSING: The specified file could not be found')
        }
        return found
      }

      throw new Error(`Unexpected command: ${cmd}`)
    })

    try {
      const nativeAdapter = new TauriLocalAssetNativeAdapter()
      const service = new LocalAssetService(repository, { nativeAdapter })

      const handle = await service.importAsset({
        sourcePath: 'C:/docs/file.pdf',
        originalName: 'file.pdf',
        mimeType: 'application/pdf',
        expectedSize: 1024,
        expectedSha256: sampleSha,
      })

      // 1. Resolve existing asset -> succeeds
      const resolved = await service.resolveLocalAsset({ localAssetId: handle.localAssetId })
      assert.ok(resolved)
      assert.equal(resolved.localAssetId, handle.localAssetId)
      assert.equal(resolved.state, 'READY_LOCAL')
      assert.equal('relativePath' in resolved.descriptor, false)

      // 2. Resolve unknown asset (not in DB) -> returns null without calling native
      assert.equal(await service.resolveLocalAsset({ localAssetId: 'unknown-id' }), null)

      // 3. Delete file in mock disk to simulate missing on disk
      filesOnDisk.delete(handle.localAssetId)

      // Resolving missing file catches FILE_MISSING and transitions state to CORRUPT in repository
      const corruptHandle = await service.resolveLocalAsset({ localAssetId: handle.localAssetId })
      assert.ok(corruptHandle)
      assert.equal(corruptHandle.state, 'CORRUPT')
      assert.equal(corruptHandle.descriptor.absolutePath, '')

      const dbRecord = await repository.getAssetFile(handle.localAssetId)
      assert.equal(dbRecord?.state, 'CORRUPT')
    } finally {
      tauriMock.restore()
    }
  } finally {
    sqlite.close()
  }
})

test('delete unreferenced asset verifies void return and exact payload, blocked when references exist', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repository = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    const filesOnDisk = new Map()
    const deletedInvocations = []
    const tauriMock = setupTauriInvokeMock(async (cmd, args) => {
      if (cmd === 'import_local_asset') {
        const descriptor = {
          localAssetId: args.command.localAssetId,
          safeExtension: args.command.safeExtension,
          sizeBytes: args.command.expectedSize,
          sha256: args.command.expectedSha256,
          absolutePath: `C:/AppData/assets/${args.command.userScope}/${args.command.localAssetId}/content.pdf`,
        }
        filesOnDisk.set(args.command.localAssetId, descriptor)
        return descriptor
      }

      if (cmd === 'delete_local_asset') {
        // Assert exact Rust serde camelCase payload shape
        assert.ok(args.command)
        assert.equal(args.command.userScope, 'user-a')
        assert.equal(args.command.deviceId, 'device-1')
        assert.ok(args.command.localAssetId)
        deletedInvocations.push(args.command.localAssetId)
        filesOnDisk.delete(args.command.localAssetId)
        // Returns void!
        return undefined
      }

      throw new Error(`Unexpected command: ${cmd}`)
    })

    try {
      const nativeAdapter = new TauriLocalAssetNativeAdapter()
      const service = new LocalAssetService(repository, { nativeAdapter })

      const handle = await service.importAsset({
        sourcePath: 'C:/docs/delete-test.pdf',
        originalName: 'delete-test.pdf',
        mimeType: 'application/pdf',
        expectedSize: 1024,
        expectedSha256: sampleSha,
        sourceDraft: {
          subjectId: 'sub-1',
          title: 'Draft 1',
        },
      })

      // Active draft references this asset -> deletion refused
      await assert.rejects(
        () => service.deleteUnreferencedAsset(handle.localAssetId),
        /ASSET_HAS_ACTIVE_REFERENCES/
      )
      assert.equal(deletedInvocations.includes(handle.localAssetId), false)

      // Remove draft reference
      const drafts = await repository.listSourceDrafts({ localAssetId: handle.localAssetId })
      await repository.deleteSourceDraft(drafts[0].localSourceId)

      // Now deletion succeeds and native delete returns void
      const result = await service.deleteUnreferencedAsset(handle.localAssetId)
      assert.equal(result.deleted, true)
      assert.ok(deletedInvocations.includes(handle.localAssetId))

      // Record removed from repository
      assert.equal(await repository.getAssetFile(handle.localAssetId), null)
    } finally {
      tauriMock.restore()
    }
  } finally {
    sqlite.close()
  }
})

test('downloadRemoteAsset verifies exact Rust download payload and return descriptor', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repository = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    const tauriMock = setupTauriInvokeMock(async (cmd, args) => {
      if (cmd === 'download_local_asset') {
        assert.ok(args.command)
        assert.equal(args.command.userScope, 'user-a')
        assert.equal(args.command.deviceId, 'device-1')
        assert.equal(args.command.localAssetId, 'asset-dl-1')
        assert.equal(args.command.remoteUrl, 'https://cdn.example.com/asset.pdf')
        assert.equal(args.command.expectedSize, 2048)
        assert.equal(args.command.expectedSha256, sampleSha)
        assert.equal(args.command.safeExtension, 'pdf')

        return {
          localAssetId: 'asset-dl-1',
          safeExtension: 'pdf',
          sizeBytes: 2048,
          sha256: sampleSha,
          absolutePath: 'C:/AppData/assets/user-a/asset-dl-1/content.pdf',
        }
      }
      throw new Error(`Unexpected command: ${cmd}`)
    })

    try {
      const nativeAdapter = new TauriLocalAssetNativeAdapter()
      const service = new LocalAssetService(repository, { nativeAdapter })

      const handle = await service.downloadRemoteAsset(
        'asset-dl-1',
        'https://cdn.example.com/asset.pdf',
        2048,
        sampleSha,
        'my-doc.pdf',
        'application/pdf',
      )

      assert.equal(handle.localAssetId, 'asset-dl-1')
      assert.equal(handle.state, 'SYNCED')
      assert.equal('relativePath' in handle.descriptor, false)
      assert.equal(handle.descriptor.sizeBytes, 2048)

      const dbRecord = await repository.getAssetFile('asset-dl-1')
      assert.ok(dbRecord)
      assert.equal(dbRecord.state, 'SYNCED')
      assert.equal(dbRecord.relativePath, 'assets/user-a/asset-dl-1/content.pdf')
    } finally {
      tauriMock.restore()
    }
  } finally {
    sqlite.close()
  }
})

test('reconciliation sends exact scope payload and TS compares returned files with DB records', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repository = new LocalAssetRepository('user-a', 'device-1', { sql: sqlite })

    const filesOnDisk = new Map()
    const tauriMock = setupTauriInvokeMock(async (cmd, args) => {
      if (cmd === 'import_local_asset') {
        const descriptor = {
          localAssetId: args.command.localAssetId,
          safeExtension: args.command.safeExtension,
          sizeBytes: args.command.expectedSize,
          sha256: args.command.expectedSha256,
          absolutePath: `C:/AppData/assets/${args.command.userScope}/${args.command.localAssetId}/content.pdf`,
        }
        filesOnDisk.set(args.command.localAssetId, descriptor)
        return descriptor
      }

      if (cmd === 'reconcile_local_assets') {
        // Assert exact Rust payload: { command: { userScope, deviceId } }
        assert.ok(args.command)
        assert.equal(args.command.userScope, 'user-a')
        assert.equal(args.command.deviceId, 'device-1')
        assert.equal(args.command.knownAssets, undefined, 'Must not send knownAssets to Rust')

        // Return { removedStagingFiles, files: LocalAssetDescriptor[] }
        return {
          removedStagingFiles: 3,
          files: [
            // Only h1 is present, h2 is missing from disk, and orphan-1 is on disk but not in DB
            filesOnDisk.get('asset-h1'),
            {
              localAssetId: 'orphan-on-disk-1',
              safeExtension: 'pdf',
              sizeBytes: 512,
              sha256: sampleSha,
              absolutePath: 'C:/AppData/assets/user-a/orphan-on-disk-1/content.pdf',
            },
          ].filter(Boolean),
        }
      }

      throw new Error(`Unexpected command: ${cmd}`)
    })

    try {
      const nativeAdapter = new TauriLocalAssetNativeAdapter()
      const service = new LocalAssetService(repository, { nativeAdapter, idFactory: (() => {
        let i = 1
        return () => `asset-h${i++}`
      })() })

      const h1 = await service.importAsset({
        sourcePath: 'C:/1.pdf',
        originalName: '1.pdf',
        mimeType: 'application/pdf',
        expectedSize: 1024,
        expectedSha256: sampleSha,
      })
      const h2 = await service.importAsset({
        sourcePath: 'C:/2.pdf',
        originalName: '2.pdf',
        mimeType: 'application/pdf',
        expectedSize: 1024,
        expectedSha256: sampleSha,
      })

      // In mock, filesOnDisk has h1 and h2, but reconcile_local_assets returns files: [h1, orphan-on-disk-1]
      const report = await service.reconcileLocalAssets()

      // TS compares returned files with DB records
      assert.ok(report.verified.includes(h1.localAssetId), 'h1 present in returned files must be verified')
      assert.ok(report.markedCorrupt.includes(h2.localAssetId), 'h2 missing from returned files must be marked corrupt')
      assert.equal(report.removedStagingFiles, 3)
      assert.ok(report.orphansIdentified.some((o) => o.includes('orphan-on-disk-1')))

      // DB record for h2 is transitioned to CORRUPT in SQLite
      const rec2 = await repository.getAssetFile(h2.localAssetId)
      assert.equal(rec2?.state, 'CORRUPT')
    } finally {
      tauriMock.restore()
    }
  } finally {
    sqlite.close()
  }
})

test('readAssetFile resolves local and server Asset identities without exposing a managed path', async () => {
  const sqlite = new TemporarySqlite()
  try {
    await createVersionedLocalSchema(sqlite)
    const repository = new LocalAssetRepository('user-read', 'device-read', { sql: sqlite })
    const adapter = new TransientBrowserAssetAdapter()
    const service = new LocalAssetService(repository, { nativeAdapter: adapter })
    const source = new File(['local-first bytes'], 'lecture.pdf', { type: 'application/pdf' })

    const handle = await service.importAsset({
      file: source,
      originalName: source.name,
      mimeType: source.type,
    })
    const serverAssetId = 'server-read-asset-1'
    await repository.mapServerAssetId(handle.localAssetId, serverAssetId)

    const resolved = await service.readAssetFile({ serverAssetId })
    assert.ok(resolved)
    assert.equal(resolved.file.name, 'lecture.pdf')
    assert.equal(resolved.file.type, 'application/pdf')
    assert.equal(await resolved.file.text(), 'local-first bytes')
    assert.equal('absolutePath' in resolved, false)
    assert.equal('absolutePath' in resolved.file, false)
    assert.equal(await service.readAssetFile({ localAssetId: 'missing-local-asset' }), null)
  } finally {
    sqlite.close()
  }
})
