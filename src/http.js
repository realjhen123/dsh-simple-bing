/**
 * Minimal HTTP + HTML helpers for Bing scraping.
 *
 * Plain `fetch` only, no dependencies. The anti-bot check rejects Bing's
 * challenge page so callers surface a clear "rate-limited" error instead of an
 * empty result list.
 * @module dsh-simple-bing/http
 */

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const DEFAULT_ACCEPT_LANG = "zh-CN,zh;q=0.9,en;q=0.8";

/**
 * Decode the HTML entities Bing emits in titles/snippets.
 * @param {unknown} text - raw text.
 * @returns {string} decoded text.
 */
export function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Strip tags, decode entities and collapse whitespace.
 * @param {unknown} html - HTML fragment.
 * @returns {string} plain text.
 */
export function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

/**
 * Drop URLs already seen and cap the list length.
 * @param {Array<{url?:string}>} sources - parsed sources.
 * @param {number} limit - maximum entries to keep.
 * @returns {Array<object>} deduplicated sources.
 */
export function uniqueSources(sources, limit) {
  const seen = new Set();
  const out = [];
  for (const source of sources) {
    if (source.url && !seen.has(source.url)) {
      seen.add(source.url);
      out.push(source);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Fetch one URL as text with a hard timeout.
 * @param {string} url - target URL.
 * @param {AbortSignal|undefined} signal - caller cancellation.
 * @param {string|undefined} acceptLang - Accept-Language header.
 * @param {number} [timeoutMs] - per-request timeout.
 * @returns {Promise<string>} response body.
 */
export async function fetchHtml(url, signal, acceptLang, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": acceptLang ?? DEFAULT_ACCEPT_LANG,
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(`connection error: ${error?.message ?? String(error)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url.split("?")[0]}`);
  }
  const html = await response.text();
  if (
    response.status === 202 ||
    /captcha|unusual traffic|robot check|verify you are human|are you a robot/i.test(html.slice(0, 4000))
  ) {
    throw new Error("Bing is rate-limited right now (anti-bot challenge, usually temporary)");
  }
  return html;
}

/**
 * Fetch with bounded retries for network errors and truncated/empty bodies.
 * @param {string} url - target URL.
 * @param {AbortSignal|undefined} signal - caller cancellation.
 * @param {string|undefined} acceptLang - Accept-Language header.
 * @param {{attempts?:number,timeoutMs?:number,delayMs?:number}} [options] - retry policy.
 * @returns {Promise<string>} response body.
 */
export async function fetchHtmlWithRetry(url, signal, acceptLang, options = {}) {
  const attempts = Math.max(1, options.attempts ?? 3);
  const timeoutMs = options.timeoutMs ?? 12000;
  const delayMs = options.delayMs ?? 1500;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const html = await fetchHtml(url, signal, acceptLang, timeoutMs);
      if (html.length > 500) return html;
      lastError = new Error(`empty response (${html.length} bytes)`);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastError ?? new Error("fetch failed");
}
