import assert from 'node:assert/strict'
import axios from 'axios'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

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

test('Profile connects real identity endpoints for avatar, nickname, and password change', async () => {
  const profileSource = await readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8')

  // Avatar: real endpoints, no localStorage for avatar data
  assert.match(profileSource, /useAuthApi\.getAvatarBlob\(\)/, 'Must fetch avatar blob from server')
  assert.match(profileSource, /useAuthApi\.uploadAvatar\(file\)/, 'Must upload avatar to server')
  assert.match(profileSource, /useAuthApi\.resetAvatar\(\)/, 'Must reset avatar on server')
  assert.doesNotMatch(profileSource, /localStorage\.(getItem|setItem)\(['"]auralis_user_avatar['"]/, 'Must not store avatar in localStorage')

  // Nickname: calls updateProfile and updates store
  assert.match(profileSource, /useAuthApi\.updateProfile\(\{/, 'Must call updateProfile')
  assert.match(profileSource, /baseVersion/, 'Must pass baseVersion to updateProfile')

  // Password: at least 12 chars and calls changePassword
  assert.match(profileSource, /newPassword\.length\s*<\s*12/, 'Must enforce at least 12 characters password')
  assert.match(profileSource, /useAuthApi\.changePassword\(\{/, 'Must call changePassword')
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

test('Profile connects real AI endpoints and decouples cache clear from offline reset', async () => {
  const profileSource = await readFile(new URL('../src/views/Profile/index.vue', import.meta.url), 'utf8')

  // AI discovery
  assert.match(profileSource, /listAiModels\(/, 'Must call listAiModels for model detection')
  assert.doesNotMatch(profileSource, /models\s*=\s*\['deepseek-chat',\s*'deepseek-reasoner'/, 'Must not use hardcoded model array')
  assert.match(profileSource, /testAiConnection\(/, 'Must call testAiConnection for connectivity test')
  assert.match(profileSource, /normalizeProvider\(/, 'Must normalize provider before calling API')
  assert.doesNotMatch(profileSource, /customEmbeddingModel|embeddingModel\s*:/, 'Profile must not ask users to configure or send an embedding model')
  assert.match(profileSource, /res\.chatModel/, 'Connection feedback must report the backend-tested chat model')
  assert.doesNotMatch(profileSource, /res\.modelCount/, 'Connection feedback must not depend on model-list discovery')
  assert.match(profileSource, /watch\(\s*\(\) => normalizeProvider\(customProvider\.value\)/, 'Changing providers must clear the prior chat model')
  assert.match(profileSource, /saved\.chatModel \|\| \(normalizeProvider\(saved\.provider\) === 'DEEPSEEK' \? 'deepseek-chat' : ''\)/, 'Loading settings must preserve saved model and avoid a DeepSeek fallback for other providers')
  assert.match(profileSource, /provider !== 'DEEPSEEK' && !customChatModel\.value\.trim\(\)/, 'Non-DeepSeek providers must require an explicit chat model')
  assert.match(profileSource, /canonical === 'SILICONFLOW'[\s\S]*?'https:\/\/api\.siliconflow\.cn\/v1'/, 'SiliconFlow must use its provider endpoint when Base URL is omitted')
  assert.match(profileSource, /provider === 'OPENAI_COMPATIBLE' && !customBaseUrl\.value\.trim\(\)/, 'Generic OpenAI-compatible providers must require an explicit Base URL')
  const saveHandler = profileSource.match(/const handleSaveAiSettings = async \(\) => \{([\s\S]*?)\n\}/)?.[1]
  const saveBeforeTest = profileSource.match(/const ensureAiSettingsSavedForTest = async \(\): Promise<boolean> => \{([\s\S]*?)\n\}/)?.[1]
  assert.match(saveHandler, /getAiSettingsValidationError\(canonical\)/, 'Saving must reject invalid provider configuration')
  assert.match(saveBeforeTest, /getAiSettingsValidationError\(canonical\)/, 'Testing must reject invalid input before reusing saved credentials or settings')
  const connectionHandler = profileSource.match(/const handleTestConnection = async \(\) => \{([\s\S]*?)\n\}/)?.[1]
  assert.ok(connectionHandler, 'Must define the connection test handler')
  assert.match(connectionHandler, /testAiConnection\(/, 'Connection test must call the backend chat test')
  assert.doesNotMatch(connectionHandler, /listAiModels\(/, 'Connection test must work independently of model discovery')

  // Data & State
  assert.match(profileSource, /tasks:\s*taskStore\.allTasks/, 'Must export both knowledge blocks and tasks')
  assert.match(profileSource, /handleClearCache/, 'Must retain light cache clearing')
  assert.match(profileSource, /handleResetOfflineData/, 'Must have dedicated dangerous offline reset handler')
  assert.match(profileSource, /@click="handleResetOfflineData"/, 'Dangerous reset button must bind to handleResetOfflineData')
  assert.match(profileSource, /syncStore\.resetOfflineData\(\)/, 'Offline reset handler must call syncStore.resetOfflineData()')
  assert.match(profileSource, /useAuthApi\.deleteAccount\(\{/, 'Must call deleteAccount on server')
  assert.match(profileSource, /syncStatusText/, 'Must bind dynamic sync status text')

  // AI dirty check & auto-save before connection test and detection
  assert.match(profileSource, /ensureAiSettingsSavedForTest/, 'Must ensure dirty AI settings are persisted before testing or detection')
  assert.match(profileSource, /handleTestConnection/, 'Must have handleTestConnection defined')
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

test('account deletion confirmation 401 does not trigger global auth recovery', async () => {
  const [requestSource, sessionSource] = await Promise.all([
    readFile(new URL('../src/api/request.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/auth/authSessionState.ts', import.meta.url), 'utf8'),
  ])
  const authSessionPolicy = await import('../src/auth/authSessionState.ts')
  const isDeletionConfirmationFailure = authSessionPolicy.isAccountDeletionConfirmationFailure

  assert.equal(typeof isDeletionConfirmationFailure, 'function', 'Must expose the deletion confirmation 401 policy')
  const wrongPasswordProblem = { code: 'UNAUTHENTICATED', detail: 'Invalid credentials' }
  const expiredTokenProblem = { code: 'UNAUTHENTICATED', detail: 'Authentication is required' }
  assert.equal(isDeletionConfirmationFailure('/api/auth/me', 'DELETE', wrongPasswordProblem), true, 'Must recognize wrong deletion-confirmation credentials')
  assert.equal(isDeletionConfirmationFailure('https://api.example/api/auth/me?retry=1', 'delete', wrongPasswordProblem), true, 'Must normalize absolute URLs, query strings, and method case')
  assert.equal(isDeletionConfirmationFailure('/api/auth/me', 'DELETE', expiredTokenProblem), false, 'Must allow normal recovery for an expired bearer token')
  assert.equal(isDeletionConfirmationFailure('/api/auth/me', 'PUT', wrongPasswordProblem), false, 'Must preserve normal recovery for other /me operations')
  assert.equal(isDeletionConfirmationFailure('/api/auth/sessions', 'DELETE', wrongPasswordProblem), false, 'Must preserve normal recovery for other DELETE operations')
  assert.match(sessionSource, /isAccountDeletionConfirmationFailure\s*\(/, 'Must centralize the route and Problem Details policy')
  assert.match(requestSource, /isAccountDeletionConfirmationFailure\(originalRequest\.url\s*\?\?\s*['"]['"],\s*originalRequest\.method,\s*error\.response\?\.data\)/, 'Must use the policy with the Axios 401 response')
  assert.equal((requestSource.match(/!isDeletionConfirmationFailure/g) ?? []).length, 2, 'Must gate both refresh/replay and redirect with the policy')
  assert.match(requestSource, /error\.response\?\.status\s*===\s*401/, 'Other protected 401 responses must still use normal auth recovery')
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

  // Profile/index.vue syncs hasAvatar on upload, reset, and profile update
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
  assert.match(
    profileSource,
    /useAuthApi\.updateProfile[\s\S]*?authStore\.user\.hasAvatar\s*=\s*updated\.hasAvatar/,
    'Profile must synchronize authStore.user.hasAvatar = updated.hasAvatar upon profile update',
  )
})
