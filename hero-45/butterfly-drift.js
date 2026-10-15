// Butterfly Drift — Originkit component, ported from React to a plain script.
// Sim + shaders are verbatim; only the React shell (props/refs/effect) changed.
(function () {
"use strict";

// The component's own prop defaults, minus vignette (a black edge fade is wrong
// on a white hero — set it back to 100 for the original look).
var CFG = {
    baseColor: "#00DAFF",
    accentColor: "#FFFFFF",
    density: 140,
    size: 60,
    speed: 100,
    flap: 8,
    wander: 100,
    depth: 100,
    blur: 0,
    hover: 200,
    reach: 8,
    vignette: 0,
}

// Selector for the element butterflies must stay off. "" disables the keep-out.
var KEEP_OUT = ".hero-inner"

var MAX_DPR = 2
var MAX_COUNT = 140
var VERTS_PER_BUG = 6
var FLOATS_PER_VERT = 12
var STRIDE = FLOATS_PER_VERT * 4
var TAU = Math.PI * 2

var SPAN = 0.042 // world half-extent of one butterfly at Size 100
var CRUISE = 0.075 // world units per second of forward flight at Speed 50
var FLAP_HZ = 5.5 // wingbeats per second at Flap 50
var PUSH = 2.6 // world units per second squared of flee thrust at Hover 100
var BOB = 0.55 // sideways sway per wingbeat, as a share of cruise
var CLOCK_WRAP = 600

// Corner pairs of the sprite quad, in local units.
var CORNERS = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]

var VERT_SRC = `
attribute vec2 a_corner;
attribute vec2 a_center;
attribute vec2 a_dir;
attribute vec4 a_ext;   // x: half-extent (world)  y: wing fold  z: seed  w: blur (device px)
attribute vec2 a_shade; // x: alpha  y: colour tint

uniform vec2  uHalf;   // world half-extents: (aspect * 0.5, 0.5)
uniform float uPxUnit; // device pixels per world unit

varying vec2  v_local;
varying float v_fold;
varying float v_seed;
varying float v_aa;
varying vec2  v_shade;

void main() {
    v_local = a_corner;
    v_fold = a_ext.y;
    v_seed = a_ext.z;
    v_shade = a_shade;

    // Local +y runs along the heading, local +x across it.
    vec2 right = vec2(a_dir.y, -a_dir.x);
    vec2 world = a_center + (a_corner.x * right + a_corner.y * a_dir) * a_ext.x;

    // Edge softness, in LOCAL units: one device pixel across the sprite, widened
    // by this sprite's depth-of-field term. One local unit is a_ext.x world units.
    float px = max(a_ext.x * uPxUnit, 1.0);
    v_aa = (1.0 + a_ext.w) / px;

    gl_Position = vec4(world / uHalf, 0.0, 1.0);
}
`

var FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 uBase;
uniform vec3 uAccent;

varying vec2  v_local;
varying float v_fold;
varying float v_seed;
varying float v_aa;
varying vec2  v_shade;

float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453123); }

