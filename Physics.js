// Lava lamp convection simulation.
//
// Plain ES5 JavaScript (no QML-specific syntax) so it can run both inside
// QML (import "Physics.js" as Physics) and under node for headless testing.
//
// Space: normalized [0,1]x[0,1], y points DOWN (matches shader qt_TexCoord0,
// so y=0 is the top of the screen and y=1 the bottom where the heater is).
// Radii are fractions of screen height; horizontal distances are corrected
// by the aspect ratio so blobs stay circular.
//
// Real lava lamp model: wax blobs sit at the bottom, absorb heat from the
// bulb, become less dense than the surrounding liquid and rise; near the
// top they cool off, become denser and sink again. We simulate that with
// per-blob temperature, a buoyancy force tied to it, viscous drag, soft
// blob-blob repulsion and damped walls.
//
// Liquid behavior: blobs are not rigid spheres. Two blobs that touch while
// moving slowly lose their repulsion against each other (surface tension),
// slide together and coalesce into one — volume, momentum and heat
// conserved. Conversely a large blob moving fast enough pinches off into
// two (the metaball field draws the neck during both). Merge/split
// cooldowns keep the count breathing around the user's target instead of
// oscillating wildly.

var MAX_BLOBS = 32;

// Frequency bands streamed by the audio analysis (cava config ships with
// the plugin and must keep bars = 8 in sync with this).
var AUDIO_BANDS = 8;
var MAX_BANDS = 32;

// Fixed liquid-dynamics timings (seconds), not user-facing.
var MERGE_COOLDOWN = 1.6;
var SPLIT_COOLDOWN = 3.0;

// Default tunables; overridden by the control panel at runtime.
var DEFAULTS = {
    blobCount: 14,       // target blob count (4..MAX_BLOBS); the liquid
                         // breathes around this value via merge/split
    blobSize: 0.085,     // base radius, fraction of screen height
    sizeSpread: 0.55,    // random radius variation (0 = uniform, 1 = wide)
    heatPower: 1.0,      // physics intensity: heater/cooler strength
    buoyancy: 0.55,      // acceleration per unit of temperature imbalance
    drag: 1.6,           // viscous drag (higher = syrupy, slower)
    heaterZone: 0.16,    // bottom fraction where heat is absorbed
    coolerZone: 0.30,    // top fraction where heat radiates away
    repulsion: 4.5,      // soft-sphere push when blobs overlap
    wallDamping: 0.35,   // velocity kept after hitting a wall
    jitter: 0.02,        // lateral wobble to break perfect symmetry
    touch: 1.0,          // pointer interaction strength (0 = cursor ignored)
    mergeThreshold: 0.45, // centers closer than this fraction of r1+r2 -> fuse
    mergeSpeed: 0.35,     // max relative speed for blobs to count as sticky
    splitSpeed: 0.16,     // a blob above target count moving faster than
                          // this (vertically) may pinch off into two
    musicReactivity: 0.5, // how hard the music drives the lamp (0 = off)
    musicDance: 0.5,      // per-blob vibration/glow on their own bands (0 = off)
    musicPunch: 1.0,      // transient launch strength multiplier (kick/snare)
    musicFlash: 1.0,      // transient glow/swell multiplier (render-only)
    musicFloor: 0.15,     // loudness floor: every blob shimmers with a
                          // slice of the overall level, not just its band
    audioBands: 8         // cava band count; the shell ties it to blobCount
};

function createState(config) {
    var p = merge(DEFAULTS, config || {});
    var rng = seededRandom(20260906);
    var blobs = [];
    for (var i = 0; i < p.blobCount; i++) blobs.push(spawnBlob(p, rng));
    return { params: p, blobs: blobs, time: 0,
             pointer: { nx: 0.5, ny: 0.5, x: 0.5 * 16 / 9, y: 0.5, s: 0, target: 0 },
             audio: { bass: 0, level: 0, beat: 0, bands: [] } };
}

