import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  REQUIRED_CAPABILITIES,
  detectHarnessVersion,
  evaluateGate,
  missingCapabilities,
  readPackageVersion,
  refuse,
} from '../lib/preflight.js'

/** A context that satisfies every declared capability. */
function completeContext() {
  return {
    tools: { presentAs() {}, sdkSchemas() {} },
    systemPrompt: { getSectionOrder() {}, suppressRuntimeContext() {} },
    get(service) {
      return service === 'sessionProjections' || service === 'goals' ? {} : undefined
    },
  }
}

/** A resolver for one fixed version, or undefined when the package is unknown. */
function resolverFor(version) {
  return (specifier) => (specifier.includes('dsh-base') ? version : undefined)
}

test('reads a version through an injected resolver and reader', () => {
  const version = readPackageVersion(
    '@deepseek-ai/dsh-base',
    () => '/fake/package.json',
    () => JSON.stringify({ version: '0.2.1-rc.4' }),
  )
  assert.equal(version, '0.2.1-rc.4')
})

test('reports no version when the package does not resolve or does not parse', () => {
  const throwing = () => {
    throw new Error('missing')
  }
  assert.equal(readPackageVersion('@deepseek-ai/dsh-base', throwing, () => '{}'), undefined)
  assert.equal(readPackageVersion('@deepseek-ai/dsh-base', () => '/f', () => '{not json'), undefined)
  assert.equal(readPackageVersion('@deepseek-ai/dsh-base', () => '/f', () => '{"version":42}'), undefined)
})

test('probes resolvers in order and stops at the first hit', () => {
  const hit = detectHarnessVersion([() => undefined, resolverFor('0.2.1-rc.4')])
  assert.equal(hit.version, '0.2.1-rc.4')
  assert.match(hit.specifier, /dsh-base/)
  assert.equal(detectHarnessVersion([() => undefined]), undefined)
})

test('passes when the detected version meets the baseline', () => {
  const verdict = evaluateGate({ ctx: completeContext(), resolvers: [resolverFor('0.2.1-rc.4')] })
  assert.equal(verdict.ok, true)
  assert.equal(verdict.how, 'version')
})

test('refuses when the detected version is below the baseline, even if capabilities look present', () => {
  const verdict = evaluateGate({ ctx: completeContext(), resolvers: [resolverFor('0.2.0')] })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.how, 'version')
  assert.match(verdict.detail, /older than the required baseline/)
})

test('falls back to capabilities when no version resolves', () => {
  const verdict = evaluateGate({ ctx: completeContext(), resolvers: [() => undefined] })
  assert.equal(verdict.ok, true)
  assert.equal(verdict.how, 'capabilities')
})

test('refuses an unreadable version when a required capability is missing', () => {
  const ctx = completeContext()
  delete ctx.tools.sdkSchemas
  const verdict = evaluateGate({ ctx, resolvers: [() => undefined] })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.how, 'capabilities')
  assert.deepEqual(verdict.missing, ['tools.sdkSchemas (PTC SDK projection)'])
})

test('refuses a missing goals service, which goal iteration depends on', () => {
  const ctx = completeContext()
  const original = ctx.get
  ctx.get = (service) => (service === 'goals' ? undefined : original(service))
  const verdict = evaluateGate({ ctx, resolvers: [() => undefined] })
  assert.equal(verdict.ok, false)
  assert.ok(verdict.missing.includes('goals service'))
})

test('allows an inconclusive probe only when the deployment opts in', () => {
  const ctx = completeContext()
  delete ctx.tools.sdkSchemas
  const verdict = evaluateGate({ ctx, resolvers: [() => undefined], allowUnknownVersion: true })
  assert.equal(verdict.ok, true)
  assert.equal(verdict.how, 'unknown')
  assert.deepEqual(verdict.missing, ['tools.sdkSchemas (PTC SDK projection)'])
})

test('a throwing capability probe counts as missing rather than crashing the gate', () => {
  const ctx = {
    get tools() {
      throw new Error('no tools service')
    },
    systemPrompt: {},
    get() {
      return undefined
    },
  }
  const missing = missingCapabilities(ctx)
  assert.equal(missing.length, REQUIRED_CAPABILITIES.length)
})

test('the refusal names the plugin and the baseline it actually demanded', () => {
  const defaulted = refuse('harness 0.2.0 is older than the required baseline 0.2.1-rc.4')
  assert.match(defaulted.message, /^dsh-expert: refuses to run/)
  assert.match(defaulted.message, /requires harness >= 0\.2\.1-rc\.4/)
  // A raised baseline must report the raised version, not the module default.
  assert.match(refuse('too old', '99.0.0').message, /requires harness >= 99\.0\.0/)
})

test('honours a custom probe package list', () => {
  const verdict = evaluateGate({
    ctx: completeContext(),
    resolvers: [(specifier) => (specifier === 'custom-pkg' ? '9.9.9' : undefined)],
    probePackages: ['custom-pkg'],
  })
  assert.equal(verdict.ok, true)
  assert.equal(verdict.how, 'version')
})
