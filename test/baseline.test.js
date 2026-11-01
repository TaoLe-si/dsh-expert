import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { flattenEntries, insertedRows, loadPatch } from './helpers/yaml.js'

const baseline = JSON.parse(readFileSync(new URL('./fixtures/baseline-packages.json', import.meta.url), 'utf8'))
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

/** Every plugin row our bundle mounts, host row included. */
function mountedRows() {
  const preset = loadPatch(readFileSync(new URL('../presets/expert.patch.yml', import.meta.url), 'utf8'))
  const host = loadPatch(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
  return [...insertedRows(host), ...flattenEntries(insertedRows(preset)[0].config.plugins)]
}

test('the pinned baseline matches the recorded harness package set', () => {
  assert.equal(baseline.harnessVersion, manifest.dsh.baseline.harness)
  assert.equal(baseline.desktopVersion, manifest.dsh.baseline.desktop)
  assert.ok(baseline.harnessPackages.length > 250)
})

test('every Harness package this bundle mounts exists at the pinned baseline', () => {
  const known = new Set(baseline.harnessPackages)
  const missing = mountedRows()
    .map((row) => row.name)
    .filter((name) => name.startsWith('@deepseek-ai/'))
    // Subpath plugins share their package root.
    .map((name) => name.split('/').slice(0, 2).join('/'))
    .filter((name) => !known.has(name))
  assert.deepEqual(missing, [], `not present at harness ${baseline.harnessVersion}: ${missing.join(', ')}`)
})

/** Loader builtins that are not packages and never appear in a package set. */
const LOADER_BUILTINS = new Set(['cordis:group', 'cordis:include'])

test('every plugin row resolves to a Loader builtin, a baseline package, or one of our own exported subpaths', () => {
  const known = new Set(baseline.harnessPackages)
  const exported = new Set(
    Object.keys(manifest.exports)
      .filter((key) => !key.startsWith('./locale') && key !== './icon' && key !== './package.json' && !key.endsWith('.yml'))
      .map((key) => (key === '.' ? manifest.name : `${manifest.name}/${key.replace(/^\.\//, '')}`)),
  )
  for (const row of mountedRows()) {
    if (LOADER_BUILTINS.has(row.name)) continue
    const owner = row.name.startsWith('@deepseek-ai/') ? row.name.split('/').slice(0, 2).join('/') : row.name
    const ok = known.has(owner) || exported.has(row.name)
    assert.ok(ok, `row "${row.id}" names ${row.name}, which neither the baseline nor this bundle provides`)
  }
})

test('pins the baseline in the three places a reviewer will look', () => {
  assert.equal(manifest.dsh.baseline.harness, '0.2.1-rc.4')
  const hostPatch = loadPatch(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
  assert.equal(insertedRows(hostPatch)[0].config.minimumHarnessVersion, manifest.dsh.baseline.harness)
})