function spawnBlob(p, rng) {
    var r = p.blobSize * (1.0 - p.sizeSpread * 0.5 + p.sizeSpread * rng());
    var x = 0.15 + 0.7 * rng();
    // Initial band from the spawn column. It is re-derived from the
    // blob's position every substep (bandAt), so this only paints the
    // very first render before the sim ticks.
    var band = Math.floor(clamp(x, 0, 0.999) * (p.audioBands || AUDIO_BANDS));
    return {
        x: x,
        y: 0.8 + 0.18 * rng(),      // blobs are born pooled at the bottom
        vx: 0,
        vy: 0,
        r: r,
        heat: 0.35 + 0.2 * rng(),   // slightly warm: they start rising soon
        mergeCd: 0,                 // pooled newborns may fuse right away
        splitCd: SPLIT_COOLDOWN,
        band: band,                             // its own frequency to dance on
        phase: rng() * 6.283,                   // desync the sways
        pulse: 0                                // music glow, decays fast
    };
}

// Re-fit the sim when the user changes blob count or size live. Radii are
// NOT re-snapped to their spread targets: the liquid's merge/split history
// is the look, so an existing blob only rescales when the size slider
// itself moved (and count changes just add spawns or drop the newest).
function applyConfig(state, config) {
    var prevSize = state.params.blobSize;
    var p = merge(state.params, config || {});
    state.params = p;
    if (p.blobSize !== prevSize && prevSize > 0) {
        var k = p.blobSize / prevSize;
        for (var i = 0; i < state.blobs.length; i++) state.blobs[i].r *= k;
    }
    var rng = seededRandom(Math.floor(state.time * 1000) + 1);
    while (state.blobs.length < p.blobCount) state.blobs.push(spawnBlob(p, rng));
    state.blobs.length = Math.min(state.blobs.length, p.blobCount);
}

// One integration step. dt in seconds; internally clamped and substepped so
// a stalled frame can never explode the sim.
function step(state, dt, aspect) {
    var p = state.params;
    if (typeof aspect !== "number" || aspect <= 0) aspect = 16 / 9;
    dt = Math.min(Math.max(dt, 0), 1 / 15);
    var sub = dt > 1 / 45 ? 2 : 1;
    var h = dt / sub;
    for (var s = 0; s < sub; s++) substep(state, h, aspect, p);
    state.time += dt;
}

