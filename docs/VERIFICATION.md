# 验证状态

本文件说明 **哪些已被证明**、**哪些还没有**。请按同一标准复核。

基线：harness `0.2.1-rc.4` / Desktop `2.0.20-next`。

## 一、已验证（可复现）

### 1. 静态验证：75 个自动化用例全部通过

```bash
npm test
# ℹ tests 75  ℹ pass 75  ℹ fail 0
```

覆盖：

| 文件 | 断言内容 |
| --- | --- |
| `test/version.test.js` | semver 解析与比较（含预发布优先级）；基线闸门接受/拒绝；不可解析版本一律拒绝 |
| `test/preflight.test.js` | 三条证据链：版本命中、版本不足即拒、能力兜底、能力缺失即拒、`allowUnknownVersion` 显式放行、探针抛错不炸 |
| `test/prompt.test.js` | DeepSeek 判定（provider/model 任一命中）；SDK 附加在身份之后；非 DeepSeek 说明只在需要时出现 |
| `test/persona.test.js` | `complete: true` + `interpolate: false`；SDK 渲染进段落；按 `context.scope` 投影；`suppressRuntimeContext` 默认触发；`sdkSchemas` 缺失时回退到手工投影并排除 `run_code`；缺 output schema 时报错；python 运行时切换渲染器 |
| `test/preset.test.js` | 预设声明结构；`tool-presentation: ptc`；自带 persona 行而非官方 persona 行；todo/goal 保留；fs 只开 `readImage`；平台开关；compaction isolate；**20 个应被丢弃的 PTC 行确实没有挂载**；presentation 在最后 |
| `test/baseline.test.js` | 挂载的每个 `@deepseek-ai/*` 包都在基线包集合中存在；每个行名可被解析 |
| `test/schema.test.js` | Standard Schema 接口；默认值填充；类型不匹配按路径报错；未知字段被拒；数组元素路径 |
| `test/bundle.test.js` | 清单里所有运行期路径存在；bundle patch 列表；locale 元数据；图标为 SVG 且 < 256 KiB；`files` 覆盖 |

### 2. 基线事实核对（读源码得出，非猜测）

- 303 个 `@deepseek-ai/dsh*` 包版本**全部**等于 `0.2.1-rc.4`
  → 记录在 `test/fixtures/baseline-packages.json`，由测试强制校验。
- `minimal` / `ptc` 官方预设原文
  （`dsh-web-app/presets/{minimal,ptc}.patch.yml`）已逐个对读：
  本插件的 persona 策略、fs 配置、shell 组、compaction 组均与其逐字一致；
  todo/goal 两行也与 `ptc` 一致。
- `complete: true` 会丢弃 `tools:sdk` / `tools:ptc-only`
  → `dsh-system-prompt/lib/index.js` 的 `assemble()` 返回 `sections: [completeSection]`。
- `bash`(persistent)、`read`/`write`/`edit`/`read_image` 都声明了 `output.schema`
  → `dsh-tool-bash-persistent`、`dsh-tool-fs` 均有 `output: { schema: … }`，
  因此 `renderToolsSdk` 不会因缺 output 而抛错。

## 二、尚未验证（不要当成已通过）

### 1. 未在真实 harness 里完成一次运行时激活

**原因**：本仓库是在 DSH Desktop 内部构建的，而 Desktop 的 harness 打包在
`app.asar` 里；Node 进程无法从 asar 解析这些包，无法在旁路进程中复现同一组合。
用全局 `dsh` CLI 也不行——它自带的是**另一代** harness（194 个包、用
`dsh-agent-presets`（复数）、没有 `dsh-tools` / `dsh-web-app`），
`dsh --profile desktop --dump-config` 会因解析不到 Desktop 专有 bundle 而失败。
所以在当前会话里**无法**在不重启宿主应用的前提下完成一次真实挂载。

**这意味着**：

- `preset-expert` 是否能在选择器里出现、`run_code` 是否真带出 4 组声明、
  版本闸门在真实 profile 里的诊断文本长什么样——**均未运行时观测**。
- 单元测试用假 `ctx` 验证了 persona 的**逻辑**，但没有验证它与真实
  `ToolRuntime` / `SystemPrompt` 实例的耦合（例如 `ctx.tools.sdkSchemas` 的可见性、
  `ctx.loader.import` 在预设 scope 下的解析）。

### 2. 建议的首次安装验证清单

安装并**重启** harness 后，请依次确认：

1. `plugin_manager` `list_bundles` 里有 `dsh-expert`；`list_plugins` 里
   `dsh-expert` 与 `preset-expert` 两行均为已激活（不是 `failed` / `overridden`）。
2. 设置 → 插件详情里标题显示 **专家模式**，描述包含 DeepSeek 字样，图标为蓝色 SVG。
3. Agent 模式选择器里出现 **专家模式**，位于极简模式之后。
4. 用专家模式新建会话，问"你现在能调用哪些工具"：
   - 应答出 `bash`(或 `pwsh`)、`read_image`、`todo_write`、`get_goal`、`create_goal`、`update_goal`；
   - **不应**出现 `glob`、`grep`、`read`、`write`、`edit`、`subagent`、`web`、`present` 等。
5. 让它写一个待办清单，确认 `todo_write` 在 UI 里真的渲染出清单。
6. 让它为多步任务建立目标，确认 `create_goal` 成功、`get_goal` 能读到 revision。
7. 选一个非 DeepSeek 模型再进专家模式，确认提示词里出现"Model notice"（软引导），且会话没有被阻断。
8. 负向验证版本闸门：把 `cordis.patch.yml` 里的 `minimumHarnessVersion` 临时改成
   `99.0.0`，重启后确认 `dsh-expert` 行激活失败、诊断文本包含
   "refuses to run" 与基线版本；随后改回。

## 三、验证纪律

- 不会用截图、mock 页面或"安装成功"来代替上述运行时确认。
- 上述第 8 条是可在任意环境下复现的闸门回归测试。
