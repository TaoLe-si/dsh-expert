import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apply, Config } from '../lib/persona.js'
import { EXPERT_PROMPT, NON_DEEPSEEK_NOTE } from '../lib/prompt.js'

/**
 * Build a fake preset scope context that records what the row registers.
 * @param {object} [overrides] - per-test adjustments.
 * @returns {object} the fake context plus observation fields.
 */
function fakeContext(overrides = {}) {
  const observed = {
    sections: [],
    suppressed: false,
    imports: [],
    effects: [],
  }
  const runtime = overrides.runtime === undefined ? { language: 'typescript', programFormat: 'function-body' } : overrides.runtime
  const ctx = {
    observed,
    effect(fn, label) {
      observed.effects.push(label)
      return fn()
    },
    get(service) {
      if (service === 'ptcRuntime') return runtime
      return undefined
    },
    loader: {
      async import(specifier) {
        observed.imports.push(specifier)
        return {
          renderToolsSdk: (schemas, programFormat) =>
            `SDK[${schemas.map((schema) => schema.name).join(',')}|${programFormat}]`,
          renderToolsSdkPy: (schemas) => `PYSDK[${schemas.map((schema) => schema.name).join(',')}]`,
        }
      },
    },
    systemPrompt: {
      getSectionOrder(name) {
        return 100
      },
      section(spec) {
        observed.sections.push(spec)
        return () => {}
      },
      suppressRuntimeContext() {
        observed.suppressed = true
      },
    },
    tools: {
      sdkSchemas(scope) {
        observed.sdkScope = scope
        return overrides.schemas ?? [
          { name: 'bash', description: 'shell', parameters: { type: 'object' }, output: { type: 'string' } },
          { name: 'todo_write', description: 'todos', parameters: { type: 'object' }, output: { type: 'object' } },
        ]
      },
      ...overrides.tools,
    },
  }
  if (overrides.withoutSdkSchemas) delete ctx.tools.sdkSchemas
  return ctx
}

/** The DeepSeek assembly context for one agent. */
const deepSeekContext = { scope: { id: 'agent-1' }, agent: { options: { provider: 'deepseek', model: 'deepseek-v4.1-flash' } } }

test('registers one complete, non-interpolated persona section', async () => {
  const ctx = fakeContext()
  await apply(ctx, {})
  assert.equal(ctx.observed.sections.length, 1)
  const section = ctx.observed.sections[0]
  assert.equal(section.name, 'deployment:persona-prefix')
  assert.equal(section.complete, true)
  // The section carries generated TypeScript, which must never be scanned for {{vars}}.
  assert.equal(section.interpolate, false)
  assert.equal(typeof section.text, 'function')
})

test('renders the Host PTC SDK into the prompt, because a complete section drops tools:sdk', async () => {
  const ctx = fakeContext()
  await apply(ctx, {})
  const text = ctx.observed.sections[0].text(deepSeekContext)
  assert.ok(text.includes('SDK[bash,todo_write|function-body]'), text)
  assert.ok(text.startsWith(EXPERT_PROMPT))
})

test('projects the SDK from the calling scope, not the mounting scope', async () => {
  const ctx = fakeContext()
  await apply(ctx, {})
  ctx.observed.sections[0].text(deepSeekContext)
  assert.deepEqual(ctx.observed.sdkScope, deepSeekContext.scope)
})

test('suppresses the runtime context snapshot, like 极简模式', async () => {
  const ctx = fakeContext()
  await apply(ctx, {})
  assert.equal(ctx.observed.suppressed, true)
})

test('keeps the runtime context when configured to', async () => {
  const ctx = fakeContext()
  await apply(ctx, { includeRuntimeContext: true })
  assert.equal(ctx.observed.suppressed, false)
})

test('falls back to manual schema projection when the Host exposes no sdkSchemas', async () => {
  const ctx = fakeContext({
    withoutSdkSchemas: true,
    tools: {
      schemas: () => [
        { name: 'bash', description: 'shell', parameters: { type: 'object' } },
        { name: 'run_code', description: 'transport', parameters: { type: 'object' } },
      ],
      get: (name) => ({ output: { schema: { type: 'string' } } }),
    },
  })
  await apply(ctx, {})
  const text = ctx.observed.sections[0].text(deepSeekContext)
  // run_code is the transport and must not be declared as a callable SDK function.
  assert.equal(text.includes('run_code'), true)
  assert.ok(text.includes('SDK[bash|function-body]'), text)
})

test('refuses to declare a tool without an output schema instead of emitting a broken SDK', async () => {
  const ctx = fakeContext({
    withoutSdkSchemas: true,
    tools: {
      schemas: () => [{ name: 'mystery', description: 'x', parameters: { type: 'object' } }],
      get: () => ({ output: undefined }),
    },
  })
  await apply(ctx, {})
  assert.throws(() => ctx.observed.sections[0].text(deepSeekContext), /declares no output schema/)
})

test('uses the Python SDK renderer when the runtime language is python', async () => {
  const ctx = fakeContext({ runtime: { language: 'python', programFormat: 'repl' } })
  await apply(ctx, {})
  assert.ok(ctx.observed.sections[0].text(deepSeekContext).includes('PYSDK[bash,todo_write]'))
})

test('declares no SDK when the deployment composes no PTC runtime', async () => {
  const ctx = fakeContext({ runtime: null })
  await apply(ctx, {})
  // Without a PTC runtime the agent calls tools natively, so an SDK would be a lie.
  assert.equal(ctx.observed.sections[0].text(deepSeekContext), EXPERT_PROMPT)
})

test('refuses a runtime language it cannot render', async () => {
  const ctx = fakeContext({ runtime: { language: 'ruby' } })
  await apply(ctx, {})
  assert.throws(() => ctx.observed.sections[0].text(deepSeekContext), /no Host SDK renderer/)
})

test('skips the SDK entirely when PTC rendering is switched off', async () => {
  const ctx = fakeContext()
  await apply(ctx, { sdk: false })
  assert.deepEqual(ctx.observed.imports, [])
  assert.equal(ctx.observed.sections[0].text(deepSeekContext), EXPERT_PROMPT)
})

test('notes the non-DeepSeek model per agent rather than per mount', async () => {
  const ctx = fakeContext()
  await apply(ctx, {})
  const text = ctx.observed.sections[0].text({ scope: {}, agent: { options: { provider: 'openai', model: 'gpt-5' } } })
  assert.ok(text.includes(NON_DEEPSEEK_NOTE))
  assert.equal(ctx.observed.sections[0].text(deepSeekContext).includes(NON_DEEPSEEK_NOTE), false)
})

test('exposes a Standard Schema config that defaults every optional field', () => {
  assert.equal(typeof Config['~standard'].validate, 'function')
  assert.deepEqual(Config['~standard'].validate({}), {
    value: { includeRuntimeContext: false, sdk: true, noteNonDeepSeek: true },
  })
  // The prefix stays absent unless configured, so the built-in identity is used.
  assert.equal('prefix' in Config['~standard'].validate({}).value, false)
  assert.ok(Config['~standard'].validate({ nope: 1 }).issues)
})