function substep(state, dt, aspect, p) {
    var blobs = state.blobs;
    var n = blobs.length;
    // Music: bass is the burner's flame. The heater scales up with the low
    // bands, so kicks pump energy into the pooled wax exactly like turning
    // the lamp's dial (0 reactivity or silence leaves heat untouched).
    var A = state.audio;
    A.beat = Math.max(0, (A.beat || 0) - dt * 3.5);
    var heat = p.heatPower * (1 + A.bass * A.bass * p.musicReactivity * 2.0);
    var dance = p.musicDance;

    // Cursor presence eases in/out over ~0.2 s so entering or leaving the
    // screen never snaps the wax around; nx (shader space) is rescaled into
    // the aspect-corrected sim domain once per substep.
    var P = state.pointer;
    P.s += (P.target - P.s) * Math.min(1, dt * 5);
    P.x = P.nx * aspect;
    P.y = P.ny;

    // --- per-blob forces ---
    for (var i = 0; i < n; i++) {
        var b = blobs[i];

        // Spatial banding: the screen is a visualizer sliced into one
        // frequency column per band, bass on the left, treble on the
        // right. A blob dances on the column it is over right now, so
        // merges, splits and drift re-band the wax for free.
        b.band = bandAt(b.x, p.audioBands);

        // Heat exchange with the lamp's zones.
        var inHeater = Math.max(0, 1 - Math.abs(1 - b.y) / p.heaterZone); // near y=1
        var inCooler = Math.max(0, 1 - b.y / p.coolerZone);               // near y=0
        b.heat += dt * (0.55 * inHeater - 0.45 * inCooler) * heat;
        b.heat = clamp(b.heat, 0, 1);

        // Buoyancy: hot wax is lighter -> rises (y decreases). The imbalance
        // is measured against the neutral point, so blobs hover mid-lamp
        // while they transition, exactly like the real thing.
        var buoy = (b.heat - 0.5) * p.buoyancy * heat;
        b.vy += -buoy * dt;

        // Viscous drag: lava is thick; velocity decays toward terminal speed.
        var damp = 1 / (1 + p.drag * dt);
        b.vx *= damp;
        b.vy *= damp;

        // Gentle lateral wobble (thermal noise in the liquid).
        b.vx += (Math.random() - 0.5) * p.jitter * dt;

        // Warm finger: the cursor displaces the wax and heats it, so blobs
        // drift away from the pointer and then rise on their own.
        if (p.touch > 0 && P.s > 0.001) {
            var pdx = (b.x - P.x) * aspect, pdy = b.y - P.y;
            var pd2 = pdx * pdx + pdy * pdy, reach = 0.26;
            if (pd2 < reach * reach && pd2 > 1e-9) {
                var pd = Math.sqrt(pd2);
                var infl = (1 - pd / reach) * P.s;
                var stir = p.touch * 0.9 * infl * dt;
                b.vx += pdx / pd * stir;
                b.vy += pdy / pd * stir;
                b.heat = clamp(b.heat + p.touch * 0.3 * infl * dt, 0, 1);
            }
        }

        // Music dance: each blob vibrates, sways and glows on its own
        // frequency band. The band's energy gates a sway whose rate rises
        // with the band index (higher frequencies flicker faster) plus a
        // pinch of white-noise vibration; the glow (pulse) is applied on
        // top of the heat in packUniforms and decays quickly, so the wax
        // flickers with the music instead of sticking hot.
        if (dance > 0 && A.bands && A.bands.length > b.band) {
            // Floor the band energy with a small slice of the overall
            // loudness so quiet-band blobs never go fully dead — but keep
            // it small: overall loudness must not make voice tracks read
            // as bass.
            var e = Math.max(A.bands[b.band], A.level * (p.musicFloor === undefined ? 0.15 : p.musicFloor));
            if (e > 0.01) {
                var rate = 2.5 + b.band * 1.7;
                // Spectral fidelity: scale the force by rate (not rate^2)
                // so the displacement falls as 1/rate — bass blobs wobble
                // big and slow, high blobs flutter small and fast.
                var amp = dance * e * rate * dt * 0.19;
                b.vx += Math.sin(state.time * rate + b.phase) * amp
                      + (Math.random() - 0.5) * amp * 0.15;
                b.vy += Math.cos(state.time * rate * 0.83 + b.phase) * amp * 0.45;
                // Glow eases toward its target (no spiky peaks) and decays.
                var glow = e * dance * 0.4;
                if (glow > b.pulse) b.pulse += (glow - b.pulse) * Math.min(1, dt * 8);
            }
        }
        if (b.pulse > 0) b.pulse -= dt * 1.8;

        if (b.mergeCd > 0) b.mergeCd -= dt;
        if (b.splitCd > 0) b.splitCd -= dt;
    }

    // --- pairwise soft-sphere repulsion, softened by surface tension.
    // Two blobs whose cooldowns have expired and which barely move
    // relative to each other are "sticky": the push between them fades to
    // zero as their centers approach the fuse depth, so they sink into
    // one another instead of resting side by side.
    var fusing = null;   // deepest sticky overlap this substep
    var fDepth = 1e9;
    for (i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
            var a = blobs[i], c = blobs[j];
            var dx = (c.x - a.x) * aspect;
            var dy = c.y - a.y;
            var minD = a.r + c.r;
            var d2 = dx * dx + dy * dy;
            if (d2 > minD * minD || d2 < 1e-9) continue;
            var d = Math.sqrt(d2);
            var sticky = n > 2 && a.mergeCd <= 0 && c.mergeCd <= 0 &&
                         relSpeed(a, c, aspect) < p.mergeSpeed;
            var overlap = (minD - d) / minD;                    // 0..1
            var t = 1.0;
            if (sticky) {
                var fuseD = minD * p.mergeThreshold;
                t = clamp((d - fuseD) / (minD - fuseD), 0, 1);  // 0 at fuse depth
                if (d < fuseD && d < fDepth) { fDepth = d; fusing = [a, c]; }
            }
            var f = p.repulsion * overlap * dt * t;
            var nx = dx / d, ny = dy / d;
            a.vx -= nx * f; a.vy -= ny * f;
            c.vx += nx * f; c.vy += ny * f;
        }
    }

    // --- coalescence: the deepest sticky pair past the fuse depth merges
    if (fusing) {
        coalesce(fusing[0], fusing[1]);
        var dead = blobs.indexOf(fusing[1]);
        if (dead >= 0) blobs.splice(dead, 1);
        n = blobs.length;   // the later passes iterate the new population
    }

    // --- integrate + damped walls ---
    for (i = 0; i < n; i++) {
        b = blobs[i];
        b.x += b.vx * dt / aspect;
        b.y += b.vy * dt;

        if (b.x < b.r) { b.x = b.r; b.vx = -b.vx * p.wallDamping; }
        if (b.x > 1 - b.r) { b.x = 1 - b.r; b.vx = -b.vx * p.wallDamping; }
        if (b.y < b.r) { b.y = b.r; b.vy = -b.vy * p.wallDamping; }
        if (b.y > 1 - b.r) { b.y = 1 - b.r; b.vy = -b.vy * p.wallDamping; }

        // Hard safety clamps: nothing may ever escape the domain or go NaN.
        b.x = clamp(b.x, 0, 1);
        b.y = clamp(b.y, 0, 1);
        b.vx = clamp(b.vx, -1.5, 1.5);
        b.vy = clamp(b.vy, -1.5, 1.5);
    }

    // --- positional relaxation: forces alone let fast blobs tunnel through
    // each other; directly separating overlapping pairs (a fraction per
    // step) keeps a visible gap while still looking soft. Sticky pairs are
    // skipped: they are supposed to sink into each other and fuse.
    for (i = 0; i < n; i++) {
        for (var k = i + 1; k < n; k++) {
            a = blobs[i]; c = blobs[k];
            dx = (c.x - a.x) * aspect;
            dy = c.y - a.y;
            minD = a.r + c.r;
            d2 = dx * dx + dy * dy;
            if (d2 >= minD * minD || d2 < 1e-9) continue;
            if (n > 2 && a.mergeCd <= 0 && c.mergeCd <= 0 &&
                relSpeed(a, c, aspect) < p.mergeSpeed) continue;
            d = Math.sqrt(d2);
            var push = (minD - d) * 0.4 / d;   // separate 40% of the overlap
            var px = dx * push, py = dy * push;
            a.x -= px / aspect / 2; a.y -= py / 2;
            c.x += px / aspect / 2; c.y += py / 2;
            a.x = clamp(a.x, 0, 1); a.y = clamp(a.y, 0, 1);
            c.x = clamp(c.x, 0, 1); c.y = clamp(c.y, 0, 1);
        }
    }

    // --- pinching: below the target count, a big enough blob moving
    // briskly may split in two (asymmetric, like real wax tearing).
    if (blobs.length < p.blobCount) trySplit(state, dt, p);
}