vec2 rot(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Scaled ellipse field: negative inside, roughly metric near the boundary.
float sdEllipse(vec2 p, vec2 c, vec2 r) {
    vec2 q = (p - c) / r;
    return (length(q) - 1.0) * min(r.x, r.y);
}

// A p-norm lobe. p below 2 pulls the ends into points, which is the difference
// between a wing and a disc; p above 2 rounds them off for the hindwing.
float sdLobe(vec2 p, vec2 c, vec2 r, float ang, float e) {
    vec2 q = abs(rot(p - c, -ang) / r) + 1e-4;
    return (pow(pow(q.x, e) + pow(q.y, e), 1.0 / e) - 1.0) * min(r.x, r.y);
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

void main() {
    vec2 p = v_local;
    float fold = max(v_fold, 0.08);

    // The wing pair is mirror symmetric, so it is solved once in a half-space.
    // Dividing x by the fold is the wingbeat: the shape is unchanged, the space
    // it is measured in narrows toward the body as the wings lift.
    vec2 w = vec2(abs(p.x) / fold, p.y);

    // Forewing: a long pointed lobe swept up and out. Hindwing: shorter, round,
    // swept down. Both are seated ON the body so the pair is one wing mass and
    // not two floating blobs.
    float dFore = sdLobe(w, vec2(0.40, 0.28), vec2(0.46, 0.21), 0.60, 1.38);
    float dHind = sdLobe(w, vec2(0.26, -0.24), vec2(0.32, 0.22), -0.80, 2.0);
    // Both lobes taper to a POINT at the hinge, so on their own they meet at one
    // pixel and read as two loose petals. A root oval that both overlap is what
    // makes the pair one wing.
    float dRoot = sdLobe(w, vec2(0.16, 0.01), vec2(0.23, 0.29), 0.0, 2.0);
    float dWing = smin(smin(dFore, dHind, 0.03), dRoot, 0.05);

    float dBody = sdEllipse(p, vec2(0.0, -0.16), vec2(0.030, 0.28));
    dBody = smin(dBody, sdEllipse(p, vec2(0.0, 0.17), vec2(0.048, 0.14)), 0.04);
    dBody = smin(dBody, length(p - vec2(0.0, 0.33)) - 0.042, 0.03);

    vec2 ap = vec2(abs(p.x), p.y);
    float dAnt = sdSeg(ap, vec2(0.02, 0.36), vec2(0.12, 0.57)) - 0.008;
    dAnt = min(dAnt, length(ap - vec2(0.131, 0.593)) - 0.018);

    float aa = v_aa;
    float wingA = 1.0 - smoothstep(-aa, aa, dWing);
    float bodyA = 1.0 - smoothstep(-aa, aa, dBody);
    float antA = 1.0 - smoothstep(-aa, aa, dAnt);

    float cover = max(max(wingA, bodyA), antA * 0.9);
    if (cover < 0.004) discard;

    // The outline must beat the PAGE, not just the wing: an ink close to the
    // background turns a thin dark border into a soft glow and the silhouette
    // stops reading at all.
    vec3 ink = uBase * 0.38;
    vec3 bodyInk = uBase * 0.20;

    // Wing wash runs out from the hinge, so the colour follows the wing rather
    // than the sprite box.
    vec2 hq = w - vec2(0.04, 0.05);
    float rad = length(hq);
    float t = smoothstep(0.16, 0.74, rad);
    vec3 wing = mix(uBase, uAccent, clamp(t * 0.95 + v_shade.y * 0.25 - 0.12, 0.0, 1.0));

    // Veins fan from the hinge; they fade out near it, where they would converge
    // into a single dark knot.
    float va = atan(hq.y, max(hq.x, 1e-4));
    float vein = 1.0 - smoothstep(0.0, 0.06, abs(fract(va * 1.45 + 0.5) - 0.5) * 2.0);
    wing = mix(wing, ink, vein * 0.30 * smoothstep(0.12, 0.45, rad));

    // Dark border, measured on the wing field itself so it follows the outline.
    // It stays THIN: a wide dark band on a dark page reads as a soft glow, not
    // as an outline, and the whole silhouette goes to mush.
    float rim = smoothstep(-0.055, -0.004, dWing);

    // Spots live in the forewing's own unit space, so they cannot drift off it.
    vec2 qf = rot(w - vec2(0.40, 0.28), -0.60) / vec2(0.46, 0.21);
    float spots = 0.0;
    for (int i = 0; i < 2; i++) {
        float fi = float(i);
        float sd = v_seed * 97.0 + fi * 11.0;
        vec2 sc = vec2(-0.30 + 1.05 * hash11(sd), -0.55 + 1.10 * hash11(sd + 4.7));
        spots = max(spots, 1.0 - smoothstep(0.0, 0.06, length(qf - sc) - 0.13));
    }
    spots *= step(dWing, 0.0);

    vec3 col = mix(wing, ink, clamp(rim * 0.9 + spots * 0.5, 0.0, 1.0));
    // A slight cross-span gradient so the mirrored halves do not read as a decal.
    col *= 1.0 + 0.12 * p.x;
    // Folded wings are edge-on to the light.
    col *= mix(0.72, 1.0, fold);

    col = mix(col, bodyInk, bodyA);
    col = mix(col, bodyInk, antA * 0.9);

    float a = cover * v_shade.x;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0) * a, a);
}
`

function makeSwarm() {
    var f = function () { return new Float32Array(MAX_COUNT) }
    var sw = {
        x: f(), y: f(), vx: f(), vy: f(), dx: f(), dy: f(),
        th: f(), ph: f(), k1: f(), k2: f(), rate: f(), spd: f(),
        seed: f(), z: f(), panic: f(),
        order: new Int32Array(MAX_COUNT), ordered: -1, bx: 0, by: 0,
    }
    // Deterministic init: identical on the canvas and in the preview, and
    // identical across probe runs, which a Math.random() seed would not be.
    var s = 0x2f6e2b1 >>> 0
    var rnd = function () {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0
        return s / 4294967296
    }
    for (var i = 0; i < MAX_COUNT; i++) {
        sw.th[i] = rnd() * TAU
        sw.ph[i] = rnd() * TAU
        sw.k1[i] = rnd() * TAU
        sw.k2[i] = rnd() * TAU
        sw.rate[i] = rnd()
        sw.spd[i] = 0.75 + rnd() * 0.5
        sw.seed[i] = rnd()
        // A low-discrepancy depth, not a random one, so ANY prefix of the array
        // still spans the full range — Density draws the first n and must not
        // hand back a swarm that is all far or all near.
        sw.z[i] = (((i + 1) * 0.7320508075688772) % 1)
        sw.dx[i] = Math.cos(sw.th[i])
        sw.dy[i] = Math.sin(sw.th[i])
    }
    return sw
}

// Low-discrepancy placement, so the first frame is already an even scatter.
function place(sw, bx, by) {
    for (var i = 0; i < MAX_COUNT; i++) {
        sw.x[i] = (((i + 1) * 0.6180339887498949) % 1) * 2 * bx - bx
        sw.y[i] = (((i + 1) * 0.41421356237309503) % 1) * 2 * by - by
    }
    sw.bx = bx
    sw.by = by
}

function reorder(sw, n) {
    var idx = []
    for (var i = 0; i < n; i++) idx.push(i)
    idx.sort(function (a, b) { return sw.z[a] - sw.z[b] }) // far first: painter's order
    for (var j = 0; j < n; j++) sw.order[j] = idx[j]
    sw.ordered = n
}

function parseColor(input, fb) {
    if (!input) return fb
    var str = String(input).trim()
    if (str.charAt(0) === "#") {
        var hex = str.slice(1)
        if (hex.length === 3 || hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
        if (hex.length >= 6) {
            var r = parseInt(hex.slice(0, 2), 16)
            var g = parseInt(hex.slice(2, 4), 16)
            var b = parseInt(hex.slice(4, 6), 16)
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r / 255, g / 255, b / 255]
        }
        return fb
    }
    var m = str.match(/[\d.]+/g)
    if (m && m.length >= 3) {
        return [
            Math.min(255, parseFloat(m[0])) / 255,
            Math.min(255, parseFloat(m[1])) / 255,
            Math.min(255, parseFloat(m[2])) / 255,
        ]
    }
    return fb
}

function num(v, fb) { return typeof v === "number" && isFinite(v) ? v : fb }
function clampN(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }

function compile(gl, type, src) {
    var sh = gl.createShader(type)
    if (!sh) return null
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("ButterflyDrift shader:", gl.getShaderInfoLog(sh))
        gl.deleteShader(sh)
        return null
    }
    return sh
}

function start(canvas) {
    var gl = canvas.getContext("webgl", { antialias: false, alpha: true, depth: false })
    if (!gl) {
        console.error("ButterflyDrift: WebGL unavailable")
        return
    }

    var vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC)
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
    if (!vs || !fs) return
    var prog = gl.createProgram()
    if (!prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error("ButterflyDrift link:", gl.getProgramInfoLog(prog))
        return
    }
    gl.useProgram(prog)

    var data = new Float32Array(MAX_COUNT * VERTS_PER_BUG * FLOATS_PER_VERT)
    var buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW)

    var attr = function (name, n, offset) {
        var loc = gl.getAttribLocation(prog, name)
        if (loc < 0) {
            console.error("ButterflyDrift: missing attribute", name)
            return
        }
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE, offset * 4)
    }
    attr("a_corner", 2, 0)
    attr("a_center", 2, 2)
    attr("a_dir", 2, 4)
    attr("a_ext", 4, 6)
    attr("a_shade", 2, 10)

    var locs = {}
    var u = function (name) {
        if (!(name in locs)) locs[name] = gl.getUniformLocation(prog, name)
        return locs[name]
    }

    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    // Premultiplied source-over: the sprites are ordered far to near, so the
    // near ones must occlude rather than sum.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    var v = {
        baseColor: CFG.baseColor,
        accentColor: CFG.accentColor,
        count: Math.round(clampN(num(CFG.density, 34), 4, MAX_COUNT)),
        span: SPAN * (clampN(num(CFG.size, 100), 20, 400) / 100),
        speed: clampN(num(CFG.speed, 50), 0, 100) / 50,
        flap: clampN(num(CFG.flap, 50), 0, 100) / 50,
        wander: clampN(num(CFG.wander, 55), 0, 100) / 100,
        depth: clampN(num(CFG.depth, 60), 0, 100) / 100,
        blur: clampN(num(CFG.blur, 100), 0, 300) / 100,
        hover: clampN(num(CFG.hover, 100), 0, 200) / 100,
        reach: clampN(num(CFG.reach, 30), 0, 100) / 100,
    }

    var sw = makeSwarm()
    var keepEl = document.querySelector(KEEP_OUT)
    var ptr = { x: 0, y: 0, on: 0, onTarget: 0 }
    var raf = 0
    var last = performance.now()
    var clock = 0

    var render = function (now) {
        var dt = Math.min(0.05, (now - last) / 1000)
        last = now

        var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
        var cw = canvas.clientWidth || 1200
        var ch = canvas.clientHeight || 800
        var bw = Math.max(1, Math.round(cw * dpr))
        var bh = Math.max(1, Math.round(ch * dpr))
        if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw
            canvas.height = bh
            gl.viewport(0, 0, bw, bh)
        }

        var aspect = bw / bh
        var halfW = aspect * 0.5
        var margin = v.span * 1.4
        var bx = halfW + margin
        var by = 0.5 + margin

        if (sw.bx === 0) {
            place(sw, bx, by)
        } else if (Math.abs(bx - sw.bx) > sw.bx * 0.02) {
            // Keep the scatter proportional when the frame reshapes, instead
            // of leaving a column of butterflies stranded outside the wrap.
            var kk = bx / sw.bx
            for (var q = 0; q < MAX_COUNT; q++) sw.x[q] *= kk
            sw.bx = bx
        }
        sw.by = by
        if (sw.ordered !== v.count) reorder(sw, v.count)

        // Keep-out box, in world units, so no butterfly overlaps the headline.
        var kx = 0, ky = 0, khw = -1, khh = 0
        if (keepEl) {
            var kr = keepEl.getBoundingClientRect()
            if (kr.width > 0 && cw > 0 && ch > 0) {
                kx = ((kr.left + kr.width * 0.5) / cw - 0.5) * aspect
                ky = 0.5 - (kr.top + kr.height * 0.5) / ch
                khw = kr.width * 0.5 / cw * aspect
                khh = kr.height * 0.5 / ch
            }
        }

        var dts = dt * v.speed
        clock = (clock + dts) % CLOCK_WRAP

        ptr.on += (ptr.onTarget - ptr.on) * (1 - Math.exp(-6 * dt))

        var reachW = Math.max(1e-4, v.reach * 1.0)
        var spread = v.depth
        var cruise = CRUISE * v.speed
        var flapRate = FLAP_HZ * v.flap * v.speed

        var o = 0
        for (var k = 0; k < v.count; k++) {
            var i = sw.order[k]

            var z = sw.z[i]
            var par = 0.65 + 0.55 * z // near butterflies cross the frame faster

            sw.th[i] +=
                (Math.sin(clock * 0.9 + sw.k1[i]) * 0.85 + Math.sin(clock * 2.3 + sw.k2[i]) * 0.5) *
                v.wander *
                3.0 *
                dts

            sw.ph[i] += flapRate * (1 + sw.panic[i] * 1.5) * (0.85 + 0.3 * sw.rate[i]) * TAU * dt
            if (sw.ph[i] > TAU * 1024) sw.ph[i] -= TAU * 1024

            var cs = Math.cos(sw.th[i])
            var sn = Math.sin(sw.th[i])
            var drive = cruise * sw.spd[i] * par
            var thrust = 0.55 + 0.75 * Math.max(0, Math.sin(sw.ph[i]))
            var sway = Math.cos(sw.ph[i]) * drive * BOB
            var wantX = cs * drive * thrust - sn * sway
            var wantY = sn * drive * thrust + cs * sway

            var kv = 1 - Math.exp(-3.5 * dt)
            sw.vx[i] += (wantX - sw.vx[i]) * kv
            sw.vy[i] += (wantY - sw.vy[i]) * kv

            if (ptr.on > 0.001 && v.hover > 0) {
                var ddx = sw.x[i] - ptr.x
                var ddy = sw.y[i] - ptr.y
                var d = Math.sqrt(ddx * ddx + ddy * ddy)
                if (d < reachW) {
                    var f0 = 1 - d / reachW
                    var f = f0 * f0 * ptr.on
                    var inv = 1 / Math.max(d, 1e-4)
                    sw.vx[i] += ddx * inv * PUSH * v.hover * f * dt
                    sw.vy[i] += ddy * inv * PUSH * v.hover * f * dt
                    // Turn the heading outward too, or the butterfly drifts
                    // straight back in once the shove stops.
                    var away = Math.atan2(ddy, ddx)
                    var diff = away - sw.th[i]
                    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
                    sw.th[i] += diff * Math.min(1, f * 7 * dt)
                    if (f > sw.panic[i]) sw.panic[i] = f
                }
            }
            sw.panic[i] *= Math.exp(-1.2 * dt)

            var spd = Math.sqrt(sw.vx[i] * sw.vx[i] + sw.vy[i] * sw.vy[i])
            var maxSpd = drive * (1.8 + 6 * sw.panic[i]) + 1e-6
            if (spd > maxSpd) {
                var sc = maxSpd / spd
                sw.vx[i] *= sc
                sw.vy[i] *= sc
            }

            sw.x[i] += sw.vx[i] * dt
            sw.y[i] += sw.vy[i] * dt

            if (sw.x[i] > bx) sw.x[i] -= 2 * bx
            else if (sw.x[i] < -bx) sw.x[i] += 2 * bx
            if (sw.y[i] > by) sw.y[i] -= 2 * by
            else if (sw.y[i] < -by) sw.y[i] += 2 * by

            // ponytail: axis-aligned box, hard reflect — cheap and it never lets a
            // sprite sit on the text. Swap for a soft repulsor if the bounce shows.
            if (khw > 0) {
                var pad = v.span * 1.5 + 0.012 // widest half-extent, plus a margin
                var ex = khw + pad - Math.abs(sw.x[i] - kx)
                var ey = khh + pad - Math.abs(sw.y[i] - ky)
                if (ex > 0 && ey > 0) {
                    if (ex < ey) {
                        var sgx = sw.x[i] >= kx ? 1 : -1
                        sw.x[i] = kx + sgx * (khw + pad)
                        sw.vx[i] = Math.abs(sw.vx[i]) * sgx
                    } else {
                        var sgy = sw.y[i] >= ky ? 1 : -1
                        sw.y[i] = ky + sgy * (khh + pad)
                        sw.vy[i] = Math.abs(sw.vy[i]) * sgy
                    }
                    sw.th[i] = Math.atan2(sw.vy[i], sw.vx[i])
                }
            }

            // Heading of the drawn sprite follows the actual velocity, damped,
            // so a shove visibly turns the butterfly instead of sliding it.
            var vl = Math.sqrt(sw.vx[i] * sw.vx[i] + sw.vy[i] * sw.vy[i])
            var tx = vl > 1e-5 ? sw.vx[i] / vl : cs
            var ty = vl > 1e-5 ? sw.vy[i] / vl : sn
            var kd = 1 - Math.exp(-9 * dt)
            sw.dx[i] += (tx - sw.dx[i]) * kd
            sw.dy[i] += (ty - sw.dy[i]) * kd
            var dl = Math.sqrt(sw.dx[i] * sw.dx[i] + sw.dy[i] * sw.dy[i]) || 1
            sw.dx[i] /= dl
            sw.dy[i] /= dl

            // A cosine spends most of its time at the extremes, so a raw one leaves half
            // the field edge-on and reading as debris. The power biases the beat open.
            var fold = 0.24 + 0.76 * Math.pow(0.5 + 0.5 * Math.cos(sw.ph[i]), 0.62)
            var half = v.span * (1 + (z - 0.5) * spread * 0.9)
            var far = 1 - z
            var alpha = 1 - spread * 0.6 * far
            var blurPx = v.blur * 4 * far * far * spread

            for (var c = 0; c < VERTS_PER_BUG; c++) {
                data[o] = CORNERS[c * 2]
                data[o + 1] = CORNERS[c * 2 + 1]
                data[o + 2] = sw.x[i]
                data[o + 3] = sw.y[i]
                data[o + 4] = sw.dx[i]
                data[o + 5] = sw.dy[i]
                data[o + 6] = half
                data[o + 7] = fold
                data[o + 8] = sw.seed[i]
                data[o + 9] = blurPx
                data[o + 10] = alpha
                data[o + 11] = sw.seed[i]
                o += FLOATS_PER_VERT
            }
        }

        var base = parseColor(v.baseColor, [0.91, 0.459, 0.169])
        var accent = parseColor(v.accentColor, [1, 0.851, 0.627])
        gl.uniform2f(u("uHalf"), halfW, 0.5)
        gl.uniform1f(u("uPxUnit"), bh)
        gl.uniform3f(u("uBase"), base[0], base[1], base[2])
        gl.uniform3f(u("uAccent"), accent[0], accent[1], accent[2])

        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, o))
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.drawArrays(gl.TRIANGLES, 0, v.count * VERTS_PER_BUG)
        raf = requestAnimationFrame(render)
    }

    // Listened for on the window, not the canvas: the hero content sits on top
    // of the canvas, so a canvas-only listener never sees the pointer.
    var track = function (e) {
        var r = canvas.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return
        // A ratio of clientX against the same rect is zoom independent, which
        // the rect's own width is not.
        var fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
        var fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
        var aspect = canvas.width / Math.max(1, canvas.height)
        ptr.x = (fx - 0.5) * aspect
        ptr.y = 0.5 - fy
        ptr.onTarget = 1
    }
    var onLeave = function () { ptr.onTarget = 0 }

    window.addEventListener("pointermove", track)
    window.addEventListener("pointerdown", track)
    document.addEventListener("pointerleave", onLeave)
    raf = requestAnimationFrame(render)
}

var vig = clampN(num(CFG.vignette, 35), 0, 100) / 100
var canvas = document.getElementById("bd")
if (canvas) {
    if (vig > 0) {
        var d = document.createElement("div")
        d.className = "vignette"
        d.style.background =
            "radial-gradient(120% 100% at 50% 50%, rgba(0,0,0,0) 34%, rgba(0,0,0," + vig.toFixed(3) + ") 100%)"
        canvas.parentNode.appendChild(d)
    }
    start(canvas)
}
})();
