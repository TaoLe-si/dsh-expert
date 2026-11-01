import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { Config, PRESET_TOOL_NAMES, apply, computeDenyList } from '../lib/restrict.js'
import { insertedRows, loadPatch } from './helpers/yaml.js'

/** The global surface this deployment actually composes (dsh-base + team + session-search). */
const HOST_TOOLS = [
  'bash',
  'pwsh',
  'read',
  'write',
  'edit',
  'read_image',
  'glob',
  'grep',
  'job_list',
  'job_output',
  'job_kill',
  'skill',
  'subagent',
  'list_agents',
  'spawn_teammate',
  'send_message',
  'team_task_create',
  'team_task_get',
  'team_task_list',
  'team_task_update',
  'wait_agent',
  'interrupt_agent',
  'web_fetch',
  'web_search',
  'working_directory',
  'session_event_read',
  'session_event_search',
  'session_event_trace',
  'get_goal',
  'create_goal',
  'update_goal',
  'todo_write',
]

test('denies every host tool the preset does not provide', () => {
  const deny = computeDenyList(HOST_TOOLS)
  const expected = [
    'subagent',
    'list_agents',
    'spawn_teammate',
    'send_message',
    'team_task_create',
    'web_fetch',
    'read',
    'write',
    'edit',
    'glob',
    'grep',
    'skill',
    'job_kill',
    'working_directory',
    'session_event_read',
  ]
  for (const name of expected) assert.ok(deny.includes(name), `expected ${name} to be denied`)
})

test('never denies a tool the preset provides itself', () => {
  const deny = computeDenyList(HOST_TOOLS)
  // A restriction matches by NAME, so denying these would also hide the preset's own tools.
  for (const name of PRESET_TOOL_NAMES) assert.equal(deny.includes(name), false, name)
})

test('never names the reserved run_code transport', () => {
  assert.equal(computeDenyList([...HOST_TOOLS, 'run_code']).includes('run_code'), false)
})

test('keeps configured extras visible', () => {
  const deny = computeDenyList(HOST_TOOLS, [...PRESET_TOOL_NAMES, 'web_fetch', 'glob'])
  assert.equal(deny.includes('web_fetch'), false)
  assert.equal(deny.includes('glob'), false)
  assert.ok(deny.includes('web_search'))
})

test('returns a sorted, de-duplicated list', () => {
  assert.deepEqual(computeDenyList(['b_tool', 'a_tool', 'a_tool']), ['a_tool', 'b_tool'])
})

test('is a no-op when every global tool is kept', () => {
  assert.deepEqual(computeDenyList([], PRESET_TOOL_NAMES), [])
  assert.deepEqual(computeDenyList(['todo_write'], PRESET_TOOL_NAMES), [])
})

/** A preset scope context that records the restriction it is given. */
function fakeScope(schemas) {
  const observed = { denied: undefined, effects: 0, scope: 'unset' }
  return {
    observed,
    tools: {
      schemas(scope) {
        observed.scope = scope
        return schemas
      },
      restrict(filter) {
        observed.denied = filter.deny
        return () => {}
      },
    },
    effect(fn, label) {
      observed.effects += 1
      observed.label = label
      return fn()
    },
  }
}

test('reads the GLOBAL view by passing no scope, then restricts the preset scope', () => {
  const ctx = fakeScope(HOST_TOOLS.map((name) => ({ name })))
  apply(ctx, {})
  // No argument means the composition-root view, not the preset's own view.
  assert.equal(ctx.observed.scope, undefined)
  assert.ok(ctx.observed.denied.includes('subagent'))
  assert.equal(ctx.observed.effects, 1)
})

test('does not call restrict({}) when there is nothing to deny', () => {
  const ctx = fakeScope([{ name: 'todo_write' }])
  apply(ctx, {})
  assert.equal(ctx.observed.denied, undefined)
  assert.equal(ctx.observed.effects, 0)
})

test('reports a failed restriction instead of leaving host tools visible', () => {
  const ctx = fakeScope(HOST_TOOLS.map((name) => ({ name })))
  ctx.tools.restrict = () => {
    throw new Error('requires a scoped context')
  }
  assert.throws(() => apply(ctx, {}), /must not silently expose/)
})

test('defaults keepGlobalTools to empty and accepts an allowlist', () => {
  assert.deepEqual(Config['~standard'].validate({}), { value: {} })
  assert.deepEqual(Config['~standard'].validate({ keepGlobalTools: ['web_fetch'] }), {
    value: { keepGlobalTools: ['web_fetch'] },
  })
})

test('the preset mounts the restriction row before the persona renders', () => {
  const patch = loadPatch(readFileSync(new URL('../presets/expert.patch.yml', import.meta.url), 'utf8'))
  const ids = insertedRows(patch)[0].config.plugins.map((entry) => entry.id)
  assert.ok(ids.includes('tool-restrict'))
  assert.ok(ids.indexOf('tool-restrict') < ids.indexOf('persona'))
})

test('the guarded names are exactly the predesigned preset surface', () => {
  const produced = ['bash', 'pwsh', 'read_image', 'todo_write', 'get_goal', 'create_goal', 'update_goal']
  assert.deepEqual([...produced].sort(), [...PRESET_TOOL_NAMES].sort())
})