// Flat uniform payload for the metaball shader: 32 * vec4(x, y, r, heat),
// unused slots zeroed (r=0 contributes nothing to the field).
function packUniforms(state) {
    var data = new Float32Array(MAX_BLOBS * 4);
    var p = state.params;
    var A = state.audio || {};
    var dance = p.musicDance || 0;
    var flash = p.musicFlash === undefined ? 1.0 : p.musicFlash;
    var floor = p.musicFloor === undefined ? 0.15 : p.musicFloor;
    var beat = A.beat || 0;
    var beatLo = A.beatLo === undefined ? 0 : A.beatLo;
    var beatHi = A.beatHi === undefined
        ? (A.bands && A.bands.length ? A.bands.length : state.params.audioBands || AUDIO_BANDS) - 1
        : A.beatHi;
    for (var i = 0; i < state.blobs.length; i++) {
        var b = state.blobs[i];
        var rr = b.r;
        // The beat envelope is routed like the kick that set it: the hit's
        // band neighborhood swells and brightens, far bands barely.
        var d = b.band < beatLo ? beatLo - b.band
              : b.band > beatHi ? b.band - beatHi : 0;
        var bw = 1 / (1 + d * d);
        // Music swell: each blob breathes with the energy of its own band
        // — render-only (physics keeps the true r, so merging and splitting
        // are untouched). The slow sine makes it pump instead of just
        // sitting swollen while its band sings.
        if (dance > 0 && A.bands && A.bands.length > b.band) {
            var e = Math.max(A.bands[b.band], A.level * floor);
            if (e > 0.01) {
                var rate = 2.5 + b.band * 1.7;
                var breathe = e * dance * (0.5 + 0.5 * Math.sin(state.time * rate * 0.6 + b.phase)) * 0.8;
                rr = b.r * (1 + breathe + beat * 0.3 * bw * flash);
            }
        } else {
            rr = b.r * (1 + beat * 0.3 * bw * flash);
        }
        data[i * 4] = b.x;
        data[i * 4 + 1] = b.y;
        data[i * 4 + 2] = rr;
        data[i * 4 + 3] = clamp(b.heat + (b.pulse || 0) + beat * 0.15 * bw * flash, 0, 1);
    }
    return data;
}

