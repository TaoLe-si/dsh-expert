import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BASELINE_HARNESS_VERSION,
  checkBaseline,
  compareVersions,
  parseVersion,
} from '../lib/version.js'

test('parses a release and a prerelease', () => {
  assert.deepEqual(parseVersion('0.2.1'), { major: 0, minor: 2, patch: 1, prerelease: [] })
  assert.deepEqual(parseVersion('0.2.1-rc.4'), { major: 0, minor: 2, patch: 1, prerelease: ['rc', '4'] })
  assert.deepEqual(parseVersion('v1.2.3+build.7'), { major: 1, minor: 2, patch: 3, prerelease: [] })
})

test('rejects non-versions instead of guessing', () => {
  for (const value of ['', 'latest', '0.2', '0.2.1.4', undefined, null, 42]) {
    assert.equal(parseVersion(value), null, String(value))
  }
})

test('orders releases per semver precedence', () => {
  assert.equal(compareVersions('0.2.1', '0.2.2'), -1)
  assert.equal(compareVersions('0.3.0', '0.2.9'), 1)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
})

test('treats a prerelease as lower than its release', () => {
  assert.equal(compareVersions('0.2.1-rc.4', '0.2.1'), -1)
  assert.equal(compareVersions('0.2.1', '0.2.1-rc.4'), 1)
})

test('compares numeric prerelease identifiers numerically, not lexically', () => {
  assert.equal(compareVersions('0.2.1-rc.4', '0.2.1-rc.10'), -1)
  assert.equal(compareVersions('0.2.1-rc.10', '0.2.1-rc.4'), 1)
  assert.equal(compareVersions('0.2.1-rc.4', '0.2.1-rc.4'), 0)
})

test('ranks numeric identifiers below alphanumeric ones', () => {
  assert.equal(compareVersions('1.0.0-1', '1.0.0-alpha'), -1)
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-1'), 1)
})

test('ranks a shorter prerelease below a longer one sharing its prefix', () => {
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1)
})

test('accepts the baseline and anything newer', () => {
  for (const version of [BASELINE_HARNESS_VERSION, '0.2.1', '0.2.2-rc.1', '1.0.0']) {
    assert.equal(checkBaseline(version).ok, true, version)
  }
})

test('refuses anything below the baseline', () => {
  for (const version of ['0.2.1-rc.3', '0.2.0', '0.1.0-rc.6', '0.2.1-rc.4'.replace('4', '3')]) {
    const verdict = checkBaseline(version)
    assert.equal(verdict.ok, false, version)
    assert.match(verdict.reason, /older than the required baseline/)
  }
})

test('refuses an unparseable version rather than assuming it meets the baseline', () => {
  const verdict = checkBaseline('build-from-source')
  assert.equal(verdict.ok, false)
  assert.match(verdict.reason, /not parseable/)
})

test('honours a raised baseline', () => {
  assert.equal(checkBaseline('0.2.1-rc.4', '0.3.0').ok, false)
  assert.equal(checkBaseline('0.3.0', '0.3.0').ok, true)
})
