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

test("server-renders the complete four-laboratory RIEVA shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>RIEVA — Exploration Systems Laboratory<\/title>/i);
  assert.match(html, /RIEVA/);
  assert.match(html, /Design the journey/);
  assert.match(html, /Choose a laboratory to begin/);
  assert.match(html, /Shape an orbit\. Interrupt the engine\. Measure what changes\./);
  assert.match(html, /Mission inputs/);
  assert.match(html, /Numerical validation/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("the persistent four-laboratory document has unique element ids", async () => {
  const response = await render();
  const html = await response.text();
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test("includes honest model language and accessible entry points", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Skip to (?:<!-- -->)?laboratory choices/);
  assert.match(html, /Prograde guidance/);
  assert.match(html, /not an optimizer/i);
  assert.match(html, /Crossing target altitude alone is not circular-orbit insertion/i);
  assert.match(html, /No atmosphere or drag/i);
  assert.match(html, /Export CSV/);
});

test("server-renders the Black Hole Laboratory and its evidence boundaries", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Black Hole Lab/);
  assert.match(html, /Approach the boundary/);
  assert.match(html, /Kerr spacetime/);
  assert.match(html, /Outer event horizon/);
  assert.match(html, /No invented survival probability/);
  assert.match(html, /not a geodesic integration/i);
  assert.match(html, /Magnetic structure is becoming observable/);
});

test("server-renders the Surface Studio without replacing Orbital Flight", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Orbital Flight/);
  assert.match(html, /Surface Studio/);
  assert.match(html, /Protective systems, tailored with intent\./);
  assert.match(html, /MAX/);
  assert.match(html, /MALTE/);
  assert.match(html, /BASTIAN/);
  assert.match(html, /Required items present/);
  assert.match(html, /UV ≠ ionizing radiation/);
  assert.match(html, /No store/);
  assert.doesNotMatch(html, /shopping cart|checkout|buy now/i);
  assert.match(html, /does not mean safe, certified, integrated, or flight ready/i);
});

test("server-renders the complete Contact Flight laboratory without replacing existing labs", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /Four interactive laboratories/);
  assert.match(html, /Contact Flight/);
  assert.match(html, /Put AERIS-X inside the flow/);
  assert.match(html, /Follow the air, not the flame/);
  assert.match(html, /Resilience without imaginary invincibility/);
  assert.match(html, /No extraterrestrial life or intelligence has been confirmed/);
  assert.match(html, /This is not a flight envelope, CFD solution, or safety clearance/);
  assert.match(html, /does not design weapons, harmful biological agents, blinding systems/i);
  assert.match(html, /Research-informed, not certainty-decorated/);
  assert.match(html, /not an antibiotic shield/i);
  assert.match(html, /Orbital Flight/);
  assert.match(html, /Black Hole Lab/);
  assert.match(html, /Surface Studio/);
});