// ------------------------------------------------------- pointer play

// Feed the cursor position, in shader space (nx, ny in [0,1], y down).
// `active` just means the cursor is over a background window; the strength
// itself eases in and out inside substep.
function setPointer(state, nx, ny, active) {
    var P = state.pointer;
    P.nx = clamp(nx, 0, 1);
    P.ny = clamp(ny, 0, 1);
    P.target = active ? 1 : 0;
}

// A tap on the glass: one-shot radial impulse from the pointer, plus a
// little warmth. aspect keeps the impulse circular on any screen shape
// (defaults to 16:9 like substep).
function poke(state, nx, ny, aspect) {
    setPointer(state, nx, ny, true);
    var p = state.params;
    if (!(p.touch > 0)) return;
    if (typeof aspect !== "number" || aspect <= 0) aspect = 16 / 9;
    var px = clamp(nx, 0, 1) * aspect, py = clamp(ny, 0, 1);
    var blobs = state.blobs;
    for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var dx = (b.x - px) * aspect, dy = b.y - py;
        var d2 = dx * dx + dy * dy, R = 0.3;
        if (d2 < R * R && d2 > 1e-9) {
            var d = Math.sqrt(d2);
            var imp = p.touch * 0.6 * (1 - d / R);
            b.vx += dx / d * imp;
            b.vy += dy / d * imp;
            b.heat = clamp(b.heat + 0.05 * p.touch, 0, 1);
        }
    }
}

// ------------------------------------------------------- music reactivity

// Feed the smoothed analysis values (both 0..1): bass = low-band energy,
// level = overall loudness, bands = per-band energies (array of AUDIO_BANDS
// 0..1 values, low frequencies first). Called per frame by the shell; bass
// drives the heater above, bands drive the per-blob dance, and beatKick
// impulses land on transients.
function setAudio(state, bass, level, bands) {
    var A = state.audio;
    A.bass = clamp(Number(bass) || 0, 0, 1);
    A.level = clamp(Number(level) || 0, 0, 1);
    if (bands && bands.length) {
        A.bands = [];
        for (var i = 0; i < bands.length && i < MAX_BANDS; i++)
            A.bands.push(clamp(Number(bands[i]) || 0, 0, 1));
    } else if (A.bands && A.bands.length) {
        // No bands fed (music off, or glow mode) = the sim must go back to
        // rest, not keep dancing on whatever it last heard.
        A.bands = [];
    }
}

