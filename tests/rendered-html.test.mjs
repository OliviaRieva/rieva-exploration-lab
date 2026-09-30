import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished Rievastra simulator shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Rievastra — Orbital Mission Laboratory<\/title>/i);
  assert.match(html, /RIEVA\/\/STRA/);
  assert.match(html, /Shape an orbit\. Interrupt the engine\. Measure what changes\./);
  assert.match(html, /Mission inputs/);
  assert.match(html, /Numerical validation/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});
test("includes honest model language and accessible entry points", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Skip to simulator/);
  assert.match(html, /Prograde guidance/);
  assert.match(html, /not an optimizer/i);
  assert.match(html, /Crossing target altitude alone is not circular-orbit insertion/i);
  assert.match(html, /No atmosphere or drag/i);
  assert.match(html, /Export CSV/);
});
