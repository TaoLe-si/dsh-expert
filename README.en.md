# dsh-expert · Expert Mode

> A DeepSeek Harness (dsh) plugin: an agent mode built on the official **minimal** prompt
> skeleton, where `run_code` is the only action surface and the only two things kept from
> the PTC mode are the **todo list** and **goal iteration**.
>
> Optimized for **DeepSeek** models only.

**Baseline: `0.2.1-rc.4` (DSH Desktop 2.0.20-next). Refuses to run below it.**

---

## Why

PTC mode is capable but wide: subagents, workflows, plan mode, skills, schedules, background
jobs, web, deliverables, plugin market. Prompt and tool declarations grow together, and a model
with one clear intent spends context choosing among tools.

Minimal mode is the opposite: one line of prompt, shell as the only verb — but it has no
`run_code`, so no way to compose a sequence of actions into one program, and no todo list or
goal iteration.

**Expert Mode = minimal's restraint + exactly two of PTC's discipline tools.**

| | Minimal | PTC | **Expert** |
| --- | --- | --- | --- |
| Prompt size | one line | long | **one-line skeleton + expert discipline** |
| Action surface | many native tools | `run_code` | **`run_code`** |
| Todo list | — | `todo_write` | **kept** |
| Goal iteration | — | 3 goal tools | **kept** |
| Other PTC rows | — | 20+ rows | **not mounted** |

## Tool surface

Callable inside a `run_code` program:

| Tool | Purpose | Origin |
| --- | --- | --- |
| `bash` / `pwsh` | persistent shell; file work, search, build, test | same as minimal |
| `read_image` | the only fs tool kept | same as minimal |
| `todo_write` | create / update the todo list | PTC keep #1 |
| `get_goal` / `create_goal` / `update_goal` | create, edit, and iterate on a goal | PTC keep #2 |

Plus `compaction` and `/compact`, as in minimal mode.

**Deliberately not mounted:** `agent-instructions`, `time-context`, `fs-search (glob/grep)`,
`jobs`, `schedule`, `skill-filesystem`, `tool-skill`, `plan-mode`,
`subagent (delegation/workflow/ralph)`, `ask_user_question`, `web`, `present`,
`plugin-manager`, `tool-result-pruner`.

> File search is dropped too, because minimal's thesis is **shell is enough**:
> `grep -rn` inside `run_code` is one program, and the model never has to choose
> among twenty tools.

## Install

### Recommended: `plugin_manager`

```
plugin_manager  action: install_bundle  target: <absolute path to this directory>
```

It performs package installation and bundle selection itself. Do not hand-edit the profile's
`package.json` and do not run pnpm there.

### Manual

1. Make the package resolvable from the profile.
2. Add `dsh-expert` to `dsh.profile.bundles` in the profile's `package.json`.
3. Restart the harness (a new bundle can hot-mount; replacing an installed package requires a
   restart to load a fresh JS module generation).

After install, **Expert Mode** appears in the agent mode selector at `order: 5`.

## Configuration

Host row (version gate), `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-expert
      name: 'dsh-expert'
      config:
        minimumHarnessVersion: '0.2.1-rc.4'  # raise to tighten
        allowUnknownVersion: false            # proceed when the version is unreadable?
```

Preset row, `presets/expert.patch.yml` — the tool surface is a declarative list; change it there,
no code required.

Persona row `dsh-expert/preset-persona`:

| Field | Default | Effect |
| --- | --- | --- |
| `prefix` | built-in expert discipline | replace the identity text |
| `includeRuntimeContext` | `false` | keep minimal parity: no runtime snapshot |
| `sdk` | `true` | render the PTC SDK into the prompt |
| `noteNonDeepSeek` | `true` | append a generic-discipline note for non-DeepSeek models |

## Two implementation notes

### 1. Why this bundle ships its own persona row

A `complete: true` prompt section **discards every other section**, including the Host's own
`tools:sdk` (the callable PTC declarations) and `tools:ptc-only` ("only run_code may be called").

With the stock persona row the model would see `run_code` with no callable declarations and emit
programs against tools the prompt never declared. So this bundle ships a persona row that renders
the Host's SDK generator into the single surviving section, projected through
`ctx.tools.sdkSchemas()` so it stays byte-identical to an official PTC preset.

### 2. Why the version gate looks like that

The Host exposes no version service, so the gate proves the baseline three ways and refuses when
none holds:

1. Resolve a baseline-carrying package (`@deepseek-ai/dsh-base` …) and compare versions.
2. If no version resolves, assert the capabilities the mode actually composes
   (`tools.presentAs`, `tools.sdkSchemas`, `sessionProjections`, `goals`, …).
3. If neither holds, refuse by default (`allowUnknownVersion: false`) instead of assuming.

The refusal names this plugin and the baseline, so it surfaces in the harness activation diagnostic.

## Development

```bash
npm test    # 75 cases: semver, gate decisions, Standard Schema, persona/SDK rendering, preset structure, baseline package set
```

## License

MIT. See [LICENSE](LICENSE).
