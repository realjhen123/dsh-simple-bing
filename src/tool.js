/**
 * The single model-facing tool: `bing_search`.
 *
 * This is the only tool the plugin registers. It is a plain tool; the plugin
 * does not touch `ctx.web.searchProvider`.
 * @module dsh-simple-bing/tool
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { searchBing } from "./bing.js";

// 网页文本属于不可信数据：包一层显式边界，并剥掉网页自带的同名标记，
// 防止正文伪造提前闭合边界。
const UNTRUSTED_OPEN = "<untrusted-web-content>";
const UNTRUSTED_CLOSE = "</untrusted-web-content>";
const UNTRUSTED_TAG = /<\/?untrusted-web-content>/gi;

/** @param {unknown} text @returns {unknown} */
function stripBoundaryTags(text) {
  return typeof text === "string" ? text.replace(UNTRUSTED_TAG, "") : text;
}

/** @param {string} text @returns {string} */
function wrapUntrustedBlock(text) {
  return `${UNTRUSTED_OPEN}\n${stripBoundaryTags(text)}\n${UNTRUSTED_CLOSE}`;
}

/**
 * Register the `bing_search` tool.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{maxResults:number,maxResultsLimit:number,timeoutMs:number}} config - normalized config.
 * @returns {void}
 */
export function registerBingSearchTool(ctx, config) {
  ctx.tools.register(
    defineTool({
      name: "bing_search",
      description:
        "Search the web with Bing. Use it for general web queries, news, documentation, or facts. Returns ranked result URLs with titles and snippets. Keyless; no API key required.",
      parameters: {
        query: {
          type: "string",
          required: true,
          description: "The search query.",
        },
        maxResults: {
          type: "number",
          description: `Optional number of results (default ${config.maxResults}, max ${config.maxResultsLimit}).`,
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            provider: { type: "string" },
            query: { type: "string" },
            sources: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  url: { type: "string" },
                  title: { type: "string" },
                  snippet: { type: "string" },
                },
              },
            },
          },
        },
        render(_args, value) {
          const lines = (value.sources ?? []).map(
            (source) => `- [${source.title ?? source.url}](${source.url})${source.snippet ? ` - ${source.snippet}` : ""}`
          );
          const body = lines.join("\n") || "No results found.";
          const heading = value.query ? `Bing search: ${value.query}` : "Bing search";
          return [{ type: "text", text: `${heading}\n${wrapUntrustedBlock(body)}` }];
        },
      },
      async execute(args) {
        const query = String(args.query ?? "").trim();
        if (query.length === 0) throw new Error("query is required");
        const requested = Number(args.maxResults);
        const limit =
          Number.isFinite(requested) && requested > 0
            ? Math.min(Math.floor(requested), config.maxResultsLimit)
            : config.maxResults;
        const signal = AbortSignal.timeout(config.timeoutMs);
        const result = await searchBing(query, limit, config, signal);
        return {
          provider: "bing",
          query,
          sources: (result.sources ?? []).map((source) => {
            const clean = { url: String(source.url) };
            if (source.title) clean.title = String(source.title);
            if (source.snippet) clean.snippet = String(source.snippet);
            return clean;
          }),
        };
      },
      presentCall: (args) => ({
        card: "generic",
        title: "Bing search",
        kind: "other",
        rawInput: { query: args.query, maxResults: args.maxResults },
      }),
    })
  );
}
