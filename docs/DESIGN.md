# 设计说明

基线：DSH harness **`0.2.1-rc.4`**（Desktop **`2.0.20-next`**）。
下文所有"MUST/SHOULD"都以该基线的源码为准，出处标注为 asar 内路径
`node_modules/@deepseek-ai/<包>/lib/index.js`。

## 1. 需求到实现的映射

| 需求 | 落点 | 证据 |
| --- | --- | --- |
| 写在当前 dsh harness 内的插件 | bundle（`dsh.bundle.patch` + `@deepseek-ai/dsh-agent-preset` 声明行） | `dsh-base/package.json` 的 `dsh.bundle.patch` 形态 |
| 以当前版本为基线、不低于它运行 | 宿主行版本闸门 | `lib/preflight.js` + `cordis.patch.yml` |
| 只针对 DeepSeek 优化 | 元数据 + 提示词 + 逐 agent 提示 | `package.json#dsh.baseline.models`、`lib/prompt.js` |
| 创造"专家模式" | `preset-expert`（`id: expert`） | `presets/expert.patch.yml` |
| 以极简模式为基础 | 沿用 `minimal` 的 persona 策略 / fs 策略 / shell 组 / compaction 组 | `dsh-web-app/presets/minimal.patch.yml` |
| 保留 run_code | `tool-presentation` `mode: ptc` | `dsh-agent-tool-presentation/lib/index.js` |
| PTC 只保留 todo | `@deepseek-ai/dsh-tool-todo` | `dsh-tool-todo/lib/index.js` |
| 保留目标迭代 | `tool-goal` + `command-goal` | `dsh-tool-goal/lib/index.js` |

## 2. 为什么是"声明式预设"，不是"物化预设目录"

基线里预设有两种形态：

- **声明式（当前）**：`- id: preset-<id>` + `name: '@deepseek-ai/dsh-agent-preset'` + `config.plugins`。
  `dsh-agent-preset` 把 config 交给 `ctx.agentPresets.register()`。
- **遗留目录**：`$DSH_HOME/.agent-presets/<id>/{preset.yml,agent.cordis.yml}`。
  基线已经不再读取（`editing-cordis-compositions` 技能原文：
  "Nothing reads that directory any more."）。

本插件只用声明式。这也意味着**不需要宿主行去"物化"任何文件**——宿主的唯一职责是版本闸门。

## 3. 关键取舍：`complete: true` 会吞掉 PTC 的 SDK

这是本项目最容易踩的坑，值得单独记。

`dsh-system-prompt/lib/index.js` 的 `assemble()` 末尾：

```js
return {
  ...transformed,
  sections: completeSection === void 0 ? transformed.sections : [completeSection],
  ...
}
```

也就是说，一旦某个段落声明了 `complete: true`，**最终提示词的 sections 只剩它一个**。

而 PTC 的可调用声明由 `dsh-tools` 自己注册成另外的段落：

- `tools:sdk` —— 生成的 TypeScript SDK（`interface ToolArgsMap`、`declare const tools` …）
- `tools:ptc-only` —— "只有 `run_code` 可以被直接调用" 的规则

两者会被 `complete` 段落一起丢掉。后果不是"少点提示词"，而是**模型看得到 `run_code`、
却看不到任何可调用函数**，写出来的程序必然调用不存在的工具。

所以本插件在 `lib/persona.js` 里自己注册 `deployment:persona-prefix` 段落，并在其中：

1. 用 `ctx.loader.import('@deepseek-ai/dsh-tools')` 拿到 Host 的官方渲染器；
2. 用 `ctx.tools.sdkSchemas(scope)` 取当前 scope 的可见工具投影（Host 自己的实现，
   排除 `run_code`，并校验每个工具有合法 output schema）；
3. 按 `ptcRuntime.language` 选 `renderToolsSdk` / `renderToolsSdkPy`；
4. 把 SDK 拼在身份文本之后。

`interpolate: false` 是必须的：段落里是生成的 TypeScript，若被当作 `{{变量}}` 模板扫描会出问题。

## 4. 工具面的取舍理由