// One-shot on a detected transient: a pulse of heat and an upward shove to
// the wax pooled at the bottom, so the beat visibly launches blobs. The
// impulse is proportional to strength (already scaled by the user's
// reactivity on the shell side) and fades with distance from the heater.
function beatKick(state, strength, loBand, hiBand) {
    var p = state.params;
    var punch = p.musicPunch === undefined ? 1.0 : p.musicPunch;
    var s = clamp(strength, 0, 0.5) * p.musicReactivity * punch;
    if (s <= 0) return;
    var A = state.audio;
    // Route the transient to its frequency neighborhood: loBand..hiBand
    // get the full hit, neighboring bands half, far bands a quarter — a
    // kick lights the bass blobs, a snare the treble ones.
    A.beatLo = loBand || 0;
    A.beatHi = hiBand === undefined
        ? (A.bands && A.bands.length ? A.bands.length : (p.audioBands || AUDIO_BANDS)) - 1
        : hiBand;
    // Envelope for the beat response (swell + flash): peaks on every
    // transient, substep decays it fast so each hit is one pop.
    A.beat = Math.max(A.beat || 0, Math.min(1, s * 2));
    var bands = A.bands;
    var blobs = state.blobs;
    for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var d = b.band < A.beatLo ? A.beatLo - b.band
              : b.band > A.beatHi ? b.band - A.beatHi : 0;
        var w = 1 / (1 + d * d);
        var near = Math.max(0, 1 - Math.abs(1 - b.y) / (p.heaterZone * 3));
        if (near > 0)
            b.heat = clamp(b.heat + s * near * 0.15 * w, 0, 1);
        // Disco pop, band-weighted: in-band blobs leap and flash hardest.
        // Deterministic: the kick SETS the upward velocity instead of
        // adding to it, so the same transient launches a blob the same
        // way whether it was at rest, already rising, or falling.
        var e = Math.max(bands && bands.length > b.band ? bands[b.band] : 0.5, 0.4);
        var k = (s * (0.2 + 0.8 * e) * 1.2 + (near > 0 ? s * near * 0.5 : 0)) * w;
        b.vy = -k;
        var flash = s * (0.4 + 0.6 * e) * w;
        if (flash > (b.pulse || 0)) b.pulse = flash;
    }
}

// The visualizer is spatial: the screen is sliced left-to-right into one
// frequency column per band — bass lives on the left, treble on the
// right, wherever the wax happens to be. Blob x spans 0..1 across the
// full screen width (the shader maps uv.x the same way), so no aspect
// correction here: that would squash every band into the left half.
function bandAt(x, nBands) {
    return Math.floor(clamp(x, 0, 0.999) * (nBands || AUDIO_BANDS));
}

// ------------------------------------------------------- liquid dynamics

// Relative speed of two blobs, in aspect-corrected units per second.
function relSpeed(a, c, aspect) {
    var dvx = (c.vx - a.vx) * aspect;
    var dvy = c.vy - a.vy;
    return Math.sqrt(dvx * dvx + dvy * dvy);
}

// Two blobs become one: volume (r^3), momentum and heat are conserved, so
// the metaball field barely jumps — it reads as wax flowing together.
function coalesce(a, c) {
    var ma = a.r * a.r * a.r, mc = c.r * c.r * c.r, m = ma + mc;
    a.x = (a.x * ma + c.x * mc) / m;
    a.y = (a.y * ma + c.y * mc) / m;
    a.vx = (a.vx * ma + c.vx * mc) / m;
    a.vy = (a.vy * ma + c.vy * mc) / m;
    a.heat = (a.heat * ma + c.heat * mc) / m;
    a.r = Math.pow(m, 1 / 3);
    // The fused blob is bigger, so it reads as bassier: keep the lower of
    // the two bands; the glow pulse passes through as the stronger one.
    a.band = Math.min(a.band, c.band);
    a.pulse = Math.max(a.pulse || 0, c.pulse || 0);
    a.mergeCd = MERGE_COOLDOWN;
    a.splitCd = SPLIT_COOLDOWN;
    return a;
}

