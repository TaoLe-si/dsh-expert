# dsh-expert · 专家模式

> DeepSeek Harness（dsh）插件：在官方**极简模式**的提示词骨架上，只保留 `run_code` 作为动作面，
> 并从 PTC 模式里只取出**待办清单**与**目标迭代**两件事的 Agent 模式。
>
> 本插件只面向 **DeepSeek** 模型优化。

**基线版本：`0.2.1-rc.4`（DSH Desktop 2.0.20-next）。低于该版本拒绝运行。**

---

## 一、它解决什么问题

PTC 模式很强，但工具面太宽：子代理、工作流、计划模式、技能、定时任务、后台任务、联网、
产物呈现、插件市场……提示词和工具声明一起膨胀，模型在一个意图明确的任务里要浪费上下文
去挑选工具。

极简模式反过来：提示词只有一句话，动作靠 shell 完成，非常干净——但它没有 `run_code`，
也就没有"一次程序完成一串动作"的编排能力，同样没有待办清单和目标迭代。

**专家模式 = 极简模式的克制 + 恰好两件 PTC 的纪律工具。**

| 能力 | 极简模式 | PTC 模式 | **专家模式** |
| --- | --- | --- | --- |
| 提示词体量 | 一句话 | 长 | **一句话骨架 + 专家纪律** |
| 动作面 | 多个原生工具 | `run_code` | **`run_code`** |
| 待办清单 | — | `todo_write` | **✅ 保留** |
| 目标迭代 | — | goal 三件套 | **✅ 保留** |
| 其余 PTC 工具 | — | 20+ 行 | **全部不挂载** |

## 二、专家模式的工具面

`run_code` 的程序里可调用的只有这些：

| 工具 | 作用 | 来源 |
| --- | --- | --- |
| `bash` / `pwsh` | 持久 shell；文件读写、检索、构建、测试都走它 | 极简模式同款 |
| `read_image` | 唯一保留的 fs 工具 | 极简模式同款 |
| `todo_write` | 建立 / 修改待办清单 | PTC 保留项 ① |
| `get_goal` / `create_goal` / `update_goal` | 建立、修改目标并跨轮迭代 | PTC 保留项 ② |

另有 `compaction`（上下文压缩）与 `/compact` 命令，与极简模式一致。

**刻意不挂载**（这是"不臃肿"的实质）：

`agent-instructions`、`time-context`、`fs-search(glob/grep)`、`jobs`、`schedule`、
`skill-filesystem`、`tool-skill`、`plan-mode`、`subagent(delegation/workflow/ralph)`、
`ask_user_question`、`web`、`present`、`plugin-manager`、`tool-result-pruner`。

> 为什么文件检索也去掉了？因为极简模式的哲学是 **shell 万能**：`grep -rn` 和 `sed -n`
> 在 `run_code` 里就是一次程序调用，不需要模型在 20 个工具之间做选择。

## 三、安装

### 推荐：交给 `plugin_manager`

在本 harness 的插件管理界面/代理里执行：

```
plugin_manager  action: install_bundle  target: <本目录的绝对路径>
```

它自己完成包安装与 bundle 选中，**不要**手工改 profile 的 `package.json`、也不要手工跑 pnpm。

### 备选：手工安装

1. 把本包放到 profile 能解析的位置（例如 profile 目录下，或 `dsh plugin --profile <name> add <本包路径>`）。
2. 在 profile 的 `package.json` 里把 `dsh-expert` 加入 `dsh.profile.bundles`。
3. **重启** harness（新增 bundle 通常可以热挂载，但替换已安装包必须重启才能加载新的 JS 模块代）。

安装后，Agent 模式选择器里会出现 **专家模式**（`order: 5`，排在极简模式之后）。

## 四、配置

### 宿主行（版本闸门） `cordis.patch.yml`

```yaml
- insert:
    - id: dsh-expert
      name: 'dsh-expert'
      config:
        minimumHarnessVersion: '0.2.1-rc.4'  # 基线，调高即收紧
        allowUnknownVersion: false            # 探测不到版本且能力缺失时是否放行
```

### 预设行 `presets/expert.patch.yml`

想调整专家模式的工具面，直接改这一个文件里的 `plugins` 列表即可（这是声明式组合，
不需要改代码）。例如把 glob/grep 加回来：

```yaml
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
```

### persona 行 `dsh-expert/preset-persona`

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `prefix` | 内置专家纪律 | 替换内置身份文本 |
| `includeRuntimeContext` | `false` | 与极简模式一致：不注入运行期上下文快照 |
| `sdk` | `true` | 是否把 PTC SDK 渲染进提示词（关掉就不再是 PTC 形态） |
| `noteNonDeepSeek` | `true` | 模型不是 DeepSeek 时追加一段「按通用纪律执行」的说明 |

## 五、两个关键实现细节

### 1. 为什么本插件自带 persona 行，而不是用 `@deepseek-ai/dsh-persona`

`complete: true` 的提示词段落**会丢弃其它所有段落**——包括 Host 自己注册的
`tools:sdk`（PTC 的可调用声明）和 `tools:ptc-only`（"只能调 run_code"的规则）。

如果直接用官方 persona 行，模型会看到 `run_code` 却看不到任何可调用函数声明，
写出来的程序调用的都是"不存在的工具"。所以本插件自带 persona 行，**在唯一保留的
那个段落里自己渲染 Host 的 SDK**，并且用 `ctx.tools.sdkSchemas()` 保证与官方 PTC
预设逐字节一致。

### 2. 版本闸门为什么这么写

Harness 没有暴露版本服务，所以宿主行用三条证据链判断，任一不成立就**拒绝运行**：

1. 解析基线包（`@deepseek-ai/dsh-base` 等）的版本并与基线比较；
2. 解析不到版本时，逐项校验本模式真正依赖的能力（`tools.presentAs`、
   `tools.sdkSchemas`、`sessionProjections`、`goals` …）；
3. 两者都不成立时默认拒绝（`allowUnknownVersion: false`），而不是假设"应该没事"。

拒绝时抛出的错误会指名本插件与基线版本，harness 的激活诊断里能直接看到。

## 六、开发

```bash
npm test        # 67 个用例：版本比较、闸门决策、persona/SDK 渲染、预设结构、基线包存在性
```

仓库结构：

```
cordis.patch.yml           宿主行：版本闸门
presets/expert.patch.yml   专家模式声明（唯一需要改的工具面清单）
lib/index.js               宿主行实现
lib/persona.js             预设内 persona 行：把 PTC SDK 渲染进 complete 段落
lib/prompt.js              专家提示词与 DeepSeek 判定（纯函数，可测）
lib/preflight.js           闸门决策（纯函数，可测）
lib/version.js             semver 比较（纯函数，可测）
test/                      67 个用例
docs/                      设计说明、验证状态
```

## 七、许可

MIT。见 [LICENSE](LICENSE)。
