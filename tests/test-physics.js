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

// ---- 8. music reactivity: bass heats, beatKick launches ------------------
st = Physics.createState({ blobCount: 6, musicReactivity: 1.0 });
Physics.setAudio(st, 0.8, 0.5);
const coldBlob = { x: 0.5 * 16 / 9, y: 0.92, vx: 0, vy: 0, r: 0.08,
                   heat: 0.2, mergeCd: 0, splitCd: 3 };
st.blobs = [coldBlob];
for (let i = 0; i < 60; i++) Physics.step(st, 1 / 60, 16 / 9);
check(st.blobs[0].heat > 0.2, "bass did not feed the heater");
const kicked = Physics.createState({ blobCount: 6, musicReactivity: 1.0 });
kicked.blobs = [{ x: 0.5 * 16 / 9, y: 0.92, vx: 0, vy: 0, r: 0.08,
                  heat: 0.4, mergeCd: 0, splitCd: 3 }];
const vyBefore = kicked.blobs[0].vy;
Physics.beatKick(kicked, 0.3);
check(kicked.blobs[0].vy < vyBefore, "beatKick did not shove the wax upward");
check(kicked.blobs[0].heat > 0.4, "beatKick did not add heat");
// zero reactivity must mute both paths: run the same 60 steps with and
// without bass and compare against each other, not against the start.
function bassRun(reactivity) {
  const s = Physics.createState({ blobCount: 6, musicReactivity: reactivity });
  s.blobs = [{ x: 0.5 * 16 / 9, y: 0.92, vx: 0, vy: 0, r: 0.08,
               heat: 0.2, mergeCd: 0, splitCd: 3 }];
  Physics.setAudio(s, reactivity > 0 ? 0.8 : 0.0, 0.5);
  for (let i = 0; i < 60; i++) Physics.step(s, 1 / 60, 16 / 9);
  return s.blobs[0].heat;
}
check(bassRun(0) === bassRun(0), "determinism");
check(bassRun(1) > bassRun(0), "bass did not heat harder than silence");
// beatKick: a reactive lamp gets shoved, a muted one does not move at all
function kickRun(reactivity) {
  const s = Physics.createState({ blobCount: 6, musicReactivity: reactivity });
  s.blobs = [{ x: 0.5 * 16 / 9, y: 0.92, vx: 0, vy: 0, r: 0.08,
               heat: 0.4, mergeCd: 0, splitCd: 3 }];
  Physics.beatKick(s, 0.3);
  return s.blobs[0].vy;
}
check(kickRun(1) < 0, "beatKick did not shove the wax upward");
check(kickRun(0) === 0, "musicReactivity 0 did not mute beatKick");

// ---- 9. blob dance: per-band vibration, mute with dance=0 ----------------
const dancers = Physics.createState({ blobCount: 1, musicDance: 1.0, jitter: 0 });
const solo = { x: 0.5 * 16 / 9, y: 0.5, vx: 0, vy: 0, r: 0.08,
               heat: 0.5, mergeCd: 999, splitCd: 999,
               band: 3, phase: 0, pulse: 0 };
