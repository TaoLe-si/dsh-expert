/**
 * dsh-expert: host-plane entry point.
 *
 * The bundle's only host row. Its single job is the baseline gate: the profile
 * boots, this row activates, and a harness older than the baseline fails the row
 * loudly instead of composing 专家模式 into a surface it cannot support.
 *
 * The agent mode itself is a declarative `@deepseek-ai/dsh-agent-preset` row
 * declared in `presets/expert.patch.yml`; it lives on the agent plane and needs
 * no code here.
 *
 * @module dsh-expert
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BASELINE_HARNESS_VERSION, BASELINE_PROBE_PACKAGES } from './version.js'
import { evaluateGate, readPackageVersion, refuse } from './preflight.js'

/** Cordis plugin name. */
export const name = 'dsh-expert'

/**
 * Required services.
 *
 * Only `tools` and `systemPrompt` are declared: the preset's own rows inject the
 * rest. Demanding them here would make the gate itself fail to mount in a
 * deployment that could still host the preset rows, turning a clear diagnosis
 * into a missing-dependency error.
 */
export const inject = ['tools', 'systemPrompt']

/** Runtime schema for the gate row. */
export const Config = {
  type: 'object',
  additionalProperties: false,
  properties: {
    minimumHarnessVersion: { type: 'string', default: BASELINE_HARNESS_VERSION },
    allowUnknownVersion: { type: 'boolean', default: false },
    probePackages: { type: 'array', items: { type: 'string' } },
  },
}

/**
 * Build ordered version resolvers over the roots a profile-installed plugin can see.
 *
 * A profile plugin is installed under `$DSH_PROFILE_DIR/node_modules` and does not
 * depend on Harness packages, so the plain `import.meta.url` root usually cannot
 * see them; the profile root and the process root are tried as well. Each
 * resolver returns `undefined` rather than throwing so the chain can continue.
 *
 * @returns {Array<(specifier: string) => string | undefined>} resolvers in try order.
 */
function buildResolvers() {
  const roots = [undefined, process.env.DSH_PROFILE_DIR, process.cwd()]
  const bases = [import.meta.url]
  for (const root of roots) {
    if (typeof root !== 'string' || root.length === 0) continue
    // A directory needs a file URL before createRequire accepts it as a base.
    bases.push(pathToFileURL(join(root, 'package.json')).href)
  }
  return bases.map((base) => {
    let requireFromBase
    try {
      requireFromBase = createRequire(base)
    } catch {
      return () => undefined
    }
    return (specifier) => readPackageVersion(specifier, requireFromBase.resolve, (file) => readFileSync(file, 'utf8'))
  })
}

/**
 * Activate the gate.
 * @param {object} ctx - the host composition context.
 * @param {object} config - the resolved row config.
 */
export function apply(ctx, config = {}) {
  const minimumVersion = config.minimumHarnessVersion ?? BASELINE_HARNESS_VERSION
  const verdict = evaluateGate({
    ctx,
    resolvers: buildResolvers(),
    minimumVersion,
    allowUnknownVersion: config.allowUnknownVersion ?? false,
    probePackages: Array.isArray(config.probePackages) && config.probePackages.length > 0 ? config.probePackages : BASELINE_PROBE_PACKAGES,
  })
  if (!verdict.ok) {
    ctx.logger?.error?.(verdict.detail)
    throw refuse(verdict.detail)
  }
  ctx.logger?.info?.(`专家模式 ready — ${verdict.detail}`)
}
