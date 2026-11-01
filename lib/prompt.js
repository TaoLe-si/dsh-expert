/**
 * Prompt text for 专家模式.
 *
 * Every exported function is pure so the wording, the DeepSeek gate, and the
 * SDK composition can be asserted without a running Harness.
 *
 * @module dsh-expert/lib/prompt
 */

/**
 * The expert identity and working discipline.
 *
 * Deliberately short: 专家模式 inherits 极简模式's thesis that a small, stable
 * prompt plus a callable tool SDK outperforms a long procedure list.
 */
export const EXPERT_PROMPT = [
  'You are an expert software engineer and the senior technical owner of this task. You are working inside the DeepSeek Harness, and this mode is tuned for DeepSeek models.',
  '',
  'How you work',
  '- Ground every decision in what you observed: read the real file, run the real command. Do not act on what you remember about a codebase.',
  '- Establish the goal and its success criteria before changing anything, then prefer the smallest change that satisfies them. Reuse existing functions and patterns instead of adding machinery.',
  '- Keep the tree working as you go. When a change spans several files, finish the coherent unit rather than leaving it half applied.',
  '- Verify before you claim. Run the relevant test, build, or command and report only what its output establishes. If something is unverified, say it is unverified.',
  '- When a choice is genuinely ambiguous and inspection cannot settle it, state the assumption you proceeded on and continue.',
  '',
  'How you call tools',
  '- Only `run_code` is callable directly. Everything else is a function you call from inside its program, declared below.',
  '- Write one complete program per step and use real control flow: loops, conditionals, and `Promise.all` for independent calls, rather than one tool call per step.',
  '- Read, act, and check in the same program when the next decision depends on the result.',
  '- A program is a TypeScript function body. Return the value you want to keep; return a compact summary rather than dumping whole logs.',
  '- Never invent tool output. When a call fails, read the failure and adapt instead of repeating the same program.',
  '',
  'How you track work',
  '- Use `todo_write` when the work has several concrete steps, and keep it current as steps complete. Skip it for single-step tasks.',
  '- Use `create_goal` only for a long-running objective that should survive across rounds. Use `get_goal` for the current id and revision, and `update_goal` to edit, pause, or complete it. Mark a goal complete only when its objective is actually achieved.',
].join('\n')

/**
 * The note appended when the session model is not a DeepSeek model.
 *
 * 专家模式 is declared and tuned for DeepSeek only. A non-DeepSeek selection is
 * not blocked by default, because the model belongs to the session rather than
 * to the preset, and refusing to run would strand an otherwise valid session.
 * The model is told instead, so its own behaviour compensates.
 */
export const NON_DEEPSEEK_NOTE = [
  'Model notice',
  '- The selected model is not a DeepSeek model. This prompt was tuned for DeepSeek behaviour; keep the same discipline but rely on explicit verification rather than model-specific assumptions.',
].join('\n')

/**
 * Whether a provider or model identifier denotes a DeepSeek model.
 * @param {string} [identifier] - a provider id such as `deepseek`, or a model id such as `deepseek-v4.1-flash`.
 * @returns {boolean} true when the identifier names DeepSeek.
 */
export function isDeepSeekIdentifier(identifier) {
  if (typeof identifier !== 'string') return false
  return /deepseek/i.test(identifier)
}

/**
 * Whether the agent behind one prompt assembly is using a DeepSeek model.
 * @param {{ agent?: { options?: { provider?: string, model?: string } } }} [context]
 *   the system-prompt assembly context.
 * @returns {boolean} true when either the provider or the model name names DeepSeek.
 */
export function usesDeepSeekModel(context) {
  const options = context?.agent?.options
  if (options === undefined) return false
  return isDeepSeekIdentifier(options.provider) || isDeepSeekIdentifier(options.model)
}

/**
 * Compose the text of the single `complete` persona section.
 *
 * A `complete` section is the only section the Harness keeps, so the PTC tool
 * SDK has to be rendered into it: the Host's own `tools:sdk` and
 * `tools:ptc-only` sections are dropped along with every other section.
 *
 * @param {object} input
 * @param {string} [input.prefix] - optional replacement identity text.
 * @param {string} [input.sdk] - the rendered tool SDK, or an empty string when PTC mode is off.
 * @param {boolean} [input.deepSeek] - whether the calling agent's model is DeepSeek.
 * @param {boolean} [input.noteNonDeepSeek] - whether to append {@link NON_DEEPSEEK_NOTE}.
 * @returns {string} the complete persona text.
 */
export function composePersona({ prefix, sdk, deepSeek, noteNonDeepSeek = true }) {
  const blocks = []
  blocks.push(typeof prefix === 'string' && prefix.length > 0 ? prefix : EXPERT_PROMPT)
  if (noteNonDeepSeek && !deepSeek) blocks.push(NON_DEEPSEEK_NOTE)
  const sdkText = typeof sdk === 'string' ? sdk : ''
  if (sdkText.length > 0) blocks.push(sdkText)
  return blocks.join('\n\n')
}