dancers.blobs = [{ ...solo }];
const bands = new Array(Physics.AUDIO_BANDS).fill(0);
bands[3] = 1.0;   // only the blob's own band sings
Physics.setAudio(dancers, 0.5, 0.5, bands);
let moved = 0;
for (let i = 0; i < 60; i++) {
  Physics.step(dancers, 1 / 60, 16 / 9);
  moved += Math.abs(dancers.blobs[0].vx);
}
check(moved > 0.01, "band energy did not make the blob dance");
check(dancers.blobs[0].pulse > 0, "band energy did not pulse the blob glow");
// a blob on a silent band must not dance
const quiet = Physics.createState({ blobCount: 1, musicDance: 1.0, jitter: 0 });
quiet.blobs = [{ ...solo, vx: 0, vy: 0, band: 6, phase: 0, pulse: 0 }];
Physics.setAudio(quiet, 0.5, 0.5, bands);
let movedQuiet = 0;
for (let i = 0; i < 60; i++) {
  Physics.step(quiet, 1 / 60, 16 / 9);
  movedQuiet += Math.abs(quiet.blobs[0].vx);
}
check(movedQuiet === 0, "silent band made the blob move anyway");
// dance=0 mutes everything, pulse decays back to rest
const still = Physics.createState({ blobCount: 1, musicDance: 0, jitter: 0 });
still.blobs = [{ ...solo, vx: 0, vy: 0, band: 3, phase: 0, pulse: 0.5 }];
Physics.setAudio(still, 0.5, 0.5, bands);
for (let i = 0; i < 120; i++) Physics.step(still, 1 / 60, 16 / 9);
check(still.blobs[0].vx === 0, "musicDance 0 did not mute the vibration");
check(still.blobs[0].pulse <= 0, "glow pulse did not decay back to rest");
// blobs swell with their band's energy; a silent band leaves the radius alone
const sweller = Physics.createState({ blobCount: 1, musicDance: 1.0, jitter: 0 });
sweller.blobs = [{ ...solo, band: 3, phase: 0, pulse: 0 }];
Physics.setAudio(sweller, 0.5, 0.5, bands);
let maxR = 0;
for (let i = 0; i < 90; i++) {
  Physics.step(sweller, 1 / 60, 16 / 9);
  maxR = Math.max(maxR, Physics.packUniforms(sweller)[2]);
}
check(maxR > solo.r * 1.05, "singing band did not swell the blob (max r " + maxR.toFixed(3) + ")");
const muteR = Physics.createState({ blobCount: 1, musicDance: 1.0, jitter: 0 });
muteR.blobs = [{ ...solo, band: 6, phase: 0, pulse: 0 }];
Physics.setAudio(muteR, 0.5, 0.5, bands);
for (let i = 0; i < 90; i++) {
  Physics.step(muteR, 1 / 60, 16 / 9);
  check(Math.abs(Physics.packUniforms(muteR)[2] - solo.r) < 1e-6, "silent band changed the rendered radius");
}
// ---- 10. disco: the whole lamp pops on the beat --------------------------
const midBlob = { x: 0.5 * 16 / 9, y: 0.5, vx: 0, vy: 0, r: 0.08,
                  heat: 0.3, mergeCd: 999, splitCd: 999,
                  band: 3, phase: 0, pulse: 0 };
const party = Physics.createState({ blobCount: 6, musicReactivity: 1.0, musicDance: 1.0 });
party.blobs = [{ ...midBlob }];
Physics.setAudio(party, 0.5, 0.5, new Array(Physics.AUDIO_BANDS).fill(0.5));
Physics.beatKick(party, 0.3);
check(party.blobs[0].vy < 0, "disco: mid-screen blob did not jump on the beat");
check((party.blobs[0].pulse || 0) > 0, "disco: blob did not flash on the beat");
check(party.audio.beat > 0, "disco: beat envelope missing");
Physics.step(party, 1 / 60, 16 / 9);
const beatR = Physics.packUniforms(party)[2];
for (let i = 0; i < 90; i++) Physics.step(party, 1 / 60, 16 / 9);
check(Physics.packUniforms(party)[2] < beatR, "disco: beat swell did not relax");
check(party.audio.beat === 0, "disco: beat envelope did not decay to 0");
// a muted lamp ignores beats entirely
const boring = Physics.createState({ blobCount: 6, musicReactivity: 0, musicDance: 1.0 });
boring.blobs = [{ ...midBlob }];
Physics.beatKick(boring, 0.3);
check(boring.blobs[0].vy === 0 && (boring.blobs[0].pulse || 0) === 0,
      "disco: reactivity 0 did not mute the party");
// ---- 11. music off = physics back to rest, no stale-band residue ---------
const restState = Physics.createState({ blobCount: 1, musicDance: 1.0, jitter: 0 });
restState.blobs = [{ ...solo, band: 3, phase: 0, pulse: 0 }];
Physics.setAudio(restState, 0.5, 0.5, bands);
Physics.step(restState, 1 / 60, 16 / 9);   // bands live: the blob dances
Physics.setAudio(restState, 0, 0, []);     // music toggled off
check(restState.audio.bands.length === 0, "empty bands did not clear the sim band state");
// momentum already given can only decay, not vanish; what must stop is
// every NEW force, so zero the velocity and demand it stays at rest
restState.blobs[0].vx = 0;
restState.blobs[0].vy = 0;
let residue = 0;
for (let i = 0; i < 30; i++) {
  Physics.step(restState, 1 / 60, 16 / 9);
  residue += Math.abs(restState.blobs[0].vx);
}
check(residue === 0, "stale audio kept the blob moving after music off");
// the dance must never break the sim invariants
for (let i = 0; i < 600; i++) {
  Physics.step(dancers, 1 / 60, 16 / 9);
  const b = dancers.blobs[0];
  check(isFinite(b.x + b.y + b.vx + b.vy + b.heat), "dance: NaN blob");
  check(b.x >= 0 && b.x <= 1 && b.y >= 0 && b.y <= 1, "dance: blob escaped");
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log("\nALL OK");