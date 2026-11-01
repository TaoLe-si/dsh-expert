/**
 * Host-plane preflight for dsh-expert.
 *
 * The requirement is absolute: this plugin must not run on a harness older than
 * the version it was built against. Node cannot know that version from a single
 * API — the Host exposes no version service — so the gate proves the baseline
 * three ways and refuses when none of them holds:
 *
 * 1. Resolve a baseline-carrying Harness package and compare its version.
 * 2. If no package resolves, assert the capabilities the preset composes. A
 *    harness without them is older than the baseline regardless of its label.
 * 3. If neither holds, refuse rather than assume — unless the deployment opts
 *    out explicitly with `allowUnknownVersion`.
 *
 * @module dsh-expert/lib/preflight
 */

import { checkBaseline, BASELINE_HARNESS_VERSION, BASELINE_PROBE_PACKAGES } from './version.js'

/**
 * Capabilities 专家模式 depends on, checked only when the version itself is unreadable.
 *
 * Each one is a distinct Host contract the preset composes, so a missing entry
 * names the actual reason the mode cannot run rather than a guessed version.
 */
export const REQUIRED_CAPABILITIES = Object.freeze([
  { label: 'tools.presentAs (PTC presentation selector)', probe: (ctx) => typeof ctx.tools?.presentAs === 'function' },
  { label: 'tools.sdkSchemas (PTC SDK projection)', probe: (ctx) => typeof ctx.tools?.sdkSchemas === 'function' },
  { label: 'systemPrompt.getSectionOrder', probe: (ctx) => typeof ctx.systemPrompt?.getSectionOrder === 'function' },
  {
    label: 'systemPrompt.suppressRuntimeContext',
    probe: (ctx) => typeof ctx.systemPrompt?.suppressRuntimeContext === 'function',
  },
  { label: 'sessionProjections registry', probe: (ctx) => ctx.get('sessionProjections') !== undefined },
  { label: 'goals service', probe: (ctx) => ctx.get('goals') !== undefined },
])

/**
 * Read one package's version by its exported `./package.json` subpath.
 *
 * `resolve` is supplied by the caller because a profile-installed plugin and the
 * Harness installation resolve Harness packages from different roots.
 *
 * @param {string} specifier - the package name.
 * @param {(id: string) => string} resolve - a `require.resolve` bound to one root.
 * @param {(file: string) => string} readFile - a `readFileSync` returning UTF-8 text.
 * @returns {string | undefined} the declared version, when the package resolves and parses.
 */
export function readPackageVersion(specifier, resolve, readFile) {
  try {
    const manifestPath = resolve(`${specifier}/package.json`)
    const manifest = JSON.parse(readFile(manifestPath))
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Find the first baseline-carrying Harness package version that resolves.
 * @param {Array<(specifier: string) => string | undefined>} resolvers - ordered resolution strategies.
 * @param {Array<string>} [specifiers] - packages to probe, in order.
 * @returns {{ specifier: string, version: string } | undefined} the first hit.
 */
export function detectHarnessVersion(resolvers, specifiers = BASELINE_PROBE_PACKAGES) {
  for (const resolver of resolvers) {
    for (const specifier of specifiers) {
      const version = resolver(specifier)
      if (version !== undefined) return { specifier, version }
    }
  }
  return undefined
}

/**
 * Report every missing capability, in declaration order.
 * @param {object} ctx - the mounting context.
 * @returns {string[]} human-readable labels of the capabilities that are absent.
 */
export function missingCapabilities(ctx) {
  const missing = []
  for (const capability of REQUIRED_CAPABILITIES) {
    let present = false
    try {
      present = capability.probe(ctx) === true
    } catch {
      present = false
    }
    if (!present) missing.push(capability.label)
  }
  return missing
}

/**
 * Build the refusal the gate raises. Prefixing the row id makes the Loader's
 * activation diagnostic name this plugin rather than an anonymous service.
 * @param {string} message - what failed.
 * @returns {Error} the error to throw from `apply`.
 */
function refuse(message) {
  return new Error(
    `dsh-expert: refuses to run — ${message}. 专家模式 requires harness >= ${BASELINE_HARNESS_VERSION}; upgrade the harness or uninstall the bundle.`,
  )
}

/**
 * Decide whether this plugin may run, without performing I/O the caller cannot see.
 *
 * Exported separately from {@link apply} so the decision is testable with a fake
 * context and fake resolvers.
 *
 * @param {object} input
 * @param {object} input.ctx - the mounting context.
 * @param {Array<(specifier: string) => string | undefined>} input.resolvers - ordered version resolvers.
 * @param {string} [input.minimumVersion] - the required baseline.
 * @param {boolean} [input.allowUnknownVersion] - proceed when neither probe is conclusive.
 * @param {Array<string>} [input.probePackages] - packages to probe for a version.
 * @returns {{ ok: boolean, how: 'version' | 'capabilities' | 'unknown', detail: string, missing?: string[] }}
 *   the gate's verdict.
 */
export function evaluateGate({
  ctx,
  resolvers,
  minimumVersion = BASELINE_HARNESS_VERSION,
  allowUnknownVersion = false,
  probePackages = BASELINE_PROBE_PACKAGES,
}) {
  const detected = detectHarnessVersion(resolvers, probePackages)
  if (detected !== undefined) {
    const verdict = checkBaseline(detected.version, minimumVersion)
    if (!verdict.ok) return { ok: false, how: 'version', detail: verdict.reason ?? 'baseline not met' }
    return { ok: true, how: 'version', detail: `${detected.specifier} ${detected.version} meets baseline ${minimumVersion}` }
  }
  const missing = missingCapabilities(ctx)
  if (missing.length === 0) {
    return { ok: true, how: 'capabilities', detail: `harness version unreadable; all required capabilities present` }
  }
  if (allowUnknownVersion) {
    return {
      ok: true,
      how: 'unknown',
      detail: `harness version unreadable and capabilities missing, allowed by configuration`,
      missing,
    }
  }
  return {
    ok: false,
    how: 'capabilities',
    detail: `harness version unreadable and required capabilities are missing: ${missing.join(', ')}`,
    missing,
  }
}

export { refuse }
