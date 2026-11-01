#!/usr/bin/env node
/**
 * Check every install-time fact that can be checked without booting the Harness.
 *
 * The one thing this cannot prove is runtime activation — that needs a restart —
 * so a passing run means "the bundle is installed correctly", not "the mode works".
 *
 * Usage:
 *   node scripts/verify-install.mjs [profileDir]
 *
 * @module dsh-expert/scripts/verify-install
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

const checkoutRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const profileDir = process.argv[2] ?? process.env.DSH_PROFILE_DIR
if (!profileDir) {
  console.error('usage: node scripts/verify-install.mjs <profileDir>   (or set DSH_PROFILE_DIR)')
  process.exit(2)
}

const JsTag = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (data) => data })
const schema = yaml.DEFAULT_SCHEMA.extend([JsTag])

let failures = 0
const check = (label, ok, detail = '') => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (detail ? ' — ' + detail : ''))
  if (!ok) failures += 1
}

const patches = {}
for (const file of ['cordis.patch.yml', 'presets/expert.patch.yml']) {
  try {
    patches[file] = yaml.load(readFileSync(path.join(checkoutRoot, file), 'utf8'), { schema })
    check('parses ' + file, Array.isArray(patches[file]))
  } catch (error) {
    check('parses ' + file, false, error.message)
  }
}

const hostRows = (patches['cordis.patch.yml'] ?? []).flatMap((operation) => operation.insert ?? [])
const presetRows = (patches['presets/expert.patch.yml'] ?? []).flatMap((operation) => operation.insert ?? [])
check('host row id is dsh-expert', hostRows.length === 1 && hostRows[0].id === 'dsh-expert', JSON.stringify(hostRows.map((row) => row.id)))
check('preset row id is preset-expert', presetRows.length === 1 && presetRows[0].id === 'preset-expert', JSON.stringify(presetRows.map((row) => row.id)))
check('preset declares id expert', presetRows[0]?.config?.id === 'expert', String(presetRows[0]?.config?.id))

const PACKAGE_NAME = 'dsh-expert'

// The specifiers our own rows name must resolve from the profile.
const requireFromProfile = createRequire(path.join(profileDir, 'package.json'))
for (const specifier of [PACKAGE_NAME, `${PACKAGE_NAME}/preset-persona`]) {
  try {
    check('resolves ' + specifier, Boolean(requireFromProfile.resolve(specifier)))
  } catch (error) {
    check('resolves ' + specifier, false, error.code ?? error.message)
  }
}

const flatten = (entries) => entries.flatMap((entry) => [entry, ...(Array.isArray(entry.config) ? flatten(entry.config) : [])])
const ids = flatten(presetRows[0]?.config?.plugins ?? []).map((entry) => entry.id)
check('preset row ids unique', new Set(ids).size === ids.length, ids.join(', '))

// No other installed bundle may already claim the row id or preset id.
const otherPatches = []
for (const dirent of readdirSync(path.join(profileDir, 'node_modules'), { withFileTypes: true })) {
  if (dirent.name === PACKAGE_NAME) continue
  const base = path.join(profileDir, 'node_modules', dirent.name)
  try {
    const manifest = JSON.parse(readFileSync(path.join(base, 'package.json'), 'utf8'))
    const declared = manifest?.dsh?.bundle?.patch
    for (const entry of Array.isArray(declared) ? declared : declared ? [declared] : []) {
      otherPatches.push(path.join(base, entry))
    }
  } catch {
    // Not a package root, or no bundle patch.
  }
}
const collisions = []
for (const patchPath of otherPatches) {
  if (!existsSync(patchPath)) continue
  let text = ''
  try {
    text = readFileSync(patchPath, 'utf8')
  } catch {
    continue
  }
  if (/id:\s*preset-expert\b/.test(text)) collisions.push(patchPath + ' → preset-expert')
  if (/^\s*id:\s*expert\s*$/m.test(text)) collisions.push(patchPath + ' → id: expert')
}
check('no other bundle claims preset-expert / id: expert', collisions.length === 0, collisions.join('; '))
console.log(`      (scanned ${otherPatches.length} patch files from other bundles)`)

const manifest = JSON.parse(readFileSync(path.join(profileDir, 'package.json'), 'utf8'))
check(`${PACKAGE_NAME} is a selected bundle`, manifest.dsh.profile.bundles.includes(PACKAGE_NAME))
check(`${PACKAGE_NAME} dependency is a link`, String(manifest.dependencies[PACKAGE_NAME] ?? '').startsWith('link:'))

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exitCode = failures === 0 ? 0 : 1
