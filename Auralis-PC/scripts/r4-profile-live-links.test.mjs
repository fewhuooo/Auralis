import assert from 'node:assert/strict'
import axios from 'axios'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { t } from '../src/i18n.ts'
import { profileMessages } from '../src/views/Profile/profileMessages.ts'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { computed, ref, watch } from 'vue'

test('aiClient defines and exports normalizeProvider, listAiModels, and testAiConnection', async () => {
  const aiClientSource = await readFile(new URL('../src/api/aiClient.ts', import.meta.url), 'utf8')
  const schemaSource = await readFile(new URL('../src/api/generated/schema.ts', import.meta.url), 'utf8')
  const settingsSchema = schemaSource.slice(schemaSource.indexOf('AiSettingsCommand: {'), schemaSource.indexOf('AiSettingsView: {'))
  const connectionSchema = schemaSource.slice(schemaSource.indexOf('AiConnectionTestView: {'), schemaSource.indexOf('AiMessageCommand: {'))

  assert.match(aiClientSource, /export\s+function\s+normalizeProvider\(/, 'Must export normalizeProvider')
  assert.match(aiClientSource, /export\s+function\s+listAiModels\(/, 'Must export listAiModels')
  assert.match(aiClientSource, /export\s+function\s+testAiConnection\(/, 'Must export testAiConnection')
  assert.match(aiClientSource, /'DEEPSEEK'/, 'Must define DEEPSEEK canonical provider')
  assert.match(aiClientSource, /'SILICONFLOW'/, 'Must define SILICONFLOW canonical provider')
  assert.match(aiClientSource, /'OPENAI_COMPATIBLE'/, 'Must define OPENAI_COMPATIBLE canonical provider')
  assert.match(aiClientSource, /AiSettingsCommand\s*=\s*components\['schemas'\]\['AiSettingsCommand'\]/, 'AI settings request must use the generated contract')
  assert.doesNotMatch(settingsSchema, /embeddingModel/, 'AI settings contract must not include the user-managed embedding field')
  assert.match(connectionSchema, /chatModel\?:\s*string/, 'Connection test response must expose the tested chat model')
  assert.doesNotMatch(aiClientSource, /modelCount/, 'Connection test type must not depend on model discovery')
})

test('Profile connects real identity endpoints for avatar and password change', async () => {
  const [profileSource, passwordDialog] = await Promise.all([
    readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/profile/ChangePasswordDialog.vue', import.meta.url), 'utf8'),
  ])

  // Avatar: real endpoints, no localStorage for avatar data
  assert.match(profileSource, /useAuthApi\.getAvatarBlob\(\)/, 'Must fetch avatar blob from server')
  assert.match(profileSource, /useAuthApi\.uploadAvatar\(file\)/, 'Must upload avatar to server')
  assert.match(profileSource, /useAuthApi\.resetAvatar\(\)/, 'Must reset avatar on server')
  assert.doesNotMatch(profileSource, /localStorage\.(getItem|setItem)\(['"]auralis_user_avatar['"]/, 'Must not store avatar in localStorage')

  assert.match(profileSource, /const accountName = computed\(\(\) => authStore\.username/, 'Profile displays the login username')
  assert.doesNotMatch(profileSource, /useAuthApi\.updateProfile\(/, 'Profile has no display-name editing action')

  assert.match(passwordDialog, /validateNewPassword\(form\.newPassword\)/, 'The password dialog uses the shared password policy')
  assert.match(passwordDialog, /messages\.passwordRequirements/, 'The password dialog explains the composition requirements')
  assert.match(profileSource, /useAuthApi\.changePassword\(\{/, 'Must call changePassword')
})

test('new passwords require eight characters, uppercase, lowercase, and punctuation or symbols within 72 UTF-8 bytes', async () => {
  const { validateNewPassword } = await import('../src/utils/passwordPolicy.ts')

  assert.equal(validateNewPassword('Aa!bcdef'), null, 'An eight character password without digits is valid')
  assert.equal(validateNewPassword('Aa!\nbcde'), null, 'A newline may appear alongside the required character classes')
  assert.equal(validateNewPassword('Aa bcdef'), 'requirements', 'Whitespace does not count as a symbol')
  assert.equal(validateNewPassword('Aa汉字abcd'), 'requirements', 'Letters alone do not count as a symbol')
  assert.equal(validateNewPassword('abcdefgh!'), 'requirements', 'An uppercase letter is required')
  assert.equal(validateNewPassword('ABCDEFGH!'), 'requirements', 'A lowercase letter is required')
  assert.equal(validateNewPassword('Abcdefgh'), 'requirements', 'A punctuation or symbol character is required')
  assert.equal(validateNewPassword(`Aa!${'b'.repeat(70)}`), 'tooLong', 'Passwords over 72 UTF-8 bytes are rejected')
})

test('avatar blob request accepts PNG success and Problem Details errors', async () => {
  const [authApiSource, requestSource] = await Promise.all([
    readFile(new URL('../src/api/useAuthApi.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/api/request.ts', import.meta.url), 'utf8'),
  ])
  const avatarMethod = authApiSource.match(/getAvatarBlob\(\): Promise<Blob>\s*\{([\s\S]*?)\n\s*\},/)?.[1]
  const avatarAccept = avatarMethod?.match(/Accept:\s*['"]([^'"]+)['"]/)?.[1]
  const defaultAccept = requestSource.match(/headers:\s*\{\s*Accept:\s*['"]([^'"]+)['"]/)?.[1]

  assert.ok(avatarMethod, 'Must define getAvatarBlob')
  assert.match(avatarMethod, /responseType:\s*'blob'/, 'Avatar response must remain a Blob')
  assert.ok(defaultAccept, 'Shared request client must define its default Accept header')
  assert.ok(avatarAccept?.includes('image/png'), 'Avatar request must accept PNG success responses')
  assert.ok(avatarAccept?.includes('application/problem+json'), 'Avatar request must accept Problem Details errors')

  const client = axios.create({ headers: { Accept: defaultAccept } })
  let effectiveAccept = ''
  client.defaults.adapter = async (config) => {
    effectiveAccept = config.headers.get('Accept')
    return { data: new Blob(['png']), status: 200, statusText: 'OK', headers: {}, config }
  }
  await client.get('/api/auth/me/avatar', {
    responseType: 'blob',
    headers: { Accept: avatarAccept },
  })
  assert.equal(effectiveAccept, avatarAccept, 'Per-request Accept must override the shared JSON default')
})

test('Profile connects real AI endpoints and keeps device and reset actions in the account area', async () => {
  const profileSource = await readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8')

  // AI discovery
  assert.match(profileSource, /listAiModels\(/, 'Must call listAiModels for model detection')
  assert.doesNotMatch(profileSource, /models\s*=\s*\['deepseek-chat',\s*'deepseek-reasoner'/, 'Must not use hardcoded model array')
  assert.match(profileSource, /testAiConnection\(/, 'Must call testAiConnection for connectivity test')
  assert.match(profileSource, /normalizeProvider\(/, 'Must normalize provider before calling API')
  assert.doesNotMatch(profileSource, /customEmbeddingModel|embeddingModel\s*:/, 'Profile must not ask users to configure or send an embedding model')
  assert.match(profileSource, /res\.chatModel/, 'Connection feedback must report the backend-tested chat model')
  assert.doesNotMatch(profileSource, /res\.modelCount/, 'Connection feedback must not depend on model-list discovery')
  assert.match(profileSource, /provider !== 'DEEPSEEK' && !customChatModel\.value\.trim\(\)/, 'Non-DeepSeek providers must require an explicit chat model')
  assert.match(profileSource, /provider === 'OPENAI_COMPATIBLE' && !customBaseUrl\.value\.trim\(\)/, 'Generic OpenAI-compatible providers must require an explicit Base URL')
  const saveHandler = profileSource.match(/const handleSaveAiSettings = async \(\) => \{([\s\S]*?)\n\}/)?.[1]
  assert.match(saveHandler, /getAiSettingsValidationError\(canonical\)/, 'Saving must reject invalid provider configuration')
  const connectionHandler = profileSource.match(/const handleTestConnection = async \(\) => \{([\s\S]*?)\n\}/)?.[1]
  assert.ok(connectionHandler, 'Must define the connection test handler')
  assert.match(connectionHandler, /testAiConnection\(/, 'Connection test must call the backend chat test')
  assert.doesNotMatch(connectionHandler, /listAiModels\(/, 'Connection test must work independently of model discovery')

  const accountPanel = profileSource.match(/<aside class="studio-left">([\s\S]*?)<\/aside>/)?.[1]
  assert.ok(accountPanel, 'Must render the left account panel')
  assert.match(accountPanel, /@click="handleRevokeSession\(session\)"/, 'Account panel must allow revoking other devices')
  assert.match(accountPanel, /@click="handleResetOfflineData"/, 'Account panel must expose offline reset')
  assert.match(accountPanel, /@click="handleDeleteAccount"/, 'Account panel must expose account deletion')
  assert.doesNotMatch(profileSource, /handleExportData|handleClearCache|sc_setting_(?:diagnostic_log|auto_tag|auto_summary)/)
  assert.match(profileSource, /syncStore\.resetOfflineData\(\)/, 'Offline reset handler must call syncStore.resetOfflineData()')
  assert.match(profileSource, /useAuthApi\.deleteAccount\(\{/, 'Must call deleteAccount on server')
  assert.match(profileSource, /syncStatusText/, 'Must bind dynamic sync status text')
})

const deepseekSettings = { provider: 'DEEPSEEK', baseUrl: 'https://api.deepseek.com', chatModel: 'deepseek-chat', hasApiKey: true }
const compatibleSettings = { provider: 'OPENAI_COMPATIBLE', baseUrl: 'https://gateway.example/v1', chatModel: 'custom-model', hasApiKey: true }

async function mountAiSettingsForm({
  listAiModels,
  testAiConnection,
  getAiSettings = async () => [deepseekSettings, compatibleSettings],
  beforeSaveResponse,
} = {}) {
  const [profile, client] = await Promise.all([
    readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/api/aiClient.ts', import.meta.url), 'utf8'),
  ])
  const normalizeProvider = client.slice(client.indexOf('export function normalizeProvider'), client.indexOf('export function getAiSettings'))
  const form = profile.slice(profile.indexOf('// === BYOK AI Settings ==='), profile.indexOf('const syncStore = useSyncStore()'))
  const { outputText } = ts.transpileModule(`
    ${normalizeProvider.replace('export ', '')}
    ${form}
    ;({ customProvider, customBaseUrl, customChatModel, customApiKey, detectingModels, detectedModels,
        loadAiSettings, handleSaveAiSettings, handleTestConnection,
        handleDetectModels })
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  const updates = []
  const notifications = []
  const settings = runInNewContext(outputText, {
    computed, ref, watch, Error, t, profileMessages,
    getAiSettings,
    updateAiSettings: async (command) => {
      updates.push(command)
      await beforeSaveResponse?.()
      return { provider: command.provider, baseUrl: command.baseUrl, chatModel: command.chatModel, hasApiKey: true }
    },
    ElNotification: (notification) => notifications.push(notification),
    listAiModels,
    testAiConnection,
  })
  return { ...settings, updates, notifications, loading: settings.loadAiSettings() }
}

test('Profile loads the selected Provider settings and requires an explicit save before probing a draft', async () => {
  const connectionTests = []
  const modelRequests = []
  const form = await mountAiSettingsForm({
    testAiConnection: async (provider) => {
      connectionTests.push(provider)
      throw new Error('Simulated Provider rejection')
    },
    listAiModels: async (provider) => {
      modelRequests.push(provider)
      return { provider, models: ['available-model'] }
    },
  })
  await form.loading
  form.customApiKey.value = 'synthetic-deepseek-key'
  form.customProvider.value = compatibleSettings.provider
  assert.equal(form.customApiKey.value, '')
  assert.equal(form.customBaseUrl.value, compatibleSettings.baseUrl)
  assert.equal(form.customChatModel.value, compatibleSettings.chatModel)

  await form.handleTestConnection()
  assert.deepEqual(connectionTests, ['OPENAI_COMPATIBLE'])
  assert.equal(form.notifications.at(-1).message, 'Simulated Provider rejection')
  assert.equal(form.updates.length, 0)

  form.customBaseUrl.value = 'https://draft.example/v1'
  await form.handleTestConnection()
  await form.handleDetectModels()
  assert.deepEqual(connectionTests, ['OPENAI_COMPATIBLE'])
  assert.equal(modelRequests.length, 0)
  assert.equal(form.updates.length, 0)
  assert.equal(form.notifications.at(-1).title, '请先保存 AI 配置')

  form.customApiKey.value = 'synthetic-draft-endpoint-key'
  form.customProvider.value = 'DeepSeek'
  form.customProvider.value = compatibleSettings.provider
  assert.equal(form.customBaseUrl.value, compatibleSettings.baseUrl)
  assert.equal(form.customApiKey.value, '')

  form.customApiKey.value = 'synthetic-compatible-key'
  form.customProvider.value = 'SiliconFlow'
  assert.equal(form.customApiKey.value, '')
  assert.equal(form.customBaseUrl.value, '')
  assert.equal(form.customChatModel.value, '')

  form.customChatModel.value = 'siliconflow-model'
  form.customApiKey.value = 'synthetic-siliconflow-key'
  await form.handleSaveAiSettings()
  assert.equal(form.updates.length, 1)
  assert.equal(form.updates[0].provider, 'SILICONFLOW')
  assert.equal(form.updates[0].baseUrl, 'https://api.siliconflow.cn/v1')
  assert.equal(form.updates[0].apiKey, 'synthetic-siliconflow-key')
  assert.equal(form.customApiKey.value, '')

  form.customChatModel.value = 'another-model'
  await form.handleTestConnection()
  await form.handleDetectModels()
  assert.deepEqual(connectionTests, ['OPENAI_COMPATIBLE'])
  assert.deepEqual(modelRequests, ['SILICONFLOW'])
  assert.equal(form.updates.length, 1)
})

test('Profile discards late model candidates after switching Providers or changing the endpoint', async () => {
  const requests = []
  const form = await mountAiSettingsForm({
    listAiModels: (provider) => new Promise((resolve) => {
      requests.push({ provider, respond: (model) => resolve({ provider, models: [model] }) })
    }),
  })
  await form.loading
  const previous = form.handleDetectModels()
  assert.equal(requests[0].provider, 'DEEPSEEK')
  form.customProvider.value = compatibleSettings.provider
  form.customChatModel.value = ''
  const current = form.handleDetectModels()
  assert.equal(requests[1].provider, 'OPENAI_COMPATIBLE')

  requests[0].respond('previous-provider-model')
  await previous
  assert.equal(form.detectingModels.value, true)
  assert.equal(form.detectedModels.value.length, 0)
  assert.equal(form.customChatModel.value, '')

  requests[1].respond('current-provider-model')
  await current
  assert.deepEqual([...form.detectedModels.value], ['current-provider-model'])
  assert.equal(form.customChatModel.value, 'current-provider-model')

  const previousEndpoint = form.handleDetectModels()
  form.customBaseUrl.value = 'https://other-gateway.example/v1'
  assert.equal(form.detectedModels.value.length, 0)
  form.customBaseUrl.value = compatibleSettings.baseUrl
  requests[2].respond('expired-endpoint-model')
  await previousEndpoint
  assert.equal(form.detectedModels.value.length, 0)
  assert.equal(form.customChatModel.value, 'current-provider-model')
  assert.equal(form.updates.length, 0)
})

test('Profile preserves a draft entered during the initial AI settings read', async () => {
  const initialSettings = Promise.withResolvers()
  const form = await mountAiSettingsForm({ getAiSettings: () => initialSettings.promise })
  form.customBaseUrl.value = 'https://api.deepseek.com/v1'
  form.customChatModel.value = 'deepseek-reasoner'
  form.customApiKey.value = 'synthetic-initial-draft-key'
  await form.handleSaveAiSettings()
  assert.equal(form.updates.length, 0)

  initialSettings.resolve([])
  await form.loading
  assert.equal(form.customBaseUrl.value, 'https://api.deepseek.com/v1')
  assert.equal(form.customChatModel.value, 'deepseek-reasoner')
  assert.equal(form.customApiKey.value, 'synthetic-initial-draft-key')
  await form.handleSaveAiSettings()
  assert.equal(form.updates.length, 1)
  assert.equal(form.updates[0].apiKey, 'synthetic-initial-draft-key')
})

test('Profile clears the saved Key and preserves a different Key entered during saving', async () => {
  const saveResponses = []
  const form = await mountAiSettingsForm({
    beforeSaveResponse: () => new Promise((resolve) => saveResponses.push(resolve)),
  })
  await form.loading
  form.customApiKey.value = 'synthetic-submitted-key'
  const firstSave = form.handleSaveAiSettings()
  form.customBaseUrl.value = 'https://api.deepseek.com/v1'
  form.customBaseUrl.value = deepseekSettings.baseUrl
  saveResponses[0]()
  await firstSave
  assert.equal(form.customApiKey.value, '')

  form.customApiKey.value = 'synthetic-next-submitted-key'
  const secondSave = form.handleSaveAiSettings()
  form.customApiKey.value = 'synthetic-new-key'
  saveResponses[1]()
  await secondSave
  assert.equal(form.customApiKey.value, 'synthetic-new-key')
})

test('LocalRepository and useSyncStore provide persistent offline reset pipeline', async () => {
  const [repoSource, storeSource] = await Promise.all([
    readFile(new URL('../src/services/localRepository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/store/useSyncStore.ts', import.meta.url), 'utf8'),
  ])

  assert.match(repoSource, /async\s+resetOfflineStorage\(\)/, 'LocalRepository must define resetOfflineStorage')
  assert.match(repoSource, /DELETE\s+FROM\s+local_mutations/, 'Must purge local_mutations table')
  assert.match(repoSource, /DELETE\s+FROM\s+local_resource_records/, 'Must purge local_resource_records table')
  assert.match(repoSource, /reset_required\s*=\s*1/, 'Must set reset_required = 1 in sync_metadata')
  assert.match(repoSource, /cursor\s*=\s*NULL/, 'Must reset cursor to NULL in sync_metadata')

  assert.match(storeSource, /(async\s+function\s+resetOfflineData|resetOfflineData\s*[:=]\s*async)/, 'useSyncStore must expose resetOfflineData action')
  assert.match(storeSource, /resetOfflineStorage\(\)/, 'useSyncStore.resetOfflineData must call repository.resetOfflineStorage()')
})

test('password confirmation 401 does not trigger global auth recovery', async () => {
  const [requestSource, sessionSource] = await Promise.all([
    readFile(new URL('../src/api/request.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/auth/authSessionState.ts', import.meta.url), 'utf8'),
  ])
  const authSessionPolicy = await import('../src/auth/authSessionState.ts')
  const isConfirmationFailure = authSessionPolicy.isPasswordConfirmationFailure

  const wrongPasswordProblem = { code: 'UNAUTHENTICATED', detail: 'Invalid credentials' }
  const expiredTokenProblem = { code: 'UNAUTHENTICATED', detail: 'Authentication is required' }
  assert.equal(isConfirmationFailure('/api/auth/me', 'DELETE', wrongPasswordProblem), true, 'Must recognize wrong deletion-confirmation credentials')
  assert.equal(isConfirmationFailure('https://api.example/api/auth/me?retry=1', 'delete', wrongPasswordProblem), true, 'Must normalize absolute URLs, query strings, and method case')
  assert.equal(isConfirmationFailure('/api/auth/me', 'DELETE', expiredTokenProblem), false, 'Must allow normal recovery for an expired bearer token')
  assert.equal(isConfirmationFailure('/api/auth/me', 'PUT', wrongPasswordProblem), false, 'Must preserve normal recovery for other /me operations')
  assert.equal(isConfirmationFailure('/api/auth/sessions', 'DELETE', wrongPasswordProblem), false, 'Must preserve normal recovery for other DELETE operations')
  assert.match(sessionSource, /isPasswordConfirmationFailure\s*\(/, 'Must centralize the route and Problem Details policy')
  assert.match(requestSource, /isPasswordConfirmationFailure\(originalRequest\.url\s*\?\?\s*['"]['"],\s*originalRequest\.method,\s*error\.response\?\.data\)/, 'Must use the policy with the Axios 401 response')
  assert.match(requestSource, /if \(error\.response\?\.status\s*===\s*401\s*&&\s*originalRequest\s*&&\s*session\s*&&\s*!isConfirmationFailure/, 'Must gate the shared 401 recovery path with the policy')
})

test('avatar offline caching integrates IndexedDB with auth store and Profile', async () => {
  const [profileSource, storeSource, cacheSource, headerSource] = await Promise.all([
    readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/store/useAuthStore.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/avatarCache.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/AppHeader.vue', import.meta.url), 'utf8'),
  ])

  // Profile delegates to store and does not overwrite avatarUrl on failure
  assert.match(profileSource, /computed\(\(\)\s*=>\s*authStore\.avatarUrl\)/, 'Profile must compute userAvatarUrl directly from authStore')
  assert.match(profileSource, /await\s+authStore\.loadAvatar\(\)/, 'Profile must delegate loadAvatar to authStore.loadAvatar()')
  assert.doesNotMatch(profileSource, /catch\s*\{[\s\S]*?authStore\.setAvatarUrl\(['"]['"]\)/, 'Profile must not wipe authStore avatarUrl on network failure')

  // Auth store loads local cache first and syncs in background
  assert.match(storeSource, /import\s*\{[^}]*getAvatarCache[^}]*\}\s*from\s*['"]@\/services\/avatarCache['"]/, 'Store must import avatarCache service')
  assert.match(storeSource, /await\s+getAvatarCache\(requestedUserId\)/, 'Store must read avatar from IndexedDB cache')
  assert.match(storeSource, /await\s+saveAvatarCache\(requestedUserId,\s*blob\)/, 'Store must save fetched blob to IndexedDB cache')
  assert.match(storeSource, /await\s+deleteAvatarCache\(requestedUserId\)/, 'Store must delete cache on 404 response')
  assert.match(storeSource, /afterHydrate[\s\S]*?loadAvatar/, 'Hydration must trigger avatar loading')

  // Header refreshes avatar when authenticated
  assert.match(headerSource, /if\s*\(authStore\.isAuthenticated\)\s*\{\s*void\s+authStore\.loadAvatar\(\)/, 'AppHeader must trigger loadAvatar when authenticated')

  // avatarCache guards
  assert.match(cacheSource, /blob\.size\s*>\s*0/, 'Cache must verify non-empty blob')
})

test('hasAvatar contract skips avatar fetch when false, queries when true, and synchronizes state', async () => {
  const [storeSource, profileSource, schemaSource] = await Promise.all([
    readFile(new URL('../src/store/useAuthStore.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/api/generated/schema.ts', import.meta.url), 'utf8'),
  ])

  // Schema verification: hasAvatar is required boolean in UserView
  const userViewSchema = schemaSource.slice(schemaSource.indexOf('UserView: {'), schemaSource.indexOf('AiSettingsCommand: {'))
  assert.match(userViewSchema, /hasAvatar:\s*boolean;/, 'UserView schema must define required boolean hasAvatar')

  // Auth store loadAvatar behavior: skips getAvatarBlob when hasAvatar is false
  assert.match(
    storeSource,
    /user\.value\s*&&\s*user\.value\.hasAvatar\s*===\s*false[\s\S]*?invalidateAvatarRequest\(\)[\s\S]*?clearAvatarDisplay\(\)[\s\S]*?await\s+deleteAvatarCache\(requestedUserId\)[\s\S]*?return\s*['"]['"]/,
    'loadAvatar must skip getAvatarBlob, clear display and delete cache when hasAvatar === false',
  )

  // Auth store loadAvatar behavior: only GETs avatar when hasAvatar === true
  assert.match(
    storeSource,
    /user\.value\?\.hasAvatar\s*===\s*true[\s\S]*?useAuthApi\.getAvatarBlob\(\)/,
    'loadAvatar must only call getAvatarBlob when hasAvatar === true',
  )

  // Auth store 404 error handling sets hasAvatar to false and clears display/cache
  assert.match(
    storeSource,
    /status\s*===\s*404[\s\S]*?hasAvatar\s*=\s*false[\s\S]*?clearAvatarDisplay\(\)[\s\S]*?await\s+deleteAvatarCache\(requestedUserId\)/,
    '404 on getAvatarBlob must set hasAvatar = false and clear avatar display and cache',
  )

  // setAvatarFromBlob and clearAvatar maintain hasAvatar
  assert.match(
    storeSource,
    /async\s+function\s+setAvatarFromBlob[\s\S]*?user\.value\.hasAvatar\s*=\s*true/,
    'setAvatarFromBlob must set hasAvatar = true for the matched user',
  )
  assert.match(
    storeSource,
    /async\s+function\s+clearAvatar[\s\S]*?user\.value\.hasAvatar\s*=\s*false/,
    'clearAvatar must set hasAvatar = false for the matched user',
  )

  // fetchMe handles hasAvatar transitions
  assert.match(
    storeSource,
    /me\.hasAvatar\s*===\s*false[\s\S]*?clearAvatarDisplay\(\)[\s\S]*?deleteAvatarCache\(me\.id\)[\s\S]*?me\.hasAvatar\s*===\s*true[\s\S]*?loadAvatar\(\)/,
    'fetchMe must clear avatar when me.hasAvatar is false and trigger loadAvatar when true',
  )

  // Profile/index.vue syncs hasAvatar on upload and reset
  assert.match(
    profileSource,
    /useAuthApi\.uploadAvatar\(file\)[\s\S]*?authStore\.user\.hasAvatar\s*=\s*true/,
    'Profile must set authStore.user.hasAvatar = true upon avatar upload',
  )
  assert.match(
    profileSource,
    /useAuthApi\.resetAvatar\(\)[\s\S]*?authStore\.user\.hasAvatar\s*=\s*false/,
    'Profile must set authStore.user.hasAvatar = false upon avatar reset',
  )
})
