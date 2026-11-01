# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-01

Initial release, pinned to DSH harness `0.2.1-rc.4` (Desktop 2.0.20-next).

### Added

- **专家模式 (Expert Mode)** agent preset, `id: expert`, `order: 5`, built on the official
  `minimal` preset skeleton with the PTC presentation (`run_code`) as the sole action surface.
- Todo list retained from PTC mode (`todo_write`, `allowParallelInProgress: true`).
- Goal iteration retained from PTC mode (`get_goal`, `create_goal`, `update_goal`, `/goal`).
- `dsh-expert/preset-persona` row that renders the Host PTC SDK into the `complete` persona
  section, which would otherwise drop `tools:sdk` and leave `run_code` undeclared.
- Host-plane baseline gate (`lib/preflight.js`) that refuses to run below harness `0.2.1-rc.4`,
  proving the baseline by version resolution, by capability assertion, or by explicit refusal.
- DeepSeek-only declaration in package metadata, locale resources, and preset description, plus
  a per-agent notice for non-DeepSeek models (`noteNonDeepSeek`).
- Bilingual display metadata (`locale/zh.json`, `locale/en.json`) and an original SVG icon.
- `lib/schema.js`: a dependency-free Standard Schema, because Cordis validates each row's `config` through `Config["~standard"].validate` and this bundle declares no `@deepseek-ai/*` dependency.
- `scripts/asar-extract.mjs` and `scripts/generate-baseline-fixture.mjs`, so the baseline fixture stays reproducible when the harness moves.
- 75 unit and structural tests covering semver precedence, gate decisions, persona/SDK rendering,
  preset composition, and baseline package existence.

### Notes

- `dsh-expert` does not depend on any `@deepseek-ai/*` package: those resolve from the dsh
  installation at run time, so declaring them would pin a second copy.
