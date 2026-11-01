/**
 * Semver comparison and harness baseline gate for dsh-expert.
 *
 * Kept dependency-free and free of Cordis imports so the rules that decide
 * whether this plugin may run at all are unit-testable in isolation.
 *
 * @module dsh-expert/lib/version
 */

/**
 * The harness baseline this plugin is built and verified against.
 *
 * Every capability the 专家模式 preset composes (declarative `@deepseek-ai/dsh-agent-preset`
 * rows, `ptcRuntime`, `tools.sdkSchemas`, the goal tool authority model) is present at
 * this version. Below it the mode must not silently degrade, so the gate refuses to run.
 */
export const BASELINE_HARNESS_VERSION = '0.2.1-rc.4'

/** Harness packages that carry the baseline version, tried in resolution order. */
export const BASELINE_PROBE_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-agent-preset',
  '@deepseek-ai/dsh',
])

/**
 * Parse a semver string into its comparable parts.
 * @param {string} input - a version such as `0.2.1-rc.4`.
 * @returns {{ major: number, minor: number, patch: number, prerelease: string[] } | null}
 *   the parsed parts, or `null` when the string is not a version this gate understands.
 */
export function parseVersion(input) {
  if (typeof input !== 'string') return null
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(input.trim())
  if (match === null) return null
  const [, major, minor, patch, prerelease] = match
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined ? [] : prerelease.split('.'),
  }
}

/**
 * Compare one prerelease identifier list against another per semver precedence.
 * @param {string[]} left - identifiers of the left version.
 * @param {string[]} right - identifiers of the right version.
 * @returns {number} negative when left precedes right, positive when it follows, 0 when equal.
 */
function comparePrerelease(left, right) {
  // A version without a prerelease outranks one with a prerelease.
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    // A shorter identifier list has lower precedence when every shared part is equal.
    if (a === undefined) return -1
    if (b === undefined) return 1
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const delta = Number(a) - Number(b)
      if (delta !== 0) return delta < 0 ? -1 : 1
      continue
    }
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    if (aNumeric) return -1
    if (bNumeric) return 1
    if (a !== b) return a < b ? -1 : 1
  }
  return 0
}

/**
 * Compare two semver strings.
 * @param {string} left - the left version.
 * @param {string} right - the right version.
 * @returns {number} -1 when left < right, 0 when equal, 1 when left > right.
 * @throws {TypeError} when either input is not a parseable version.
 */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === null) throw new TypeError(`dsh-expert: "${String(left)}" is not a semantic version`)
  if (b === null) throw new TypeError(`dsh-expert: "${String(right)}" is not a semantic version`)
  for (const key of ['major', 'minor', 'patch']) {
    const delta = a[key] - b[key]
    if (delta !== 0) return delta < 0 ? -1 : 1
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

/**
 * Decide whether a detected harness version satisfies the baseline.
 * @param {string} detected - the harness version found at runtime.
 * @param {string} [baseline] - the version this plugin requires.
 * @returns {{ ok: boolean, detected: string, baseline: string, reason?: string }}
 *   `ok` plus, when the gate refuses, the reason the preset must not compose.
 */
export function checkBaseline(detected, baseline = BASELINE_HARNESS_VERSION) {
  const parsed = parseVersion(detected)
  if (parsed === null) {
    return {
      ok: false,
      detected: String(detected),
      baseline,
      reason: `harness version "${String(detected)}" is not parseable, so the ${baseline} baseline cannot be confirmed`,
    }
  }
  const order = compareVersions(detected, baseline)
  if (order < 0) {
    return {
      ok: false,
      detected,
      baseline,
      reason: `harness ${detected} is older than the required baseline ${baseline}`,
    }
  }
  return { ok: true, detected, baseline }
}
