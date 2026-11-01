import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  EXPERT_PROMPT,
  NON_DEEPSEEK_NOTE,
  composePersona,
  isDeepSeekIdentifier,
  usesDeepSeekModel,
} from '../lib/prompt.js'

test('recognises DeepSeek providers and model names', () => {
  assert.equal(isDeepSeekIdentifier('deepseek'), true)
  assert.equal(isDeepSeekIdentifier('deepseek-v4.1-flash'), true)
  assert.equal(isDeepSeekIdentifier('DeepSeek-Chat'), true)
  assert.equal(isDeepSeekIdentifier('openai'), false)
  assert.equal(isDeepSeekIdentifier('gpt-5'), false)
  assert.equal(isDeepSeekIdentifier(undefined), false)
})

test('reads the model from the prompt assembly context', () => {
  assert.equal(usesDeepSeekModel({ agent: { options: { provider: 'deepseek', model: 'deepseek-v4.1-flash' } } }), true)
  assert.equal(usesDeepSeekModel({ agent: { options: { provider: 'custom', model: 'deepseek-r2' } } }), true)
  assert.equal(usesDeepSeekModel({ agent: { options: { provider: 'openai', model: 'gpt-5' } } }), false)
  assert.equal(usesDeepSeekModel({}), false)
  assert.equal(usesDeepSeekModel(undefined), false)
})

test('states the mode is DeepSeek-tuned and that run_code is the only direct call', () => {
  assert.match(EXPERT_PROMPT, /DeepSeek/)
  assert.match(EXPERT_PROMPT, /Only `run_code` is callable directly/)
  assert.match(EXPERT_PROMPT, /todo_write/)
  assert.match(EXPERT_PROMPT, /create_goal/)
  assert.match(EXPERT_PROMPT, /update_goal/)
})

test('appends the SDK after the identity so declarations stay last', () => {
  const text = composePersona({ sdk: 'interface ToolArgsMap {}', deepSeek: true })
  assert.ok(text.startsWith(EXPERT_PROMPT))
  assert.ok(text.endsWith('interface ToolArgsMap {}'))
  assert.equal(text.includes(NON_DEEPSEEK_NOTE), false)
})

test('adds the non-DeepSeek notice only for a non-DeepSeek model', () => {
  const tuned = composePersona({ sdk: 'SDK', deepSeek: false })
  assert.ok(tuned.includes(NON_DEEPSEEK_NOTE))
  assert.equal(composePersona({ sdk: 'SDK', deepSeek: false, noteNonDeepSeek: false }).includes(NON_DEEPSEEK_NOTE), false)
})

test('omits the SDK block when PTC mode is off', () => {
  const text = composePersona({ sdk: '', deepSeek: true })
  assert.equal(text, EXPERT_PROMPT)
  assert.equal(text.endsWith('\n\n'), false)
})

test('lets a configured prefix replace the built-in identity', () => {
  const text = composePersona({ prefix: 'You are terse.', sdk: 'SDK', deepSeek: true })
  assert.ok(text.startsWith('You are terse.'))
  assert.equal(text.includes(EXPERT_PROMPT), false)
})