| 保留 | 理由 |
| --- | --- |
| `persistent-shell` | 极简模式的全部文件操作能力都在这；专家模式不重复实现 fs |
| `read_image` | shell 无法替代（图像必须走 attachment 通道） |
| `todo_write` | 需求明确保留；多步任务的进度可见性是 PTC 真正的价值之一 |
| goal 三件套 | 需求明确保留；跨轮迭代依赖 `goals` 服务与 goal 轮次权威模型 |
| `compaction` | 极简模式本身就有；长会话必需 |

| 去掉 | 理由 |
| --- | --- |
| `fs-search(glob/grep)` | `grep -rn` 在 `run_code` 里就是一行；多一个工具只增加选择成本 |
| `tool-fs` 的 read/write/edit | 同上；极简模式也只留 `read_image` |
| `subagent/workflow/ralph` | 专家模式是"一个专家把一个任务做到底"，不引入编排层 |
| `plan-mode` | 与 todo 目标重叠；计划本身就写进 todo |
| `ask_user_question` | 极简模式没有；需要澄清时用自然语言提问即可 |
| `web` / `jobs` / `schedule` / `skill` / `present` / `plugin-manager` | 与"专家做一件事"无关 |

> 这些都不是硬编码的：`presets/expert.patch.yml` 里就是一张清单，用户想加回哪个就加哪一行。

## 5. 版本闸门的三条证据链

基线没有暴露版本服务（全仓 grep `harnessVersion` 无结果；产品版本只作为
`dsh-client-product-analytics` 的 config 注入，不是可读服务）。因此闸门这样设计：

1. **版本证据**：`createRequire` 依次从 `import.meta.url`、`$DSH_PROFILE_DIR`、`cwd` 三个根
   解析 `@deepseek-ai/dsh-base/package.json` 等探针包（这些包的 `exports` 都导出了
   `./package.json`），比较 semver。
2. **能力证据**：解析不到版本时，逐项校验本模式真实依赖的契约
   （`tools.presentAs`、`tools.sdkSchemas`、`systemPrompt.*`、`sessionProjections`、`goals`）。
3. **拒绝**：两者都不成立 → 默认抛错（`allowUnknownVersion: false`）。

设计上刻意**不**用"版本字符串"当唯一真理：一段被改过的版本号比缺失的能力更不可靠。
semver 预发布比较按规范实现（`0.2.1-rc.4 < 0.2.1-rc.10`，`rc.4 < 0.2.1`），并有 11 个用例覆盖。

## 6. 为什么自己实现 Standard Schema

Cordis 校验每一行的 `config` 走的是 Standard Schema 接口：

```js
function resolveConfig(runtime, config) {
  if (!runtime.Config) return config;
  const result = runtime.Config["~standard"].validate(config);
  if ("then" in result) throw new TypeError("Async config validation is not supported");
  if (result.issues) throw new ValidationError(result.issues);
  else return result.value;
}
```

所以 `Config` **不能**是一个裸 JSON Schema 对象：那样 `Config["~standard"]` 是 `undefined`，
整行会在激活时崩掉。官方包用 `schemastery` 实现这个接口，但本插件不依赖任何
`@deepseek-ai/*` 包（那些从 dsh 安装目录解析，声明依赖会钉住第二份拷贝），
所以 `lib/schema.js` 直接实现同一个接口：同步、填默认值、按路径报错。

## 7. DeepSeek 专属怎么落地

模型属于**会话**，预设属于**组合**，两者粒度不同。所以：

- **声明**：`package.json#dsh.baseline.models`、`locale/*.json` 的 `meta.description`、
  预设 `description`、README、以及提示词首句。
- **软引导**：persona 段落的 `text` 是一个函数，按 `context.agent.options.{provider,model}`
  判定（与 Host 的 `{{model}}` 变量同一数据源：`dsh-agent-loop` 注册
  `ctx.systemPrompt.variable('model', (context) => context.agent?.options.model)`）。
  非 DeepSeek 时追加一段说明，**不打断会话**。
- 想要硬阻断的部署可以把 `noteNonDeepSeek` 之外再加 guard——默认不做，因为
  误选模型就把会话卡死，代价高于收益。
