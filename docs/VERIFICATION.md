# 验证状态

本文件说明 **哪些已被证明**、**哪些还没有**。请按同一标准复核。

基线：harness `0.2.1-rc.4` / Desktop `2.0.20-next`。

## 一、已验证（可复现）

### 1. 静态验证：89 个自动化用例全部通过

```bash
npm test
# ℹ tests 89  ℹ pass 89  ℹ fail 0
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

### 3. 安装前已取得、且相当强的运行时旁证

这几条是在**不重启**的前提下能找到的最有力证据，值得单独记：

1. **同一套机制在本部署里正在运行。** 本 profile 的 `agent-preset-registry` 配置是
   `selectedDefault: ptc-minimal`，而 `dsh-minimal-ptc` 的 persona 行用的正是本插件
   依赖的那套机制：`ctx.loader.import("@deepseek-ai/dsh-tools")` →
   `renderToolsSdk(...)` → 写进一个 `complete: true` 段落。
   **本会话本身就跑在这个预设上**，所以"在 write 时用 loader 导入 dsh-tools 并把 SDK
   渲染进 complete 段落"这条路径在此部署是通的，不是理论。
2. **树外插件能解析 harness 包。** `$DSH_HOME/profiles/node_modules` 里有 252 个扁平
   符号链接，`dsh-tools`、`dsh-base`、`dsh-tool-todo`、`dsh-tool-goal`、
   `dsh-agent-tool-presentation`、`dsh-persona`、`dsh-web-app` 均可解析。
3. **版本闸门在这里正好走兜底分支。** `dsh-agent-preset`（单数）**不在**那份链接里，
   所以本插件的闸门拿到的是"版本不可读"，于是走**能力证据**分支——这正是设计
   §5 的第 2 条兜底路径。也就是说安装后能顺带验证兜底逻辑本身。
4. **启动过程从不调用 pnpm**（`dsh-app-boot` 内无 pnpm 子进程），因此把插件登记为
   `link:` 依赖不会触发 frozen-lockfile 失败。`resolveBundleDir` 从 `installAnchor`
   与 `profileDir/package.json` 两处解析，junction 可被解析。

### 4. 本次安装做了什么（可回溯）

| 步骤 | 内容 |
| --- | --- |
| 备份 | `package.json.bak-dsh-expert-20261101-231700`、`cordis.patch.yml.bak-dsh-expert-20261101-231700` |
| 链接 | `node_modules/dsh-expert` → `E:dsh-expert`（junction） |
| 依赖 | `"dsh-expert": "link:E:/dsh-expert"` |
| 选中 | `dsh.profile.bundles` 末尾追加 `dsh-expert` |

`cordis.patch.yml` **未改动**（用户层保持原样）。
安装后 `npm run verify:install` 的 12 项检查全部 PASS；`npm test` 77/77。

### 5. 回滚

```bash
cd "$DSH_PROFILE_DIR"
node /e/dsh-expert/scripts/install-profile.mjs "$(pwd -W)" --remove
cmd //c "rmdir node_modules\dsh-expert"
cp package.json.bak-dsh-expert-20261101-231700 package.json   # 可选：连格式一起还原
```

### 6. 现场失败记录：0.1.1 修掉的"泄露全局工具"

0.1.0 安装后实测发现：专家模式里模型仍然看得到 `list_agents` / `spawn_teammate`
等团队工具。原因是 `view(scope)` 的可见性判定为：

```js
const inherited = global.tools + 祖先 scope 的工具   // 预设自己注册的也在这里
const own = 当前 scope 自己的工具
for (const [name, def] of inherited) if (layers.every(l => l.admits(name))) visible.set(name, def)
```

**预设少写一行不会移除任何全局工具。** `dsh-base` 在 composition root 上注册了
bash/pwsh/fs/fs-search/jobs/skill/subagent/subagent-control/workflow/web/
working-directory，本 profile 的 `dsh-experimental-agent-team-profile` 又在根上
插入了 `tool-agent-team`——它们对所有 agent 可见，与预设无关。

0.1.1 增加 `lib/restrict.js`，在预设 scope 上 `ctx.tools.restrict({ deny })`。
注意 `admits` 是**按名字**匹配的：deny 里若含 `bash`，预设自己的 `bash` 也会被隐藏，
所以 deny 必须减掉 `PRESET_TOOL_NAMES`（有 7 个用例守着这条）。

**这一步仍然只能靠重启实测确认**：`restrict()` 在 `scopeOf(ctx) === undefined` 时会抛错，
而"预设的 standing scope 有 scope 键"是根据 `presentAs()`（官方 PTC 预设里同样从预设行调用）
推断的，不是在本部署里亲眼看过的。若 `tool-restrict` 行激活失败，诊断会带
"must not silently expose" 与未裁掉的工具名——那是这个假设错了，而不是全局工具没变。

### 7. 已知残余限制

- **deny 列表在 `apply` 时按当时的全局工具集算一次。** 若之后热装插件注册了**新名字**的
  全局工具，它不会被裁掉，直到重启（重启会重新计算）。这是刻意不做 `guard()` 兜底的结果：
  guard 需要 `exec` 上的工具名字段，而那个字段名没有在真实运行中验证过，
  用错会让整个模式拒绝一切调用——比"偶尔多露一个工具"严重得多。
- 想放回某个宿主面工具，用 `keepGlobalTools`（写**工具名**，不是行 id）。

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
