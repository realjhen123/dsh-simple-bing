/**
 * Plugin configuration.
 *
 * Plain object from the Cordis patch entry; every field falls back to a safe
 * default. Language drives both the Bing `mkt` market and the
 * `Accept-Language` header, so non-Chinese users get localized results.
 * @module dsh-simple-bing/config
 */

/** Bing localization profiles keyed by language code. */
export const LANG_PROFILES = {
  zh: { market: "zh-CN", acceptLang: "zh-CN,zh;q=0.9,en;q=0.8" },
  en: { market: "en-US", acceptLang: "en-US,en;q=0.9" },
  ru: { market: "ru-RU", acceptLang: "ru-RU,ru;q=0.9,en;q=0.8" },
  ja: { market: "ja-JP", acceptLang: "ja-JP,ja;q=0.9,en;q=0.8" },
  de: { market: "de-DE", acceptLang: "de-DE,de;q=0.9,en;q=0.8" },
  fr: { market: "fr-FR", acceptLang: "fr-FR,fr;q=0.9,en;q=0.8" },
  es: { market: "es-ES", acceptLang: "es-ES,es;q=0.9,en;q=0.8" },
  ko: { market: "ko-KR", acceptLang: "ko-KR,ko;q=0.9,en;q=0.8" },
};

/** Accept-Language fallback used when `bingMarket` is set explicitly. */
const MARKET_ACCEPT_LANG = {
  "zh-CN": "zh-CN,zh;q=0.9,en;q=0.8",
  "zh-TW": "zh-TW,zh;q=0.9,en;q=0.8",
  "en-US": "en-US,en;q=0.9",
  "en-GB": "en-GB,en;q=0.9",
  "ru-RU": "ru-RU,ru;q=0.9,en;q=0.8",
  "ja-JP": "ja-JP,ja;q=0.9,en;q=0.8",
  "de-DE": "de-DE,de;q=0.9,en;q=0.8",
  "fr-FR": "fr-FR,fr;q=0.9,en;q=0.8",
  "es-ES": "es-ES,es;q=0.9,en;q=0.8",
  "ko-KR": "ko-KR,ko;q=0.9,en;q=0.8",
};

/** Defaults for every configurable knob. */
export const DEFAULT_CONFIG = Object.freeze({
  /** Language profile key; one of {@link LANG_PROFILES}. */
  lang: "zh",
  /** Explicit Bing market (e.g. `en-US`). Empty means derive from `lang`. */
  bingMarket: "",
  /** Bing safe search: `off` | `moderate` | `strict`. */
  safeSearch: "off",
  /** Default result count when the tool call omits `maxResults`. */
  maxResults: 5,
  /** Hard cap on `maxResults` per call. */
  maxResultsLimit: 10,
  /** Per-request timeout in milliseconds. */
  timeoutMs: 20000,
  /** Fetch attempts before giving up. */
  retries: 3,
});

const SAFE_SEARCH = ["off", "moderate", "strict"];

/**
 * Parse an integer and clamp it into `[min, max]`.
 * @param {unknown} value - raw config value.
 * @param {number} min - inclusive lower bound.
 * @param {number} max - inclusive upper bound.
 * @param {number} fallback - value used when the input is not an integer.
 * @returns {number} clamped integer.
 */
function clampInt(value, min, max, fallback) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

/**
 * Merge raw plugin config over {@link DEFAULT_CONFIG}.
 * @param {unknown} raw - config object supplied by the Cordis patch entry.
 * @returns {{lang:string,bingMarket:string,safeSearch:string,maxResults:number,maxResultsLimit:number,timeoutMs:number,retries:number}} normalized config.
 */
export function normalizeConfig(raw) {
  const input = raw !== null && typeof raw === "object" ? raw : {};
  return {
    lang: Object.hasOwn(LANG_PROFILES, input.lang) ? input.lang : DEFAULT_CONFIG.lang,
    bingMarket: typeof input.bingMarket === "string" ? input.bingMarket.trim() : DEFAULT_CONFIG.bingMarket,
    safeSearch: SAFE_SEARCH.includes(input.safeSearch) ? input.safeSearch : DEFAULT_CONFIG.safeSearch,
    maxResults: clampInt(input.maxResults, 1, 10, DEFAULT_CONFIG.maxResults),
    maxResultsLimit: clampInt(input.maxResultsLimit, 1, 20, DEFAULT_CONFIG.maxResultsLimit),
    timeoutMs: clampInt(input.timeoutMs, 1000, 60000, DEFAULT_CONFIG.timeoutMs),
    retries: clampInt(input.retries, 1, 5, DEFAULT_CONFIG.retries),
  };
}

/**
 * Resolve the Bing `mkt` parameter.
 * @param {{lang?:string,bingMarket?:string}} config - normalized config.
 * @returns {string} Bing market code.
 */
export function resolveMarket(config) {
  if (config?.bingMarket) return config.bingMarket;
  return (LANG_PROFILES[config?.lang] ?? LANG_PROFILES.zh).market;
}

/**
 * Resolve the `Accept-Language` header for a request.
 * @param {{lang?:string,bingMarket?:string}} config - normalized config.
 * @returns {string} header value.
 */
export function resolveAcceptLang(config) {
  if (config?.bingMarket) return MARKET_ACCEPT_LANG[config.bingMarket] ?? "en-US,en;q=0.9";
  return (LANG_PROFILES[config?.lang] ?? LANG_PROFILES.zh).acceptLang;
}
