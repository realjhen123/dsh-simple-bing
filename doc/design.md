# dsh-simple-bing 设计

## 目标

做成一个只注册一个工具的独立插件，链路是 Bing 搜索。

插件按以下取法实现：

- 插件自己注册一个工具 `bing_search`；
- 完全不碰 DSH 的搜索 provider seam（`ctx.web.searchProvider`）；
- 不注册 fetch provider、设置页、命令、系统提示词；
- 因此 agent 看到的本插件工具只有一个。

## 结构

```text
src/
  index.js   # 插件入口：name / inject / apply，只注册一个工具
  config.js  # 配置归一化 + 语言 → Bing market / Accept-Language
  http.js    # fetch 超时/重试、HTML 实体解码、去标签、去重
  bing.js    # Bing SERP 抓取 + 解析 + 相关性护栏
  tool.js    # defineTool(bing_search)
test/
  bing.test.mjs   # 纯函数单测（解析 / 配置），无网络
  host.test.mjs   # 假 ctx 注册校验 + mock fetch 端到端，缺 dsh-tools 时跳过
```

## 关键决策

### 为什么是独立工具，而不是 provider

provider seam 会让 DSH 自带的 `web_search` 走本插件。那属于「改核心搜索通道」，与「只保留一个工具、独立存在」不同。本插件下 `web_search` / `web_fetch` 保持原样，`bing_search` 是显式的第二条通道。

### 抓取层

- 单次请求硬超时（`AbortController`），默认 12s；工具层再套一个 20s 总超时。
- 失败重试默认 3 次，间隔 1.5s，主要覆盖瞬时网络抖动。
- 响应体小于 500 字节视为空响应，触发重试。
- 命中反爬验证页（状态 202 或正文出现 captcha / unusual traffic 等）时抛出明确的限流错误，而不是返回空列表。

### 解析层

Bing 的经典 SERP 结构是 `<li class="b_algo">`，每块里有 `<h2><a href=...>` 和 `<p>`。解析后按 URL 去重，再截断到 `maxResults`。

### 相关性护栏

Bing 在查询真的无结果时，会返回一张「看着正常、内容却是别的查询」的缓存 SERP。直接把这种页面返回，等于把垃圾结果喂给模型。

护栏做法：从查询里抽 token（CJK 取 1–2 字组合，拉丁/数字取长度 ≥ 2 的词），如果结果标题/摘要/URL 一个 token 都不包含，就判为 0 结果。纯符号查询无法判定，不拦截。

### 安全边界

搜索结果属于不可信外部数据。渲染时：

1. 剥掉网页文本里自带的 `<untrusted-web-content>` / `</untrusted-web-content>`，防止提前闭合；
2. 用同名边界把整段结果包起来。

这样即使搜索结果里嵌入「忽略之前的指令」之类的内容，也有显式边界提示模型它是数据而非指令。

## 测试

- `test/bing.test.mjs`：用本地 SERP fixture 验证解析、去重、截断、护栏和配置归一化，不发网络请求。
- `test/host.test.mjs`：
  - 用假 `ctx.tools` 校验 `apply` 只注册一个工具、名字为 `bing_search`；
  - 用 mock `fetch` 返回 SERP，跑通 `execute` 与 `render`，并校验不可信边界。
  - 裸 checkout 里没有 `@deepseek-ai/dsh-tools` 时整个文件自动跳过。
