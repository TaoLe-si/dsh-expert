import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { flattenEntries, insertedRows, loadPatch } from './helpers/yaml.js'

const patch = loadPatch(readFileSync(new URL('../presets/expert.patch.yml', import.meta.url), 'utf8'))
const rows = insertedRows(patch)

test('declares exactly one agent preset', () => {
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'preset-expert')
  assert.equal(rows[0].name, '@deepseek-ai/dsh-agent-preset')
})

test('declares a selectable, identifiable expert mode', () => {
  const config = rows[0].config
  assert.equal(config.id, 'expert')
  assert.equal(config.name, '专家模式')
  assert.equal(typeof config.description, 'string')
  assert.ok(config.description.includes('DeepSeek'))
  assert.equal(typeof config.order, 'number')
  assert.ok(Array.isArray(config.plugins) && config.plugins.length > 0)
})

test('renders run_code through the PTC presentation', () => {
  const entries = flattenEntries(rows[0].config.plugins)
  const presentation = entries.filter((entry) => entry.name === '@deepseek-ai/dsh-agent-tool-presentation')
  assert.equal(presentation.length, 1)
  assert.equal(presentation[0].config.mode, 'ptc')
  // The runtime waits on the Host service; the row must be able to fail named.
  assert.equal(presentation[0].disabled, undefined)
})

test('uses its own persona row so the complete prompt can carry the PTC SDK', () => {
  const entries = flattenEntries(rows[0].config.plugins)
  const persona = entries.filter((entry) => entry.id === 'persona')
  assert.equal(persona.length, 1)
  assert.equal(persona[0].name, 'dsh-expert/preset-persona')
  assert.equal(persona[0].config.sdk, true)
  // The Host persona row would discard tools:sdk and leave run_code undeclared.
  assert.equal(entries.some((entry) => entry.name === '@deepseek-ai/dsh-persona'), false)
})

test('keeps the todo list and the goal iteration surface', () => {
  const entries = flattenEntries(rows[0].config.plugins)
  assert.equal(entries.filter((entry) => entry.name === '@deepseek-ai/dsh-tool-todo').length, 1)
  assert.equal(entries.filter((entry) => entry.name === '@deepseek-ai/dsh-tool-goal').length, 1)
  assert.equal(entries.filter((entry) => entry.name === '@deepseek-ai/dsh-command-goal').length, 1)
})

test('keeps only read_image from the filesystem, because file work goes through the shell', () => {
  const entries = flattenEntries(rows[0].config.plugins)
  const fsRow = entries.find((entry) => entry.name === '@deepseek-ai/dsh-tool-fs')
  assert.ok(fsRow)
  assert.deepEqual(fsRow.config, { read: false, readImage: true, write: false, edit: false })
})

test('exposes the shell for the current platform and only that one', () => {
  const entries = flattenEntries(rows[0].config.plugins)
  const bash = entries.find((entry) => entry.id === 'persistent-bash')
  const pwsh = entries.find((entry) => entry.id === 'persistent-pwsh')
  assert.ok(bash && pwsh)
  // Platform switches stay Loader expressions so one file serves every platform.
  for (const row of [bash, pwsh]) {
    assert.equal(typeof row.disabled?.jsExpression, 'string')
    assert.match(row.disabled.jsExpression, /process\.platform/)
  }
  assert.match(bash.disabled.jsExpression, /=== 'win32'/)
  assert.match(pwsh.disabled.jsExpression, /!== 'win32'/)
})

test('keeps compaction isolated in its own realm, as 极简模式 does', () => {
  const entries = flattenEntries(rows[0].config.plugins)
  const compaction = entries.find((entry) => entry.id === 'compaction')
  assert.ok(compaction)
  assert.equal(compaction.group, true)
  assert.deepEqual(compaction.isolate, { compaction: true })
  const ids = compaction.config.map((entry) => entry.id)
  assert.deepEqual(ids, ['compaction-basic', 'command-compact'])
})

test('is not bloated: none of the ptc rows the mode deliberately drops are mounted', () => {
  const entries = flattenEntries(rows[0].config.plugins)
  const names = new Set(entries.map((entry) => entry.name))
  const dropped = [
    '@deepseek-ai/dsh-agent-instructions',
    '@deepseek-ai/dsh-time-context',
    '@deepseek-ai/dsh-tool-fs-search',
    '@deepseek-ai/dsh-tool-jobs',
    '@deepseek-ai/dsh-tool-schedule',
    '@deepseek-ai/dsh-skill-filesystem',
    '@deepseek-ai/dsh-tool-skill',
    '@deepseek-ai/dsh-plan-mode',
    '@deepseek-ai/dsh-tool-subagent',
    '@deepseek-ai/dsh-tool-subagent-control',
    '@deepseek-ai/dsh-tool-workflow',
    '@deepseek-ai/dsh-workflow-ptc',
    '@deepseek-ai/dsh-tool-ralph',
    '@deepseek-ai/dsh-tool-ask-user',
    '@deepseek-ai/dsh-tool-web',
    '@deepseek-ai/dsh-tool-present',
    '@deepseek-ai/dsh-plugin-manager/tools',
    '@deepseek-ai/dsh-plugin-market/tools',
    '@deepseek-ai/dsh-compaction-tool-result-pruner',
  ]
  for (const name of dropped) assert.equal(names.has(name), false, name)
})

test('mounts the presentation last so it sees every tool the mode registers', () => {
  const entries = flattenEntries(rows[0].config.plugins)
  const last = entries[entries.length - 1]
  assert.equal(last.id, 'tool-presentation')
})

test('gives every row a unique id', () => {
  const entries = flattenEntries(rows[0].config.plugins)
  const ids = entries.map((entry) => entry.id)
  assert.equal(new Set(ids).size, ids.length)
})
