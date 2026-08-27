import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const bundleFlag = args.indexOf('--bundle-dir')
const bundleDir = bundleFlag >= 0 ? args[bundleFlag + 1] : undefined
const sourceFlag = args.indexOf('--source-root')
const explicitSourceRoot = sourceFlag >= 0 ? args[sourceFlag + 1] : undefined

if (!bundleDir) {
  console.error('usage: node verify-ocr-bundle.mjs --bundle-dir <path> [--source-root <path>]')
  process.exit(2)
}

const walk = async (root) => {
  const result = []
  const visit = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) await visit(fullPath)
      else result.push(fullPath)
    }
  }
  await visit(root)
  return result
}

const fail = (message) => {
  throw new Error(`BUNDLE_VERIFY_FAILED: ${message}`)
}

const findSourceRoot = async (bundleRoot) => {
  if (explicitSourceRoot) return path.resolve(explicitSourceRoot)
  const candidates = [
    path.resolve(bundleRoot, '..', '..', '..', '..'),
    path.resolve(bundleRoot, '..', '..', '..'),
  ]
  for (const candidate of candidates) {
    try {
      if ((await stat(path.join(candidate, 'Cargo.toml'))).isFile()) return candidate
    } catch {
      // Continue through derived roots.
    }
  }
  fail('cannot derive src-tauri source root; pass --source-root explicitly')
}

const requireFile = async (file, label) => {
  try {
    if ((await stat(file)).isFile()) return file
  } catch {
    // Use a stable verifier error below.
  }
  fail(`${label} is missing: ${file}`)
}

const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex')

try {
  const root = path.resolve(bundleDir)
  try {
    if (!(await stat(root)).isDirectory()) fail(`bundle path is not a directory: ${root}`)
  } catch {
    fail(`bundle directory does not exist: ${root}`)
  }
  const files = await walk(root)
  const msi = files.filter((file) => file.toLowerCase().endsWith('.msi'))
  if (msi.length !== 1) fail(`expected exactly one MSI, found ${msi.length}`)

  const sourceRoot = await findSourceRoot(root)
  const ocrRoot = path.resolve(sourceRoot, '..', 'ocr-sidecar')
  const sidecarFiles = (await readdir(path.join(sourceRoot, 'binaries')))
    .filter((name) => /^auralis-ocr-[^/\\]+\.exe$/i.test(name))
    .map((name) => path.join(sourceRoot, 'binaries', name))
  if (sidecarFiles.length !== 1) fail(`expected exactly one target-triple sidecar in source bundle, found ${sidecarFiles.length}`)

  const manifestPath = await requireFile(path.join(ocrRoot, 'model_manifest.json'), 'model_manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const modelNames = ['det.onnx', 'rec.onnx', 'cls.onnx']
  if (!Array.isArray(manifest.models) || manifest.models.length !== modelNames.length) {
    fail('manifest must contain the three fixed model entries')
  }
  for (const model of manifest.models) {
    if (!modelNames.includes(model.name)) fail(`unexpected model ${model.name}`)
    const modelPath = await requireFile(path.join(ocrRoot, 'resources', model.name), model.name)
    const digest = await sha256(modelPath)
    if (digest !== model.sha256.toLowerCase()) fail(`${model.name} SHA-256 mismatch`)
  }

  if (!manifest.dictionary?.name || !manifest.dictionary?.sha256) fail('manifest dictionary is missing')
  const dictionaryPath = await requireFile(path.join(ocrRoot, 'resources', manifest.dictionary.name), manifest.dictionary.name)
  const dictionaryDigest = await sha256(dictionaryPath)
  if (dictionaryDigest !== manifest.dictionary.sha256.toLowerCase()) fail('dictionary SHA-256 mismatch')

  const noticesPath = await requireFile(path.join(sourceRoot, 'resources', 'licenses', 'THIRD-PARTY-NOTICES.txt'), 'third-party notices')
  const sbomPath = await requireFile(path.join(sourceRoot, 'resources', 'sbom', 'ocr-components.cdx.json'), 'OCR SBOM')

  const wixRoot = path.join(sourceRoot, 'target', 'release', 'wix')
  const wixFiles = (await walk(wixRoot)).filter((file) => path.basename(file).toLowerCase() === 'main.wxs')
  if (wixFiles.length !== 1) fail(`expected exactly one generated WiX main.wxs, found ${wixFiles.length}`)
  const wix = await readFile(wixFiles[0], 'utf8')
  const expectedWixReferences = [
    'Bin_auralis_ocr.exe',
    'ocr-sidecar',
    'model_manifest.json',
    ...modelNames,
    manifest.dictionary.name,
    'THIRD-PARTY-NOTICES.txt',
    'ocr-components.cdx.json',
  ]
  for (const reference of expectedWixReferences) {
    if (!wix.includes(reference)) fail(`generated WiX source does not reference ${reference}`)
  }

  const packageBytes = (await stat(msi[0])).size
  if (packageBytes <= 0) fail('MSI is empty')
  console.log(JSON.stringify({
    ok: true,
    msi: msi[0],
    msiBytes: packageBytes,
    sidecar: sidecarFiles[0],
    manifest: manifestPath,
    notices: noticesPath,
    sbom: sbomPath,
    wix: wixFiles[0],
    verifiedWixReferences: expectedWixReferences.length,
  }))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
