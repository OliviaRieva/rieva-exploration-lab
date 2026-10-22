import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
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

test("server-renders the lightweight four-laboratory RIEVA home shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>RIEVA — Exploration Systems Laboratory<\/title>/i);
  assert.match(html, /RIEVA/);
  assert.match(html, /Design the journey/);
  assert.match(html, /Choose a laboratory to begin/);
  assert.match(html, /Orbital Flight/);
  assert.match(html, /Black Hole Lab/);
  assert.match(html, /Surface Studio/);
  assert.match(html, /Contact Flight/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("the persistent four-laboratory document has unique element ids", async () => {
  const response = await render();
  const html = await response.text();
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test("includes accessible launch controls and persistent workspace targets", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Skip to (?:<!-- -->)?laboratory choices/);
  assert.match(html, /aria-label="Laboratory sections"/);
  assert.match(html, /aria-controls="orbital-flight"/);
  assert.match(html, /aria-controls="black-hole-laboratory"/);
  assert.match(html, /aria-controls="surface-studio"/);
  assert.match(html, /aria-controls="contact-flight-laboratory"/);
  assert.match(html, /id="orbital-flight" hidden="" tabindex="-1"/);
  assert.match(html, /id="black-hole-laboratory" hidden="" tabindex="-1"/);
  assert.match(html, /id="surface-studio" hidden="" tabindex="-1"/);
  assert.match(html, /id="contact-flight-laboratory" hidden="" tabindex="-1"/);
});

test("defers laboratory implementations from the initial response", async () => {
  const response = await render();
  const html = await response.text();

  assert.doesNotMatch(html, /Shape an orbit\. Interrupt the engine\. Measure what changes\./);
  assert.doesNotMatch(html, /Approach the boundary/);
  assert.doesNotMatch(html, /Protective systems, tailored with intent/);
  assert.doesNotMatch(html, /Put AERIS-X inside the flow/);
  assert.doesNotMatch(html, /SimulatorApp-[\w-]+\.js/);
  assert.doesNotMatch(html, /BlackHoleLab-[\w-]+\.js/);
  assert.doesNotMatch(html, /SurfaceStudio-[\w-]+\.js/);
  assert.doesNotMatch(html, /ContactFlightLab-[\w-]+\.js/);
});

test("build emits one independently loadable client chunk for each laboratory", async () => {
  const assetsUrl = new URL("../dist/client/assets/", import.meta.url);
  const assets = await readdir(assetsUrl);

  assert.ok(assets.some((file) => /^SimulatorApp-.+\.js$/.test(file)));
  assert.ok(assets.some((file) => /^BlackHoleLab-.+\.js$/.test(file)));
  assert.ok(assets.some((file) => /^SurfaceStudio-.+\.js$/.test(file)));
  assert.ok(assets.some((file) => /^ContactFlightLab-.+\.js$/.test(file)));
});

test("home portal retains honest scope and descriptive laboratory launch labels", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Four interactive laboratories/);
  assert.match(html, /Research-informed concepts · Explicit assumptions · No claim of flight certification/);
  assert.match(html, /aria-label="Open Orbital Flight:[^"]+"/);
  assert.match(html, /aria-label="Open Black Hole Lab:[^"]+"/);
  assert.match(html, /aria-label="Open Surface Studio:[^"]+"/);
  assert.match(html, /aria-label="Open Contact Flight:[^"]+"/);
  assert.doesNotMatch(html, /shopping cart|checkout|buy now/i);
});
