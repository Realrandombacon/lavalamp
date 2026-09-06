#version 440
// Metaball renderer for the lava lamp background.
//
// CPU side (Physics.js) simulates the wax blobs and uploads, per frame, a
// std140 uniform block holding 32 vec4(x, y, radius, heat) slots. Field
// function: f(p) = sum(r_i^2 / d_i^2); the surface is the f = 1 iso-line.
// Color follows the locally blended heat: cold wax is deep red, hot wax
// glows orange-yellow, like a classic lamp.

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;     // provided automatically by Qt Quick
    float qt_Opacity;   // provided automatically by Qt Quick
    float uAspect;      // width / height, keeps blobs circular
    float uHue;         // -0.5..0.5 hue rotation of the wax palette
    float uGlow;        // 0..1 ambient glow around the blobs
    float uSat;         // 0..1.5 wax saturation multiplier (theme presets
                        // scale it to their accent's vividness)
    float uBgHueTop;    // -0.5..0.5 hue rotation of the background, top edge
    float uBgHueBottom; // -0.5..0.5 hue rotation of the background, bottom edge
    vec4 blob0;   // x, y, radius, heat
    vec4 blob1;   // x, y, radius, heat
    vec4 blob2;   // x, y, radius, heat
    vec4 blob3;   // x, y, radius, heat
    vec4 blob4;   // x, y, radius, heat
    vec4 blob5;   // x, y, radius, heat
    vec4 blob6;   // x, y, radius, heat
    vec4 blob7;   // x, y, radius, heat
    vec4 blob8;   // x, y, radius, heat
    vec4 blob9;   // x, y, radius, heat
    vec4 blob10;   // x, y, radius, heat
    vec4 blob11;   // x, y, radius, heat
    vec4 blob12;   // x, y, radius, heat
    vec4 blob13;   // x, y, radius, heat
    vec4 blob14;   // x, y, radius, heat
    vec4 blob15;   // x, y, radius, heat
    vec4 blob16;   // x, y, radius, heat
    vec4 blob17;   // x, y, radius, heat
    vec4 blob18;   // x, y, radius, heat
    vec4 blob19;   // x, y, radius, heat
    vec4 blob20;   // x, y, radius, heat
    vec4 blob21;   // x, y, radius, heat
    vec4 blob22;   // x, y, radius, heat
    vec4 blob23;   // x, y, radius, heat
    vec4 blob24;   // x, y, radius, heat
    vec4 blob25;   // x, y, radius, heat
    vec4 blob26;   // x, y, radius, heat
    vec4 blob27;   // x, y, radius, heat
    vec4 blob28;   // x, y, radius, heat
    vec4 blob29;   // x, y, radius, heat
    vec4 blob30;   // x, y, radius, heat
    vec4 blob31;   // x, y, radius, heat
} ubuf;

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)),
                d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// Heat (0..1) -> wax color. Cold = dark molasses red, warm = lava orange,
// hottest = glowing yellow-orange core.
vec3 heatColor(float heat) {
    vec3 cold   = vec3(0.42, 0.07, 0.03);
    vec3 mid    = vec3(0.85, 0.25, 0.04);
    vec3 hot    = vec3(1.00, 0.62, 0.10);
    vec3 col = heat < 0.5 ? mix(cold, mid, heat * 2.0)
                          : mix(mid, hot, (heat - 0.5) * 2.0);
    // uHue rotates the whole palette around the color wheel; uSat scales
    // its vividness so muted theme accents get muted wax.
    vec3 hsv = rgb2hsv(col);
    hsv.x = fract(hsv.x + ubuf.uHue);
    hsv.y = clamp(hsv.y * ubuf.uSat, 0.0, 1.0);
    return hsv2rgb(hsv);
}

void main() {
    vec2 uv = qt_TexCoord0;               // y=0 top, y=1 bottom (heater)

    // --- metaball field + heat blend ---
    float field = 0.0;
    float heatAcc = 0.0;
    { vec4 bl = ubuf.blob0; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob1; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob2; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob3; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob4; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob5; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob6; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob7; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob8; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob9; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob10; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob11; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob12; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob13; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob14; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob15; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob16; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob17; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob18; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob19; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob20; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob21; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob22; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob23; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob24; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob25; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob26; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob27; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob28; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob29; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob30; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    { vec4 bl = ubuf.blob31; if (bl.z > 0.0) { vec2 d = vec2((uv.x - bl.x) * ubuf.uAspect, uv.y - bl.y); float contrib = bl.z * bl.z / (dot(d, d) + 1e-5); field += contrib; heatAcc += contrib * bl.w; } }
    float heat = field > 0.0 ? clamp(heatAcc / field, 0.0, 1.0) : 0.0;

    // --- background: warm dark glass, heat lamp glow at the bottom ---
    float baseT = pow(uv.y, 2.2) * 0.9;   // brighter toward the bottom
    vec3 col = mix(vec3(0.030, 0.006, 0.003), vec3(0.16, 0.035, 0.008), baseT);
    float lampGlow = exp(-pow((uv.y - 1.06) * 3.2, 2.0));
    col += vec3(0.55, 0.16, 0.02) * lampGlow * (0.35 + 0.2 * ubuf.uGlow);

    // Independent top/bottom hue rotation of the background only (the wax
    // has its own uHue). The shift amount itself is interpolated vertically,
    // so the two sliders crossfade smoothly instead of splitting the screen.
    float bgHue = mix(ubuf.uBgHueTop, ubuf.uBgHueBottom, uv.y);
    if (bgHue != 0.0) {
        vec3 bgHsv = rgb2hsv(col);
        bgHsv.x = fract(bgHsv.x + bgHue);
        col = hsv2rgb(bgHsv);
    }

    // --- blob body with a soft molten edge ---
    float body = smoothstep(0.72, 1.06, field);
    // Inner glow: hotter (brighter) toward the blob core.
    float core = clamp(field * 0.5, 0.0, 1.0);
    vec3 wax = heatColor(heat);
    vec3 waxCore = heatColor(min(heat + 0.35, 1.0));
    col = mix(col, wax, body);
    col = mix(col, waxCore, body * core * core * 0.55);

    // --- ambient halo around the wax (uGlow) ---
    float halo = clamp((field - 0.25) * 0.5, 0.0, 1.0) * (1.0 - body);
    col += wax * halo * 0.18 * ubuf.uGlow;

    // Gentle vignette to keep corners deep like a lamp in a dark room.
    vec2 vc = uv - 0.5;
    col *= 1.0 - dot(vc, vc) * 0.55;

    fragColor = vec4(col, 1.0) * ubuf.qt_Opacity;
}