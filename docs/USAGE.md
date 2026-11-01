# 使用与调参

## 1. 安装

```
plugin_manager  action: install_bundle  target: <本目录绝对路径>
```

安装后**重启** harness。Agent 模式选择器里出现 **专家模式**。

### 手工安装（没有 plugin_manager 时）

`plugin_manager install_bundle` 是官方路径。若当前会话没有这个工具，等价的两步是：

```bash
cd "$DSH_PROFILE_DIR"
# 1) 让包可解析（Windows 用 junction，不需要管理员）
cmd //c "mklink /J node_modules\dsh-expert E:\dsh-expert"
# 2) 登记为 link 依赖 + 选为 bundle
node /e/dsh-expert/scripts/install-profile.mjs "$(pwd -W)"
# 3) 重启前自检
node /e/dsh-expert/scripts/verify-install.mjs "$(pwd -W)"
```

不改 `cordis.patch.yml`（那是你自己的用户层）。

### 卸载 / 回滚

```bash
cd "$DSH_PROFILE_DIR"
node /e/dsh-expert/scripts/install-profile.mjs "$(pwd -W)" --remove
cmd //c "rmdir node_modules\dsh-expert"
```

## 2. 常见调参配方

全部改动都在 `presets/expert.patch.yml`，改完重装/重启即可，**不需要改代码**。

### 2.1 把文件检索加回来

```yaml
          - id: tool-fs-search
            name: '@deepseek-ai/dsh-tool-fs-search'
            config:
              sampleOverCapGlobResults: false
```

### 2.2 让模型能直接读文件（不走 shell）

```yaml
          - id: tool-fs
            name: '@deepseek-ai/dsh-tool-fs'
            config:
              read: true
              readImage: true
              write: false
              edit: false
```

### 2.3 加回联网搜索

```yaml
          - id: tool-web
            name: '@deepseek-ai/dsh-tool-web'
            config:
              fetch: true
              searchTimeoutMs: 60000
```

### 2.4 关掉并行 in_progress（严格单线程待办）

```yaml
          - id: tool-todo
            name: '@deepseek-ai/dsh-tool-todo'
            config:
              allowParallelInProgress: false
```

### 2.5 恢复运行期上下文快照（默认关闭，与极简模式一致）

```yaml
          - id: persona
            name: 'dsh-expert/preset-persona'
            config:
              sdk: true
              noteNonDeepSeek: true
              includeRuntimeContext: true
```

### 2.6 换掉专家身份文本

```yaml
          - id: persona
            name: 'dsh-expert/preset-persona'
            config:
              sdk: true
              prefix: |-
                你是一名资深系统工程师，回答简洁、结论先行。
```

> 注意：`prefix` 只替换**身份与纪律**部分，PTC SDK 仍会自动附加在后面。

### 2.7 调高版本下限

```yaml
- insert:
    - id: dsh-expert
      name: 'dsh-expert'
      config:
        minimumHarnessVersion: '0.2.2'
```

## 3. 排障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 选择器里没有"专家模式" | 预设行激活失败 | 看 `list_plugins` 里 `preset-expert` 的诊断 |
| `dsh-expert` 行 `failed`，诊断含 "refuses to run" | harness 低于基线 | 升级 harness，或按 2.7 调低 `minimumHarnessVersion`（自担风险） |
| 专家模式里 `run_code` 没有任何可调用声明 | `tool-presentation` 行没挂上（它在等 `ptcRuntime`） | 看 `list_plugins` 里 `tool-presentation` 是否停在等待依赖 |
| 提示词里没有 SDK，工具是原生调用 | 部署没有 `ptcRuntime`，persona 已按设计降级 | 属预期：没有 PTC 运行时就没有 PTC 形态；装上 `@deepseek-ai/dsh-ptc-runtime-node` 即可 |
| 提示 "no Host SDK renderer for runtime language" | runtime 语言不是 TS/Python | 该 runtime 尚未支持 |
| 提示某工具 "declares no output schema" | 你加回的工具没有 output schema | PTC 形态要求每个可调用工具都有 output schema；该工具不能进这个模式 |
| 改了 YAML 没生效 | 未重启 / 被上层 patch 覆盖 | 重启；`list_plugins` 里 `overridden` 表示更高优先级层胜出 |

## 4. 本地开发

```bash
npm install     # 仅测试需要（js-yaml）
npm test
```

新增一种模式（例如"专家模式·联网版"）：复制 `presets/expert.patch.yml`，改
`- id: preset-expert` → `preset-expert-web`、`config.id: expert` → `expert-web`、
`order` 另取一值，并把新文件加进 `package.json#dsh.bundle.patch`。
