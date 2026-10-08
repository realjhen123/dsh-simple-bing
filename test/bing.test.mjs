/**
 * Unit tests for the pure Bing parser and config normalization.
 * No network: the SERP is a local fixture.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { parseBingHtml, looksRelevant, queryOverlapTokens } from "../src/bing.js";
import { normalizeConfig, resolveMarket, resolveAcceptLang } from "../src/config.js";

const SERP = `
<!doctype html><html><body>
<ol id="b_results">
  <li class="b_algo"><h2><a href="https://example.com/a">Example A</a></h2><p>Alpha &amp; beta snippet</p></li>
  <li class="b_algo"><h2><a href="https://example.com/b">Example B</a></h2><p>Beta <b>snippet</b> here</p></li>
  <li class="b_algo"><h2><a href="https://example.com/a">Duplicate A</a></h2><p>dup</p></li>
  <li class="b_algo"><div>no anchor here</div></li>
</ol>
</body></html>
`.padEnd(600, " ");

test("parseBingHtml extracts title, url and snippet", () => {
  const sources = parseBingHtml(SERP);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources[0], {
    url: "https://example.com/a",
    title: "Example A",
    snippet: "Alpha & beta snippet",
  });
  assert.equal(sources[1].title, "Example B");
  assert.equal(sources[1].snippet, "Beta snippet here");
});

test("parseBingHtml deduplicates by url and respects the limit", () => {
  assert.equal(parseBingHtml(SERP, 1).length, 1);
  assert.equal(parseBingHtml(SERP, 10).length, 2);
});

test("parseBingHtml returns an empty list for a page with no b_algo blocks", () => {
  assert.deepEqual(parseBingHtml("<html><body>no results</body></html>"), []);
});

test("queryOverlapTokens builds CJK bigrams and latin words", () => {
  const tokens = queryOverlapTokens("DeepSeek 搜索");
  assert.ok(tokens.includes("deepseek"));
  assert.ok(tokens.includes("搜索"));
});

test("looksRelevant rejects an unrelated cached SERP", () => {
  const unrelated = parseBingHtml(
    '<li class="b_algo"><h2><a href="https://x.test/1">Swiss fund</a></h2><p>finance</p></li>'
  );
  assert.equal(looksRelevant("typescript generics", unrelated), false);
  assert.equal(looksRelevant("typescript generics", [{ title: "TypeScript generics guide", url: "https://x.test/2" }]), true);
});

test("normalizeConfig applies defaults and clamps", () => {
  const defaults = normalizeConfig(undefined);
  assert.equal(defaults.lang, "zh");
  assert.equal(defaults.maxResults, 5);
  assert.equal(defaults.timeoutMs, 20000);

  const custom = normalizeConfig({ lang: "en", bingMarket: "en-US", safeSearch: "strict", maxResults: 99, timeoutMs: 1 });
  assert.equal(custom.lang, "en");
  assert.equal(custom.bingMarket, "en-US");
  assert.equal(custom.safeSearch, "strict");
  assert.equal(custom.maxResults, 10);
  assert.equal(custom.timeoutMs, 1000);

  const invalid = normalizeConfig({ lang: "xx", safeSearch: "nope" });
  assert.equal(invalid.lang, "zh");
  assert.equal(invalid.safeSearch, "off");
});

test("market and accept-language resolution", () => {
  assert.equal(resolveMarket({ lang: "ru" }), "ru-RU");
  assert.equal(resolveMarket({ lang: "ru", bingMarket: "en-US" }), "en-US");
  assert.match(resolveAcceptLang({ lang: "ja" }), /^ja-JP/);
  assert.match(resolveAcceptLang({ bingMarket: "de-DE" }), /^de-DE/);
});
