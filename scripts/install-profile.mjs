#!/usr/bin/env node
/**
 * Register this bundle in a dsh profile without `plugin_manager`.
 *
 * `plugin_manager install_bundle` is the supported path and performs the same two
 * state changes this script makes for a local directory checkout:
 *   - a `link:` dependency entry, so a later pnpm install recreates the link
 *   - a bundle selection, so both files of `dsh.bundle.patch` apply
 *
 * The `node_modules` link itself is created separately — a junction on Windows:
 *
 *   cd "$DSH_PROFILE_DIR"
 *   cmd //c "mklink /J node_modules\dsh-expert C:\path\to\dsh-expert"
 *
 * Usage:
 *   node scripts/install-profile.mjs <profileDir> [--remove]
 *
 * @module dsh-expert/scripts/install-profile
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PACKAGE_NAME = 'dsh-expert'

const [profileDir, flag] = process.argv.slice(2)
if (!profileDir) {
  console.error('usage: node scripts/install-profile.mjs <profileDir> [--remove]')
  process.exit(2)
}

const removing = flag === '--remove'
const manifestPath = path.join(profileDir, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

// The checkout this script belongs to, so the link survives a different clone path.
const checkoutRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const linkSpec = 'link:' + checkoutRoot.replace(/\\/g, '/')

manifest.dependencies ??= {}
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []

if (removing) {
  delete manifest.dependencies[PACKAGE_NAME]
  manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((bundle) => bundle !== PACKAGE_NAME)
} else {
  manifest.dependencies[PACKAGE_NAME] = linkSpec
  if (!manifest.dsh.profile.bundles.includes(PACKAGE_NAME)) manifest.dsh.profile.bundles.push(PACKAGE_NAME)
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`${removing ? 'removed' : 'registered'} ${PACKAGE_NAME} in ${manifestPath}`)
console.log('bundles: ' + manifest.dsh.profile.bundles.join(', '))
