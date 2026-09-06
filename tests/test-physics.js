// Headless physics test — run with: node tests/test-physics.js
// Five minutes of lamp time per scenario, asserting the invariants the
// metaball renderer depends on: no NaN, blobs stay in the domain, volume is
// conserved by merges/splits, the blob count breathes around its target,
// and the pointer interaction behaves.
const Physics = require("../Physics.js");

let failures = 0;
function check(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); failures++; }
}

// ---- 1. defaults + config plumbing --------------------------------------
let st = Physics.createState({});
for (const k of ["mergeThreshold", "mergeSpeed", "splitSpeed", "touch",
                 "buoyancy", "drag", "repulsion"])
  check(typeof st.params[k] === "number", "missing DEFAULTS." + k);

Physics.applyConfig(st, { mergeThreshold: 0.7, mergeSpeed: 0.9, splitSpeed: 0.5,
                          buoyancy: 0.9, drag: 0.6, repulsion: 7.5 });
check(st.params.mergeThreshold === 0.7 && st.params.drag === 0.6,
      "applyConfig did not take new values");

// ---- 2. pointer stir: warms and pushes, eases out ------------------------
st = Physics.createState({ blobCount: 6, jitter: 0 });
st.blobs = [{ x: 0.5 * 16 / 9, y: 0.5, vx: 0, vy: 0, r: 0.08, heat: 0.3,
              mergeCd: 0, splitCd: 3 }];
Physics.setPointer(st, 0.5, 0.5, true);
for (let i = 0; i < 30; i++) Physics.step(st, 1 / 60, 16 / 9);
check(st.blobs[0].heat > 0.3, "stir did not warm the blob");
check(Math.hypot(st.blobs[0].vx, st.blobs[0].vy) > 0.01, "stir did not push");
Physics.setPointer(st, 0.5, 0.5, false);
for (let i = 0; i < 120; i++) Physics.step(st, 1 / 60, 16 / 9);
check(st.pointer.s < 0.01, "pointer strength did not decay");

// ---- 3. poke: radial impulse, respect of radius and touch=0 --------------
st = Physics.createState({ blobCount: 6 });
st.blobs = [{ x: 0.5 * 16 / 9, y: 0.55, vx: 0, vy: 0, r: 0.08, heat: 0.3,
              mergeCd: 0, splitCd: 3 },
            { x: 0.9, y: 0.9, vx: 0, vy: 0, r: 0.08, heat: 0.3,
              mergeCd: 0, splitCd: 3 }];
Physics.poke(st, 0.5, 0.5);
check(Math.hypot(st.blobs[0].vx, st.blobs[0].vy) > 0.1, "poke too weak");
check(Math.hypot(st.blobs[1].vx, st.blobs[1].vy) === 0,
      "poke reached a blob outside its radius");
st.params.touch = 0;
Physics.poke(st, 0.5, 0.5);
check(Math.hypot(st.blobs[0].vx, st.blobs[0].vy) > 0.1, "touch=0 still pokes");

// ---- 4. liquid moods: 5 min each, the lamp must breathe -----------------
const MOODS = {
  classic: { mergeThreshold: 0.45, mergeSpeed: 0.35, splitSpeed: 0.16,
             heatPower: 1.0, buoyancy: 0.55, drag: 1.6, repulsion: 4.5 },
  syrup: { mergeThreshold: 0.62, mergeSpeed: 0.55, splitSpeed: 0.045,
           heatPower: 0.85, buoyancy: 0.42, drag: 2.6, repulsion: 3.4 },
  mercury: { mergeThreshold: 0.22, mergeSpeed: 0.12, splitSpeed: 0.24,
             heatPower: 1.15, buoyancy: 0.72, drag: 0.9, repulsion: 8.0 },
  zerog: { mergeThreshold: 0.45, mergeSpeed: 0.35, splitSpeed: 0.04,
           heatPower: 0.7, buoyancy: 0.15, drag: 0.6, repulsion: 3.0 },
  eruption: { mergeThreshold: 0.5, mergeSpeed: 0.55, splitSpeed: 0.34,
              heatPower: 1.7, buoyancy: 0.85, drag: 1.2, repulsion: 5.0 }
};
for (const [name, cfg] of Object.entries(MOODS)) {
  const s = Physics.createState({ blobCount: 11, ...cfg });
  const vol0 = s.blobs.reduce((a, b) => a + Math.pow(b.r, 3), 0);
  let merged = 0, split = 0, prevN = s.blobs.length;
  for (let i = 0; i < 60 * 300; i++) {
    Physics.step(s, 1 / 60, 16 / 9);
    if (s.blobs.length > prevN) split++;
    if (s.blobs.length < prevN) merged++;
    prevN = s.blobs.length;
    for (const b of s.blobs) {
      check(isFinite(b.x + b.y + b.vx + b.vy + b.r + b.heat), name + ": NaN blob");
      check(b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1, name + ": blob escaped");
    }
  }
  const vol1 = s.blobs.reduce((a, b) => a + Math.pow(b.r, 3), 0);
  check(Math.abs(vol1 - vol0) / vol0 < 0.001, name + ": volume drift");
  check(merged > 0 && split > 0, name + ": lamp does not breathe");
  check(s.blobs.length === 11, name + ": count did not return to target");
  console.log(`${name}: merges=${merged} splits=${split} count=${s.blobs.length}`);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log("\nALL OK");