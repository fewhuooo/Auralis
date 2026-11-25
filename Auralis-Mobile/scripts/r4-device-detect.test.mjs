import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveDeviceType } from '../src/store/useDeviceStore.ts'

test('resolveDeviceType treats portrait pad devices as tablet', () => {
  assert.equal(resolveDeviceType({ deviceType: 'pad', windowWidth: 744, windowHeight: 1133 }), 'tablet')
  assert.equal(resolveDeviceType({ deviceType: 'Pad', windowWidth: 680, windowHeight: 1080 }), 'tablet')
})

test('resolveDeviceType treats landscape phone as phone and wide screens as tablet', () => {
  assert.equal(resolveDeviceType({ deviceType: 'phone', windowWidth: 844, windowHeight: 390 }), 'phone')
  assert.equal(resolveDeviceType({ windowWidth: 1180, windowHeight: 820 }), 'tablet')
})

test('resolveDeviceType falls back to phone for narrow split screen without pad deviceType', () => {
  assert.equal(resolveDeviceType({ windowWidth: 500, windowHeight: 820 }), 'phone')
})