// Below the target count, the fastest eligible blob may tear in two.
// Children overlap slightly at birth so the metaball field draws a neck,
// then their small sideways push and differing heat (the outer shell is
// cooler than the core) pull them apart over the next seconds.
function trySplit(state, dt, p) {
    var blobs = state.blobs;
    if (Math.random() > dt * 1.5) return;   // rate-limit: a few per second
    var best = null, bestSpeed = p.splitSpeed;
    for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        if (b.splitCd > 0) continue;
        var speed = Math.abs(b.vy);
        if (speed > bestSpeed) { bestSpeed = speed; best = b; }
    }
    if (!best || blobs.length >= MAX_BLOBS) return;

    // Asymmetric halves of the parent volume.
    var f1 = 0.55 + Math.random() * 0.15;   // 0.55..0.70 of the volume
    var r1 = best.r * Math.pow(f1, 1 / 3);
    var r2 = best.r * Math.pow(1 - f1, 1 / 3);
    var sep = 0.55 * (r1 + r2);             // children start in contact
    var dir = best.vy > 0 ? 1 : -1;         // tear along the motion axis
    var heat = best.heat;

    var b1 = {
        x: clamp(best.x, r1, 1 - r1),
        y: clamp(best.y - dir * sep / 2, r1, 1 - r1),
        vx: best.vx - 0.04, vy: best.vy, r: r1,
        heat: clamp(heat + 0.10, 0, 1),     // the trailing core stays hot
        mergeCd: MERGE_COOLDOWN, splitCd: SPLIT_COOLDOWN,
        band: best.band, phase: best.phase, pulse: best.pulse
    };
    var b2 = {
        x: clamp(best.x, r2, 1 - r2),
        y: clamp(best.y + dir * sep / 2, r2, 1 - r2),
        vx: best.vx + 0.04, vy: best.vy, r: r2,
        heat: clamp(heat - 0.10, 0, 1),
        mergeCd: MERGE_COOLDOWN, splitCd: SPLIT_COOLDOWN,
        // The tear lands on a neighboring band so splits widen the dance.
        band: (best.band + 1 + Math.floor(Math.random() * 2)) % (p.audioBands || AUDIO_BANDS),
        phase: Math.random() * 6.283, pulse: best.pulse
    };

    // Replace the parent with its two children in place.
    var idx = blobs.indexOf(best);
    blobs.splice(idx, 1, b1, b2);
}

// ---------------------------------------------------------------- helpers

function merge(base, extra) {
    var out = {};
    for (var k in base) out[k] = base[k];
    for (k in extra) if (k in base) out[k] = extra[k];
    return out;
}

function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

// Deterministic PRNG so a given config always yields the same lamp.
function seededRandom(seed) {
    var s = seed >>> 0;
    return function () {
        // mulberry32
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Headless testing under node (a no-op inside QML, where `module` is
// undefined and the file is imported as a QML JS library).
if (typeof module !== "undefined" && module.exports)
    module.exports = { MAX_BLOBS: MAX_BLOBS, AUDIO_BANDS: AUDIO_BANDS, MAX_BANDS: MAX_BANDS,
                       DEFAULTS: DEFAULTS,
                       createState: createState, applyConfig: applyConfig,
                       step: step, packUniforms: packUniforms,
                       setPointer: setPointer, poke: poke,
                       setAudio: setAudio, beatKick: beatKick, bandAt: bandAt,
                       clamp: clamp };