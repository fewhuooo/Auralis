import assert from 'node:assert/strict'
import test from 'node:test'

import { createNativeUploadBridge, decodeBase64ToArrayBuffer } from '../src/services/nativeUploadBridge.ts'

test('decodeBase64ToArrayBuffer decodes raw and data-URL base64 payloads cleanly', () => {
  const raw = Buffer.from('Auralis PDF Payload').toString('base64')
  const fromRaw = decodeBase64ToArrayBuffer(raw)
  assert.equal(Buffer.from(fromRaw).toString('utf8'), 'Auralis PDF Payload')

  const fromDataUrl = decodeBase64ToArrayBuffer(`data:application/pdf;base64,${raw}`)
  assert.equal(Buffer.from(fromDataUrl).toString('utf8'), 'Auralis PDF Payload')

  assert.equal(decodeBase64ToArrayBuffer('').byteLength, 0)
})

test('createNativeUploadBridge handles pick, cancel, error, and host unmount cleanup', async () => {
  const bridge = createNativeUploadBridge()
  assert.equal(bridge.hasHost(), false)
  await assert.rejects(() => bridge.requestPick('.pdf'), /未就绪/)

  const dispatchedPicks = []
  const reg = bridge.registerHost({
    dispatchPick(requestId, accept) {
      dispatchedPicks.push({ requestId, accept })
    },
    dispatchUpload() {},
    dispatchRelease() {},
  })
  assert.equal(bridge.hasHost(), true)

  const pickPromise = bridge.requestPick('.pdf,.docx')
  assert.equal(dispatchedPicks.length, 1)
  reg.onPickResult({
    requestId: dispatchedPicks[0].requestId,
    cancelled: false,
    file: { bridgeFileId: 'nb_1', name: 'notes.pdf', size: 2048, type: 'application/pdf' },
  })
  const picked = await pickPromise
  assert.deepEqual(picked, { bridgeFileId: 'nb_1', name: 'notes.pdf', size: 2048, type: 'application/pdf' })

  const cancelPromise = bridge.requestPick('.pdf')
  reg.onPickResult({ requestId: dispatchedPicks[1].requestId, cancelled: true })
  assert.equal(await cancelPromise, null)

  const errPromise = bridge.requestPick('.pdf')
  reg.onPickResult({ requestId: dispatchedPicks[2].requestId, cancelled: false, error: '选择器失败' })
  await assert.rejects(() => errPromise, /选择器失败/)

  const unmountedPick = bridge.requestPick('.pdf')
  reg.dispose()
  assert.equal(bridge.hasHost(), false)
  assert.equal(await unmountedPick, null)
})

test('createNativeUploadBridge forwards upload progress, result, release, and rejects on dispose', async () => {
  const bridge = createNativeUploadBridge()
  const uploaded = []
  const released = []
  const reg = bridge.registerHost({
    dispatchPick() {},
    dispatchUpload(jobId, bridgeFileId, url, headers) {
      uploaded.push({ jobId, bridgeFileId, url, headers })
    },
    dispatchRelease(bridgeFileId) {
      released.push(bridgeFileId)
    },
  })

  const progressEvents = []
  const putPromise = bridge.requestPut({
    bridgeFileId: 'nb_7',
    url: 'https://storage.example.com/upload',
    headers: { 'Content-Type': 'application/pdf' },
    onProgress: (percent, stage) => progressEvents.push({ percent, stage }),
  })
  assert.equal(uploaded.length, 1)
  reg.onUploadProgress({ jobId: uploaded[0].jobId, loaded: 50, total: 100 })
  reg.onUploadResult({ jobId: uploaded[0].jobId, ok: true })
  await putPromise

  assert.deepEqual(progressEvents, [{ percent: 53, stage: '正在上传文件...' }])

  bridge.releaseFile('nb_7')
  assert.deepEqual(released, ['nb_7'])

  const failedPut = bridge.requestPut({
    bridgeFileId: 'nb_8',
    url: 'https://storage.example.com/upload',
    headers: {},
  })
  reg.dispose()
  await assert.rejects(() => failedPut, /已卸载/)
})
