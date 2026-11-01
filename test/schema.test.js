import assert from 'node:assert/strict'
import { test } from 'node:test'

import { defineConfig } from '../lib/schema.js'

const Config = defineConfig({
  additionalProperties: false,
  properties: {
    name: { type: 'string', default: 'fallback' },
    enabled: { type: 'boolean', default: true },
    count: { type: 'number' },
    tags: { type: 'array', items: { type: 'string' } },
  },
})

test('exposes the Standard Schema interface Cordis validates through', () => {
  assert.equal(Config['~standard'].version, 1)
  assert.equal(Config['~standard'].vendor, 'dsh-expert')
  assert.equal(typeof Config['~standard'].validate, 'function')
  // Cordis rejects an async validator outright.
  const result = Config['~standard'].validate({})
  assert.equal(typeof result?.then, 'undefined')
})

test('fills defaults for absent fields', () => {
  assert.deepEqual(Config['~standard'].validate({}), { value: { name: 'fallback', enabled: true } })
  assert.deepEqual(Config['~standard'].validate(undefined), { value: { name: 'fallback', enabled: true } })
  assert.deepEqual(Config['~standard'].validate(null), { value: { name: 'fallback', enabled: true } })
})

test('keeps supplied values over defaults', () => {
  assert.deepEqual(Config['~standard'].validate({ name: 'explicit', enabled: false, count: 3, tags: ['a', 'b'] }), {
    value: { name: 'explicit', enabled: false, count: 3, tags: ['a', 'b'] },
  })
})

test('reports a type mismatch with its path instead of coercing', () => {
  const result = Config['~standard'].validate({ enabled: 'yes' })
  assert.ok(result.issues)
  assert.equal(result.issues[0].path.join('.'), 'enabled')
  assert.match(result.issues[0].message, /must be a boolean/)
})

test('rejects unknown fields when additionalProperties is false', () => {
  const result = Config['~standard'].validate({ surprise: 1 })
  assert.ok(result.issues)
  assert.match(result.issues[0].message, /not a recognized field/)
})

test('rejects a non-object config', () => {
  for (const input of ['text', 42, []]) {
    const result = Config['~standard'].validate(input)
    assert.ok(result.issues, String(input))
  }
})

test('validates array items and reports the failing index', () => {
  const result = Config['~standard'].validate({ tags: ['ok', 7] })
  assert.ok(result.issues)
  assert.equal(result.issues[0].path.join('.'), 'tags.1')
})

test('collects every issue rather than stopping at the first', () => {
  const result = Config['~standard'].validate({ enabled: 'yes', count: 'many' })
  assert.equal(result.issues.length, 2)
})
