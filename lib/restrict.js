/**
 * Remove the deployment's host-plane tools from 专家模式.
 *
 * Why this row has to exist:
 *
 * The tool registry has two tiers. A plugin row mounted at the composition root
 * registers a GLOBAL tool; a row mounted inside an agent preset registers a
 * SCOPED tool. A preset can add scoped tools, and a scoped registration shadows a
 * global one of the same name — but **omitting a row never removes anything**.
 * `dsh-base` mounts bash, pwsh, fs, fs-search, jobs, skill, subagent, subagent
 * control, workflow, web, working-directory and more at the root, and this
 * profile's team layer adds the agent-team tools on top. Every one of them is
 * visible to every agent, including agents joined to a preset that never mentions
 * them.
 *
 * So a minimal preset needs an explicit `ctx.tools.restrict({ deny })` on its own
 * scope. Restrictions are evaluated per view, so one call on the preset's standing
 * scope covers every agent joined to it, and it also removes those tools from the
 * generated PTC SDK, which is the surface the model actually reads.
 *
 * @module dsh-expert/lib/restrict
 */

import { defineConfig } from './schema.js'

/** Cordis plugin name. */
export const name = 'expert-tool-restrict'

/** The registry this row restricts. */
export const inject = ['tools']

/**
 * Tool names 专家模式 provides itself, and therefore must never deny.
 *
 * A restriction is matched by NAME, not by the registering scope: denying `bash`
 * would also hide the preset's own `bash`, because the agent's view resolves both
 * the global entry and the preset entry under that one name. This list is the
 * preset's own surface and is asserted by the preset tests.
 */
export const PRESET_TOOL_NAMES = Object.freeze([
  'bash',
  'pwsh',
  'read_image',
  'todo_write',
  'get_goal',
  'create_goal',
  'update_goal',
])

/** The reserved PTC transport, which `restrict()` refuses to name. */
const RUN_CODE = 'run_code'

/** Runtime schema for the restriction row. */
export const Config = defineConfig({
  additionalProperties: false,
  properties: {
    keepGlobalTools: { type: 'array', items: { type: 'string' } },
  },
})

/**
 * Compute the deny list for one deployment's global tool surface.
 *
 * Pure so the policy is testable without a registry.
 *
 * @param {string[]} globalNames - tool names registered at the composition root.
 * @param {Iterable<string>} [keep] - names to leave visible.
 * @returns {string[]} sorted names to deny, never including the preset's own tools.
 */
export function computeDenyList(globalNames, keep = PRESET_TOOL_NAMES) {
  const kept = new Set(keep)
  const deny = new Set()
  for (const toolName of globalNames) {
    if (toolName === RUN_CODE) continue
    if (kept.has(toolName)) continue
    deny.add(toolName)
  }
  return [...deny].sort()
}

/**
 * Restrict this preset's scope to the 专家模式 surface.
 * @param {object} ctx - the mounting preset scope context.
 * @param {object} config - the resolved row config.
 */
export function apply(ctx, config = {}) {
  // `schemas(undefined)` is the global view: `view()` only walks scope layers for a
  // real scope key, so an omitted one yields exactly the composition-root tools.
  const globalNames = ctx.tools.schemas(undefined).map((schema) => schema.name)
  const keep = [...PRESET_TOOL_NAMES, ...(config.keepGlobalTools ?? [])]
  const deny = computeDenyList(globalNames, keep)
  if (deny.length === 0) return
  try {
    ctx.effect(() => ctx.tools.restrict({ deny }), 'expert global tool restriction')
  } catch (error) {
    throw new Error(
      `dsh-expert: failed to hide ${deny.length} global tool(s) (${deny.slice(0, 8).join(', ')}${deny.length > 8 ? ', …' : ''}); ` +
        `专家模式 must not silently expose the deployment's host tools: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
