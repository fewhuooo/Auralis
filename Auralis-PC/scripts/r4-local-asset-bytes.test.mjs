import assert from 'node:assert/strict'
import { register } from 'node:module'
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

const {
  importLocalAssetBytes,
  MAX_LOCAL_ASSET_BYTES,
} = await import('../src/api/tauri.ts')
const {
  TauriLocalAssetNativeAdapter,
} = await import('../src/services/localAssetService.ts')

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

test('importLocalAssetBytes validates exact Rust command and serde camelCase payload with content number array', async () => {
  const tauriMock = setupTauriInvokeMock(async (cmd, args) => {
    assert.equal(cmd, 'import_local_asset_bytes')
    assert.ok(args.command)
    assert.equal(args.command.userScope, 'user-scope-1')
    assert.equal(args.command.deviceId, 'device-1')
    assert.equal(args.command.localAssetId, 'd3b07384-d113-4f4b-a2c3-4d64f0286812')
    assert.equal(args.command.safeExtension, 'pdf')
    assert.equal(args.command.expectedSize, 5)
    assert.equal(args.command.expectedSha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    assert.deepEqual(args.command.content, [104, 101, 108, 108, 111])
    return {
      localAssetId: args.command.localAssetId,
      safeExtension: 'pdf',
      sizeBytes: 5,
      sha256: args.command.expectedSha256,
      absolutePath: 'C:/assets/user-scope-1/d3b07384-d113-4f4b-a2c3-4d64f0286812/content.pdf',
    }
  })

  try {
    const result = await importLocalAssetBytes({
      userScope: 'user-scope-1',
      deviceId: 'device-1',
      localAssetId: 'd3b07384-d113-4f4b-a2c3-4d64f0286812',
      safeExtension: 'pdf',
      expectedSize: 5,
      expectedSha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      content: [104, 101, 108, 108, 111],
    })

    assert.equal(result.sizeBytes, 5)
    assert.equal(result.safeExtension, 'pdf')
    assert.equal(tauriMock.calls.length, 1)
  } finally {
    tauriMock.restore()
  }
})

test('importLocalAssetBytes enforces 50MB limit and validates invalid commands', async () => {
  await assert.rejects(
    async () => {
      await importLocalAssetBytes({
        userScope: 'user-1',
        deviceId: 'dev-1',
        localAssetId: 'id-1',
        safeExtension: 'bin',
        expectedSize: MAX_LOCAL_ASSET_BYTES + 1,
        expectedSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        content: [],
      })
    },
    /LOCAL_ASSET_COMMAND_INVALID/
  )

  await assert.rejects(
    async () => {
      await importLocalAssetBytes({
        userScope: '',
        deviceId: 'dev-1',
        localAssetId: 'id-1',
        safeExtension: 'bin',
        expectedSize: 10,
        expectedSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        content: [1],
      })
    },
    /LOCAL_ASSET_COMMAND_INVALID/
  )
})

test('TauriLocalAssetNativeAdapter.importAsset converts File to Uint8Array, computes SHA256, and invokes import_local_asset_bytes', async () => {
  const contentStr = 'Hello Auralis Native File Bytes'
  const encoder = new TextEncoder()
  const bytes = encoder.encode(contentStr)
  const file = new File([bytes], 'lecture.pdf', { type: 'application/pdf' })

  const tauriMock = setupTauriInvokeMock(async (cmd, args) => {
    assert.equal(cmd, 'import_local_asset_bytes')
    assert.equal(args.command.userScope, 'user-x')
    assert.equal(args.command.deviceId, 'dev-y')
    assert.equal(args.command.localAssetId, '7e452a81-22e6-42d4-8d49-43c2c77d5a57')
    assert.equal(args.command.safeExtension, 'pdf')
    assert.equal(args.command.expectedSize, bytes.length)
    assert.deepEqual(args.command.content, Array.from(bytes))
    // Verify SHA-256
    const expectedHash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
    assert.equal(args.command.expectedSha256, expectedHash)

    return {
      localAssetId: args.command.localAssetId,
      safeExtension: 'pdf',
      sizeBytes: bytes.length,
      sha256: expectedHash,
      absolutePath: `C:/AppData/assets/user-x/${args.command.localAssetId}/content.pdf`,
    }
  })

  try {
    const adapter = new TauriLocalAssetNativeAdapter()
    const descriptor = await adapter.importAsset({
      userId: 'user-x',
      serverDeviceId: 'dev-y',
      localAssetId: '7e452a81-22e6-42d4-8d49-43c2c77d5a57',
      file,
      originalName: file.name,
      mimeType: file.type,
    })

    assert.equal(descriptor.sizeBytes, bytes.length)
    assert.equal(descriptor.safeExtension, 'pdf')
    assert.equal(tauriMock.calls.length, 1)
  } finally {
    tauriMock.restore()
  }
})

test('TauriLocalAssetNativeAdapter rejects files over 50MB before IPC', async () => {
  const largeFile = {
    name: 'oversized.pdf',
    type: 'application/pdf',
    size: MAX_LOCAL_ASSET_BYTES + 1,
    arrayBuffer: async () => new ArrayBuffer(MAX_LOCAL_ASSET_BYTES + 1),
  }

  const adapter = new TauriLocalAssetNativeAdapter()
  await assert.rejects(
    async () => {
      await adapter.importAsset({
        userId: 'user-x',
        serverDeviceId: 'dev-y',
        localAssetId: '7e452a81-22e6-42d4-8d49-43c2c77d5a57',
        file: largeFile,
        originalName: largeFile.name,
        mimeType: largeFile.type,
      })
    },
    /LOCAL_ASSET_SIZE_LIMIT/
  )
})
