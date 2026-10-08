# dsh-simple-bing

**一个给 DeepSeek Harness (DSH) 用的极简插件：只注册一个工具 `bing_search`。**

无 API key、无依赖、无搜索 provider 接管。插件只做一件事：把 Bing 的 HTML 搜索结果页解析成结构化的 URL / 标题 / 摘要，交给模型。

## 这个插件注册了什么

只有一个工具：

| 工具 | 作用 |
|---|---|
| `bing_search` | 用 Bing 搜索网页，返回排好序的结果 URL、标题、摘要 |

它**不会**：

- 注册或接管 DSH 的搜索 provider（`ctx.web.searchProvider`）；
- 注册或接管 fetch provider；
- 注册系统提示词、设置页、命令，或任何其它工具。

即 DSH 自带的 `web_search` / `web_fetch` 保持原样，本插件是独立的第二条搜索通道。

## 安装

安装需要改动 profile，请在确认后手动执行。

1. 在 profile 目录建立 link 依赖：

   ```bash
   cd ~/.dsh/profiles/web
   pnpm add link:<path-to-dsh-simple-bing>
   ```

   `<path-to-dsh-simple-bing>` 换成你本地 clone 下来的插件目录。

2. 把 `dsh-simple-bing` 加入 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`。

3. 重新加载或重启 DSH。

插件是纯 ESM JavaScript，没有构建步骤。

## 配置

配置通过 profile 的 `cordis.patch.yml` 里本条目 `config` 传入。全部字段可选。

```yaml
- insert:
    - id: simple-bing
      name: dsh-simple-bing
      config:
        lang: zh            # 语言档：zh / en / ru / ja / de / fr / es / ko
        bingMarket: zh-CN   # 显式 Bing 市场；留空则按 lang 推导
        safeSearch: off     # off / moderate / strict
        maxResults: 5       # 默认结果数（1-10）
        timeoutMs: 20000    # 单次请求超时（毫秒）
        retries: 3          # 抓取失败重试次数
```

`lang` 同时决定 Bing 的 `mkt` 参数和 `Accept-Language` 头，所以非中文用户能拿到本地化结果。显式设置 `bingMarket` 时市场以它为准。

## 使用

模型直接调用：

```json
{
  "query": "DeepSeek Harness plugin",
  "maxResults": 5
}
```

返回：

```json
{
  "provider": "bing",
  "query": "DeepSeek Harness plugin",
  "sources": [
    { "url": "https://...", "title": "...", "snippet": "..." }
  ]
}
```

结果正文在渲染时被包进 `<untrusted-web-content>` 边界，并剥掉网页自带的同名标记，避免搜索结果里的内容伪造边界、诱导模型执行指令。

## 已知限制

- Bing 是网页抓取，没有官方 SLA。触发反爬验证页时工具会返回 `Bing is rate-limited right now`，稍后重试即可。
- 查询无结果时 Bing 偶尔会返回一张缓存 SERP。插件用「查询词与结果文本是否重叠」判断并当成 0 结果，不把无关页面喂给模型。
- 只抓第一页结果，`maxResults` 上限 10。

## 开发

```bash
npm test        # 单元测试（无网络）
npm run check   # 语法检查 + 测试
```

测试说明见 [`doc/design.md`](doc/design.md)。
