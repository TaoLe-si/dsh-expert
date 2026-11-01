/**
 * Load a Cordis patch file, treating the Loader's `!!js` scalar as an opaque value.
 *
 * The Loader evaluates `!!js` expressions itself; the tests only need the patch
 * to parse and the row structure to be inspectable.
 */
import yaml from 'js-yaml'

const JsTag = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  construct: (data) => ({ jsExpression: data }),
})

/** Patch schema: the default types plus the Loader's `!!js`. */
export const PATCH_SCHEMA = yaml.DEFAULT_SCHEMA.extend([JsTag])

/**
 * Parse one patch document.
 * @param {string} text - the YAML source.
 * @returns {Array<object>} the parsed patch operations.
 */
export function loadPatch(text) {
  const document = yaml.load(text, { schema: PATCH_SCHEMA })
  if (!Array.isArray(document)) throw new Error('patch document must be a sequence')
  return document
}

/**
 * Find the inserted rows of a patch, across every `insert` operation.
 * @param {Array<object>} patch - parsed patch operations.
 * @returns {Array<object>} every inserted row.
 */
export function insertedRows(patch) {
  return patch.flatMap((operation) => (Array.isArray(operation?.insert) ? operation.insert : []))
}

/**
 * Recursively collect every plugin row in an entry list, descending into groups.
 * @param {Array<object>} entries - a plugin entry list.
 * @returns {Array<object>} every row, group rows included.
 */
export function flattenEntries(entries) {
  const rows = []
  for (const entry of entries) {
    rows.push(entry)
    if (Array.isArray(entry.config)) rows.push(...flattenEntries(entry.config))
  }
  return rows
}
