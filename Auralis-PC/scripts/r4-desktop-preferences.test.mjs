import assert from 'node:assert/strict'
import test from 'node:test'

test('desktop preferences and locale reload the current namespace and persist subsequent selections', async (t) => {
  const values = new Map([
    ['auralis.settings.autoSync', 'false'],
    ['auralis.settings.autoOverview', 'false'],
    ['auralis.settings.language', 'English'],
  ])
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  })
  const preferences = await import('../src/services/desktopPreferences.ts?preferences-first')
  const language = await import('../src/i18n.ts?preferences-first')
  assert.equal(preferences.autoSyncEnabled.value, false)
  assert.equal(preferences.autoOverviewEnabled.value, false)
  assert.equal(language.locale.value, 'en')
  preferences.setAutoSyncEnabled(true)
  preferences.setAutoOverviewEnabled(true)
  language.setLocale('ja')
  assert.equal(values.get('auralis.settings.autoSync'), 'true')
  assert.equal(values.get('auralis.settings.autoOverview'), 'true')
  assert.equal(values.get('auralis.settings.language'), '日本語')
  const reopened = await import('../src/services/desktopPreferences.ts?preferences-reopened')
  const reopenedLanguage = await import('../src/i18n.ts?preferences-reopened')
  assert.equal(reopened.autoSyncEnabled.value, true)
  assert.equal(reopened.autoOverviewEnabled.value, true)
  assert.equal(reopenedLanguage.locale.value, 'ja')
})
