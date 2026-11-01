/**
 * The 专家模式 persona row.
 *
 * Replaces `@deepseek-ai/dsh-persona` inside the preset for one reason: the
 * preset's persona is `complete: true`, and a complete section is the only
 * section the Harness keeps. The Host registers the PTC surface as its own
 * sections (`tools:ptc-only` and `tools:sdk`), so a static complete persona
 * would leave `run_code` visible with no callable declarations — the model
 * would emit programs against tools the prompt never declared.
 *
 * This row therefore renders the Host's own SDK generator into the persona, and
 * reads the calling agent's model while doing it so the DeepSeek notice is
 * decided per agent rather than per preset mount.
 *
 * @module dsh-expert/lib/persona
 */

import { composePersona, usesDeepSeekModel } from './prompt.js'
import { defineConfig } from './schema.js'

/** Cordis plugin name. */
export const name = 'expert-persona'

/** Services this row contributes to, plus the Host loader used to reach `dsh-tools`. */
export const inject = ['systemPrompt', 'tools', 'loader']

/** Runtime schema for the persona row, validated by Cordis through Standard Schema. */
export const Config = defineConfig({
  additionalProperties: false,
  properties: {
    prefix: { type: 'string' },
    includeRuntimeContext: { type: 'boolean', default: false },
    sdk: { type: 'boolean', default: true },
    noteNonDeepSeek: { type: 'boolean', default: true },
  },
})

/**
 * Project the calling scope's visible tools onto the SDK declaration input.
 *
 * Prefers the Host's own projection so the SDK this persona renders stays
 * byte-identical to what a native PTC preset would render.
 *
 * @param {object} ctx - the preset scope context.
 * @param {unknown} scope - the calling agent scope.
 * @returns {Array<object>} schemas plus their canonical output schemas.
 */
function collectSchemas(ctx, scope) {
  if (typeof ctx.tools.sdkSchemas === 'function') return ctx.tools.sdkSchemas(scope)
  const schemas = []
  for (const tool of ctx.tools.schemas(scope)) {
    if (tool.name === 'run_code') continue
    const definition = ctx.tools.get(tool.name, scope)
    const output = definition?.output?.schema
    if (output === undefined) {
      throw new Error(`dsh-expert: tool "${tool.name}" declares no output schema, so PTC mode cannot declare it`)
    }
    schemas.push({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      output,
    })
  }
  return schemas
}

/**
 * Render the tool SDK the persona carries, or an empty string when PTC mode is off.
 * @param {object} ctx - the preset scope context.
 * @param {object} host - the imported `@deepseek-ai/dsh-tools` module.
 * @param {unknown} scope - the calling agent scope.
 * @returns {string} the SDK section body.
 */
function renderSdk(ctx, host, scope) {
  const runtime = ctx.get('ptcRuntime') ?? ctx.get('codeRuntime')
  const language = runtime?.language ?? 'typescript'
  const render =
    language === 'typescript' ? host.renderToolsSdk : language === 'python' ? host.renderToolsSdkPy : undefined
  if (typeof render !== 'function') {
    throw new Error(`dsh-expert: no Host SDK renderer for runtime language "${String(language)}"`)
  }
  return render(collectSchemas(ctx, scope), runtime?.programFormat ?? 'function-body')
}

/**
 * Register the complete persona section for this preset's scope.
 * @param {object} ctx - the mounting preset scope context.
 * @param {object} config - the resolved row config.
 */
export async function apply(ctx, config = {}) {
  const resolved = {
    prefix: config.prefix,
    includeRuntimeContext: config.includeRuntimeContext ?? false,
    sdk: config.sdk ?? true,
    noteNonDeepSeek: config.noteNonDeepSeek ?? true,
  }
  const host = resolved.sdk ? await ctx.loader.import('@deepseek-ai/dsh-tools') : undefined
  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: 'deployment:persona-prefix',
        order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
        complete: true,
        // The persona carries generated TypeScript declarations, which must never
        // be scanned for `{{variable}}` references.
        interpolate: false,
        text: (context) => {
          const sdk = host === undefined ? '' : renderSdk(ctx, host, context.scope)
          return composePersona({
            prefix: resolved.prefix,
            sdk,
            deepSeek: usesDeepSeekModel(context),
            noteNonDeepSeek: resolved.noteNonDeepSeek,
          })
        },
      }),
    'expert persona section',
  )
  if (!resolved.includeRuntimeContext) ctx.systemPrompt.suppressRuntimeContext()
}
