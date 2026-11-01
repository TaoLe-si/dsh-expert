#!/usr/bin/env node
/**
 * Regenerate `test/fixtures/baseline-packages.json` from the installed Harness.
 *
 * The fixture records which `@deepseek-ai/dsh*` packages exist at the pinned
 * baseline, so a test can fail when this bundle mounts a package that the
 * baseline does not ship. When the harness baseline moves, bump
 * `BASELINE_HARNESS_VERSION`, re-run this script, and re-run the tests.
 *
 * Requires `scripts/asar-extract.mjs` and an installed DSH Desktop payload:
 *
 *   node scripts/generate-baseline-fixture.mjs
 *
 * @module dsh-expert/scripts/generate-baseline-fixture
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const extractor = path.join(here, 'asar-extract.mjs')
const repoRoot = path.join(here, '..')

const staging = mkdtempSync(path.join(tmpdir(), 'dsh-expert-baseline-'))

try {
  // Extract only the package manifests: the fixture needs names and versions.
  const packages = {}
  const names = execFileSync(process.execPath, [extractor, 'lsdir', 'node_modules/@deepseek-ai'], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim().replace(/\/$/, ''))
    .filter(Boolean)

  for (const name of names) {
    try {
      const manifest = execFileSync(
        process.execPath,
        [extractor, 'cat', `node_modules/@deepseek-ai/${name}/package.json`],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
      )
      const parsed = JSON.parse(manifest)
      packages[parsed.name] = parsed.version
    } catch {
      // A package without a readable manifest is not part of the baseline surface.
    }
  }

  const harnessPackages = Object.keys(packages).filter((name) => name.startsWith('@deepseek-ai/dsh')).sort()
  const harnessVersions = [...new Set(harnessPackages.map((name) => packages[name]))]
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

  const fixture = {
    _provenance:
      'Generated from the DSH Desktop harness (@deepseek-ai package set inside app.asar). Do not edit by hand; regenerate with scripts/generate-baseline-fixture.mjs when the baseline moves.',
    harnessVersion: harnessVersions.length === 1 ? harnessVersions[0] : harnessVersions,
    desktopVersion: manifest.dsh.baseline.desktop,
    packageCount: Object.keys(packages).length,
    harnessPackages,
    packages,
  }

  const target = path.join(repoRoot, 'test', 'fixtures', 'baseline-packages.json')
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(fixture, null, 2) + '\n')
  console.log(`wrote ${target}: ${harnessPackages.length} harness packages @ ${harnessVersions.join(', ')}`)
} finally {
  rmSync(staging, { recursive: true, force: true })
}
