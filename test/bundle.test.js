import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { test } from 'node:test'

import { insertedRows, loadPatch } from './helpers/yaml.js'

const manifestUrl = new URL('../package.json', import.meta.url)
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'))
const packageRoot = new URL('../', import.meta.url)
const resolveFromRoot = (relative) => new URL(relative.replace(/^\.\//, ''), packageRoot)

test('declares every bundle patch the Harness will load', () => {
  const patches = manifest.dsh.bundle.patch
  assert.ok(Array.isArray(patches))
  assert.deepEqual(patches, ['./cordis.patch.yml', './presets/expert.patch.yml'])
  for (const patch of patches) assert.ok(existsSync(resolveFromRoot(patch)), patch)
})

test('declares the baseline it was built against', () => {
  const baseline = manifest.dsh.baseline
  assert.equal(baseline.harness, '0.2.1-rc.4')
  assert.deepEqual(baseline.models, ['deepseek'])
  assert.match(baseline.node, /22\.19\.0/)
})

test('ships a host row that gates the harness version', () => {
  const patch = loadPatch(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
  const rows = insertedRows(patch)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'dsh-expert')
  assert.equal(rows[0].name, manifest.name)
  assert.equal(rows[0].config.minimumHarnessVersion, '0.2.1-rc.4')
})

test('every runtime path in the manifest exists', () => {
  const runtimePaths = [
    manifest.main,
    manifest.exports['.'].replace(/^\.\//, ''),
    'lib/persona.js',
    'cordis.patch.yml',
    'presets/expert.patch.yml',
    'locale/zh.json',
    'locale/en.json',
    'icon.svg',
  ]
  for (const relative of runtimePaths) assert.ok(existsSync(resolveFromRoot(relative)), relative)
})

test('exports the preset persona plugin under the name the preset uses', () => {
  const subpath = manifest.exports['./preset-persona']
  assert.equal(subpath, './lib/persona.js')
  // The preset row refers to the package by name plus this subpath.
  const preset = loadPatch(readFileSync(new URL('../presets/expert.patch.yml', import.meta.url), 'utf8'))
  const rows = insertedRows(preset)
  const persona = rows[0].config.plugins.find((entry) => entry.id === 'persona')
  assert.equal(persona.name, `${manifest.name}/preset-persona`)
})

test('ships localized display metadata for the plugin inventory', () => {
  for (const locale of ['zh', 'en']) {
    const text = readFileSync(resolveFromRoot(`locale/${locale}.json`), 'utf8')
    const parsed = JSON.parse(text)
    assert.equal(typeof parsed.meta.title, 'string', locale)
    assert.ok(parsed.meta.title.length > 0, locale)
    assert.equal(typeof parsed.meta.description, 'string', locale)
    assert.ok(parsed.meta.description.includes('DeepSeek'), locale)
  }
})

test('ships an original icon inside the size limit', () => {
  const iconPath = resolveFromRoot('icon.svg')
  const text = readFileSync(iconPath, 'utf8')
  assert.ok(text.trimStart().startsWith('<svg'), 'icon must be an SVG document')
  assert.ok(statSync(iconPath).size <= 256 * 1024, 'icon must stay under 256 KiB')
  assert.equal(/https?:\/\//.test(text.replace(/xmlns="[^"]*"/g, '')), false, 'no external references')
})

test('lists every shipped file in the packed file list', () => {
  const files = new Set(manifest.files)
  for (const required of ['lib', 'presets', 'locale', 'cordis.patch.yml', 'icon.svg', 'README.md', 'CHANGELOG.md']) {
    assert.ok(files.has(required), required)
  }
})

test('points at the project repository', () => {
  assert.match(manifest.repository.url, /github\.com\/TaoLe-si\/dsh-expert/)
})

test('keeps the baseline version in one place in code', () => {
  const versionSource = readFileSync(resolveFromRoot('lib/version.js'), 'utf8')
  const declared = /export const BASELINE_HARNESS_VERSION = '([^']+)'/.exec(versionSource)
  assert.ok(declared)
  assert.equal(declared[1], manifest.dsh.baseline.harness)
})
