/**
 * A minimal Standard Schema implementation for plugin `Config`.
 *
 * Cordis validates a row's `config` through `Config['~standard'].validate(value)`,
 * synchronously, expecting `{ value }` or `{ issues }`. Every Harness package
 * declares that schema with `schemastery`, but this bundle deliberately depends on
 * no `@deepseek-ai/*` package — those resolve from the dsh installation at run time,
 * and importing one here would pin a second copy or fail to resolve.
 *
 * So this module implements the same interface directly: validation plus default
 * filling, with no dependency and no async.
 *
 * @module dsh-expert/lib/schema
 */

/** The Standard Schema version this module implements. */
const STANDARD_VERSION = 1

/**
 * Report one invalid field.
 * @param {string} path - the dotted field path.
 * @param {string} message - what is wrong.
 * @returns {{ message: string, path: string[] }} the issue.
 */
function issue(path, message) {
  return { message, path: path.split('.') }
}

/**
 * Validate one value against a small property description.
 * @param {unknown} value - the value to check.
 * @param {object} spec - the property description.
 * @param {string} path - the dotted path of this value, for messages.
 * @param {Array<object>} issues - the accumulator.
 * @returns {unknown} the validated (and possibly defaulted) value.
 */
function validateProperty(value, spec, path, issues) {
  if (value === undefined || value === null) {
    if (spec.default !== undefined) return spec.default
    if (spec.required === true) {
      issues.push(issue(path, 'is required'))
      return undefined
    }
    return undefined
  }
  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string') {
        issues.push(issue(path, `must be a string, received ${typeof value}`))
        return undefined
      }
      return value
    case 'boolean':
      if (typeof value !== 'boolean') {
        issues.push(issue(path, `must be a boolean, received ${typeof value}`))
        return undefined
      }
      return value
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        issues.push(issue(path, `must be a number, received ${typeof value}`))
        return undefined
      }
      return value
    case 'array': {
      if (!Array.isArray(value)) {
        issues.push(issue(path, `must be an array, received ${typeof value}`))
        return undefined
      }
      const items = []
      value.forEach((entry, index) => {
        const itemSpec = spec.items ?? { type: 'string' }
        const validated = validateProperty(entry, itemSpec, `${path}.${index}`, issues)
        if (validated !== undefined) items.push(validated)
      })
      return items
    }
    default:
      return value
  }
}

/**
 * Build a plugin `Config` from a small object description.
 *
 * Only the shapes this bundle actually uses are supported: object roots with
 * `string`, `boolean`, `number`, and `array` properties, each optionally
 * defaulted and required.
 *
 * @param {object} root - the root property description.
 * @returns {{ '~standard': { version: number, vendor: string, validate: (input: unknown) => object } }}
 *   a Standard Schema usable as a Cordis plugin `Config`.
 */
export function defineConfig(root) {
  return {
    '~standard': {
      version: STANDARD_VERSION,
      vendor: 'dsh-expert',
      /**
       * Validate and normalize one row's config.
       * @param {unknown} input - the raw row config.
       * @returns {{ value: object } | { issues: Array<object> }} the normalized config or issues.
       */
      validate(input) {
        const raw = input === undefined || input === null ? {} : input
        if (typeof raw !== 'object' || Array.isArray(raw)) {
          return { issues: [issue('', 'config must be an object')] }
        }
        const issues = []
        const value = {}
        const properties = root.properties ?? {}
        for (const [key, spec] of Object.entries(properties)) {
          const validated = validateProperty(raw[key], spec, key, issues)
          if (validated !== undefined) value[key] = validated
        }
        if (root.additionalProperties === false) {
          for (const key of Object.keys(raw)) {
            if (!Object.hasOwn(properties, key)) issues.push(issue(key, 'is not a recognized field'))
          }
        }
        if (issues.length > 0) return { issues }
        return { value }
      },
    },
  }
}
