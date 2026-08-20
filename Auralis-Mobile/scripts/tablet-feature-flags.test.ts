import { parseFeatureFlagValue } from '../src/config/featureFlagParser.ts'

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

expectEqual(parseFeatureFlagValue(undefined), false, 'undefined flag defaults to disabled')
expectEqual(parseFeatureFlagValue(''), false, 'empty flag defaults to disabled')
expectEqual(parseFeatureFlagValue('false'), false, 'false string disables flag')
expectEqual(parseFeatureFlagValue('0'), false, '0 string disables flag')
expectEqual(parseFeatureFlagValue('true'), true, 'true string enables flag')
expectEqual(parseFeatureFlagValue('1'), true, '1 string enables flag')
expectEqual(parseFeatureFlagValue(true), true, 'boolean true enables flag')
