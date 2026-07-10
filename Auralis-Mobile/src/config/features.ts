import { parseFeatureFlagValue } from './featureFlagParser'

const env = import.meta.env as Record<string, string | undefined>

export const tabletHandwritingNotesEnabled = parseFeatureFlagValue(
  env.VITE_TABLET_HANDWRITING_NOTES_ENABLED,
)
