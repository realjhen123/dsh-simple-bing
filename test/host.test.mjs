/**
 * Host integration smoke test.
 *
 * Needs `@deepseek-ai/dsh-tools` resolvable from the plugin directory. That is
 * true after install into a DSH profile, but not in a bare checkout, so the
 * test skips itself when the import is unavailable.
 */
import test from "node:test";
import assert from "node:assert/strict";

const available = await import("@deepseek-ai/dsh-tools")
  .then(() => true)
  .catch(() => false);

const SERP = `
<!doctype html><html><body>
<ol id="b_results">
  <li class="b_algo"><h2><a href="https://example.com/a">Example A</a></h2><p>Alpha snippet</p></li>
  <li class="b_algo"><h2><a href="https://example.com/b">Example B</a></h2><p>Beta snippet</p></li>
</ol>
</body></html>
`.padEnd(600, " ");

/** Minimal fake host context; deliberately has no `web` service. */
function createFakeCtx() {
  const registered = { tools: [] };
  return {
    ctx: {
      tools: {
        register: (definition) => {
          registered.tools.push(definition);
        },
      },
    },
    registered,
  };
}

test("registers exactly one tool named bing_search", { skip: !available }, async () => {
  const { apply, name, inject } = await import("../src/index.js");
  const { ctx, registered } = createFakeCtx();
  apply(ctx, {});
  assert.equal(name, "dsh-simple-bing");
  assert.deepEqual(inject, ["tools"]);
  assert.equal(registered.tools.length, 1);
  assert.equal(registered.tools[0].name, "bing_search");
});

test("the tool rejects an empty query", { skip: !available }, async () => {
  const { apply } = await import("../src/index.js");
  const { ctx, registered } = createFakeCtx();
  apply(ctx, {});
  const tool = registered.tools[0];
  await assert.rejects(() => tool.execute({ query: "   " }), /query is required/);
  await assert.rejects(() => tool.execute({}));
});

test("the tool parses a mocked Bing SERP and wraps it as untrusted", { skip: !available }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(SERP, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  try {
    const { apply } = await import("../src/index.js");
    const { ctx, registered } = createFakeCtx();
    apply(ctx, { maxResults: 2 });
    const tool = registered.tools[0];
    const value = await tool.execute({ query: "example" });
    assert.equal(value.provider, "bing");
    assert.equal(value.query, "example");
    assert.equal(value.sources.length, 2);
    assert.equal(value.sources[0].url, "https://example.com/a");

    const rendered = tool.output.render({ query: "example" }, value);
    assert.equal(rendered[0].type, "text");
    assert.match(rendered[0].text, /<untrusted-web-content>/);
    assert.match(rendered[0].text, /Example A/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
