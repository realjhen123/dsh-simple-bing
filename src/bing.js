/**
 * Bing search: scrape the classic HTML SERP.
 *
 * Only `bing_search` uses this module. The relevance guard rejects Bing's
 * cached-SERP fallback, which returns a normal-looking result list for an
 * unrelated cached query when the real query has no hits.
 * @module dsh-simple-bing/bing
 */

import { fetchHtmlWithRetry, stripTags, uniqueSources } from "./http.js";
import { resolveAcceptLang, resolveMarket } from "./config.js";

export const BING_URL = "https://www.bing.com/search";

/**
 * Build overlap tokens: CJK bigrams plus latin/digit words of length >= 2.
 * @param {string} query - search query.
 * @returns {string[]} tokens.
 */
export function queryOverlapTokens(query) {
  const tokens = new Set();
  for (const run of String(query).match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length <= 2) tokens.add(run);
    for (let i = 0; i + 1 < run.length; i++) tokens.add(run.slice(i, i + 2));
  }
  for (const word of String(query).toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 2) tokens.add(word);
  }
  return [...tokens];
}

/**
 * Decide whether a result list is plausibly about the query.
 * @param {string} query - search query.
 * @param {Array<{title?:string,snippet?:string,url?:string}>} sources - parsed sources.
 * @returns {boolean} true when at least one source overlaps the query.
 */
export function looksRelevant(query, sources) {
  const tokens = queryOverlapTokens(query);
  if (tokens.length === 0) return true;
  return sources.some((source) => {
    const hay = `${source.title ?? ""} ${source.snippet ?? ""} ${source.url ?? ""}`.toLowerCase();
    return tokens.some((token) => hay.includes(token.toLowerCase()));
  });
}

/**
 * Parse a Bing SERP into sources.
 * @param {string} html - SERP HTML.
 * @param {number} [limit] - maximum results.
 * @returns {Array<{url:string,title?:string,snippet?:string}>} parsed sources.
 */
export function parseBingHtml(html, limit = 10) {
  const blocks = String(html).match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? [];
  const sources = [];
  for (const block of blocks) {
    const hrefMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"/);
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!hrefMatch) continue;
    sources.push({
      url: hrefMatch[1],
      ...(titleMatch ? { title: stripTags(titleMatch[1]) } : {}),
      ...(snippetMatch ? { snippet: stripTags(snippetMatch[1]) } : {}),
    });
  }
  return uniqueSources(sources, limit);
}

/**
 * Run one Bing search.
 * @param {string} query - search query.
 * @param {number} maxResults - result cap.
 * @param {{lang?:string,bingMarket?:string,safeSearch?:string,timeoutMs?:number,retries?:number}} options - normalized config.
 * @param {AbortSignal|undefined} [signal] - caller cancellation.
 * @returns {Promise<{sources:Array<object>,truncated:boolean}>} search result.
 */
export async function searchBing(query, maxResults, options, signal) {
  const params = new URLSearchParams({ q: query, mkt: resolveMarket(options) });
  const safeSearch = options?.safeSearch ?? "off";
  if (safeSearch === "off" || safeSearch === "moderate" || safeSearch === "strict") {
    params.set("adlt", safeSearch);
  }
  const html = await fetchHtmlWithRetry(`${BING_URL}?${params}`, signal, resolveAcceptLang(options), {
    attempts: options?.retries ?? 3,
    timeoutMs: options?.timeoutMs ?? 12000,
  });
  const sources = parseBingHtml(html, maxResults ?? 10);
  if (sources.length > 0 && !looksRelevant(query, sources)) {
    return { sources: [], truncated: false };
  }
  return { sources, truncated: false };
}
