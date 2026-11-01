# 使用与调参

## 1. 安装

```
plugin_manager  action: install_bundle  target: <本目录绝对路径>
```

安装后**重启** harness。Agent 模式选择器里出现 **专家模式**。

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
| 专家模式里 `run_code` 没有任何可调用声明 | persona 分支没渲染 SDK | 确认 `sdk: true`；确认部署组合了 `ptcRuntime`（`@deepseek-ai/dsh-ptc-runtime-node`） |
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
