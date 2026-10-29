/* Spacetime fabric, live: redraws the pencil-line sheet on a canvas and warps it with scroll.
   Same maths as tools/make_art.py (which also writes the static SVG fallback and the params).
   - the sheet drifts at 0.32x scroll; a damped spring driven by scroll velocity drags the mesh
     (bow + stretch) and deepens the gravity wells; starting/stopping a scroll launches a
     gravitational-wave ripple that travels out across the sheet and fades.
   Starts on the first scroll and only renders while something is moving; idles otherwise. Reduced motion / no JS: static SVG. */
(function () {
  var root = document.documentElement, box = document.querySelector('.fabric');
  if (!box || !/\bfx\b/.test(root.className) || !window.requestAnimationFrame) return;
  var P, cv, ctx, y0 = scrollY;
  var TAU = Math.PI * 2, mob = matchMedia('(max-width:700px)'), calm = document.body.classList.contains('post') ? 0.6 : 1;
  var ds = 1, p, s, ox, vw, vh, dpr, T, dz, S, gain, M = 24;   // M: canvas bleed (px) so the CSS float never shows an edge

  function setup() {
    p = mob.matches ? P.m : P.d; vw = innerWidth; vh = innerHeight;
    var sw = mob.matches ? vw : Math.max(vw, 1100); s = sw / p.W; ox = (sw - vw) / 2;
    T = p.H / p.C; dz = T / p.nz; S = Math.sqrt(1 - p.C * p.C);
    gain = calm * (mob.matches ? 0.6 : 1);
    dpr = Math.min(window.devicePixelRatio || 1, mob.matches ? 1.5 : 2);
    ds = mob.matches ? 1.7 : 1;    // vertex step multiplier: fewer vertices on phones
    cv.width = Math.round((vw + 2 * M) * dpr); cv.height = Math.round((vh + 2 * M) * dpr);
    cv.style.width = vw + 2 * M + 'px'; cv.style.height = vh + 2 * M + 'px';
  }

  // ---- state: smoothed velocity -> spring-damped warp amount, plus travelling ripples
  var cost = [], lastY = scrollY, lastT = 0, vel = 0, warp = 0, wv = 0, ripples = [], moving = false, idleSince = 0, raf = 0;

  function wr(w, x, z) {                 // distance to the nearest periodic image of well w
    var z0 = w[1] / p.C, d = z - z0; d -= Math.round(d / T) * T; var dx = x - w[0];
    return Math.sqrt(dx * dx + d * d);
  }
  var deep = 1, now = 0, aw = 0;
  function h(x, z) {
    var d = 0, ws = p.wells, i, w, r, q;
    for (i = 0; i < ws.length; i++) {
      w = ws[i]; r = wr(w, x, z); q = r / w[2];
      d += w[3] * deep * Math.pow(1 + q * q, -0.8) * Math.exp(-Math.pow(r / (3.4 * w[2]), 2));
    }
    d += p.swell * Math.sin(TAU * z / (T / 3) + 1.3 * Math.sin(TAU * x / (p.W * 1.25) + 0.6));
    var wa = p.wave; if (wa[1]) { r = wr(ws[wa[0]], x, z); d += wa[1] * Math.sin(TAU * r / wa[2]) * Math.exp(-r / wa[3]) * Math.min(1, r / wa[2]); }
    if (aw > 0.003) d += aw * 20 * gain * Math.sin(TAU * z / 520 - off / 90 + 0.8 * Math.sin(TAU * x / 1100));   // wave rolling through while moving
    for (i = 0; i < ripples.length; i++) {      // gravitational-wave pulses: a ring travelling outwards
      var R = ripples[i], age = now - R.t, front = age * R.c, dr = Math.sqrt((x - R.x) * (x - R.x) + (z - R.z) * (z - R.z)) - front;
      if (dr < 3 * R.w && dr > -6 * R.w) d += R.a * Math.exp(-age / R.life) * Math.exp(-dr * dr / (2 * R.w * R.w)) * Math.cos(TAU * dr / R.lam);
    }
    return d;
  }
  var off = 0;
  function pt(x, z, out) {
    var px = x + p.shear * Math.sin(TAU * z / (T / 2) + x / (p.W * 0.35)), ws = p.wells, i, w, r;
    for (i = 0; i < ws.length; i++) { w = ws[i]; r = wr(w, x, z); px += (w[0] - x) * 0.12 * Math.exp(-Math.pow(r / (1.6 * w[2]), 2)); }
    var sx = px * s - ox, sy = (z * p.C + h(x, z) * S) * s - off;
    // scroll drag: the sheet lags behind the motion, most in the middle of the screen (pinned at the edges)
    var u = sy / vh; if (u > 0 && u < 1) {
      var bell = Math.sin(Math.PI * u), xn = sx / vw;
      sy += warp * gain * ((44 + 22 * Math.cos(TAU * (xn - 0.5))) * bell + 26 * (u - 0.5));
      sx += warp * gain * 10 * Math.sin(TAU * (xn - 0.5)) * bell * bell;
    }
    out[0] = sx + M; out[1] = sy + M; return out;
  }

  var tmp = [0, 0];
  function line(xa, za, xb, zb, n) {
    for (var j = 0; j <= n; j++) {
      var t = j / n; pt(xa + (xb - xa) * t, za + (zb - za) * t, tmp);
      if (j) ctx.lineTo(tmp[0], tmp[1]); else ctx.moveTo(tmp[0], tmp[1]);
    }
  }
  function draw() {
    off = scrollY * 0.32; aw = Math.min(1, Math.abs(warp)); deep = 1 + 0.5 * aw * gain;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vw + 2 * M, vh + 2 * M);
    ctx.lineWidth = 1; ctx.lineJoin = ctx.lineCap = 'round';
    var pad = 260, z0 = ((off - pad) / s) / p.C, z1 = ((off + vh + pad) / s) / p.C;
    var x0 = (ox - 40) / s - p.sx, x1 = (ox + vw + 40) / s + p.sx, nx = Math.ceil((x1 - x0) / (p.sx * ds));
    var k0 = Math.floor(z0 / dz), k1 = Math.ceil(z1 / dz), k, i;
    for (k = k0; k <= k1; k++) {
      ctx.beginPath(); line(x0, k * dz, x1, k * dz, nx);
      ctx.strokeStyle = 'rgba(26,26,26,' + p.oa[((k % p.nz) + p.nz) % p.nz] + ')'; ctx.stroke();
    }
    var nz = Math.ceil((z1 - z0) / (p.sz * ds));
    for (i = 0; i < p.ov.length; i++) {
      var x = p.off + i * p.gx, sx = x * s - ox; if (sx < -60 || sx > vw + 60) continue;
      ctx.beginPath(); line(x, z0, x, z1, nz); ctx.strokeStyle = 'rgba(26,26,26,' + p.ov[i] + ')'; ctx.stroke();
    }
    // rings and mass dots on every visible copy of each well
    var c0 = Math.floor(z0 / T) - 1, c1 = Math.ceil(z1 / T) + 1, c, g;
    for (c = c0; c <= c1; c++) {
      for (g = 0; g < p.rings.length; g++) {
        var rg = p.rings[g], w = p.wells[rg[0]], wz = w[1] / p.C + c * T;
        if (wz + rg[1] < z0 || wz - rg[1] > z1) continue;
        ctx.beginPath();
        for (var j = 0; j <= 48; j++) { var a = TAU * j / 48; pt(w[0] + rg[1] * Math.cos(a), wz + rg[1] * Math.sin(a), tmp); j ? ctx.lineTo(tmp[0], tmp[1]) : ctx.moveTo(tmp[0], tmp[1]); }
        ctx.globalAlpha = rg[3]; ctx.strokeStyle = rg[2]; ctx.stroke(); ctx.globalAlpha = 1;
      }
      for (g = 0; g < p.wells.length; g++) {
        var wl = p.wells[g], z = wl[1] / p.C + c * T; if (!wl[4] || z < z0 || z > z1) continue;
        pt(wl[0], z, tmp); ctx.beginPath(); ctx.arc(tmp[0], tmp[1], Math.min(4, wl[2] * 0.02 + 1.5), 0, TAU);
        ctx.globalAlpha = 0.6; ctx.fillStyle = wl[4]; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
  }

  function ripple(strength) {               // launch from the well nearest the middle of the screen
    var zc = ((off + vh / 2) / s) / p.C, xc = (ox + vw / 2) / s, best = null, bd = 1e9;
    p.wells.forEach(function (w) { var z0 = w[1] / p.C, d = zc - z0; d -= Math.round(d / T) * T;
      var dd = Math.abs(d) + Math.abs(w[0] - xc) * 0.5; if (dd < bd) { bd = dd; best = [w[0], zc - d]; } });
    if (bd > 1400) best = [xc, zc];
    ripples.push({x: best[0], z: best[1], t: now, c: 0.42, w: 46, lam: 150, life: 1700, a: 26 * strength * gain});
    if (ripples.length > 3) ripples.shift();
  }

  var manual = false;
  function frame(t) {
    raf = 0; now = t; var dt = lastT ? Math.min(64, t - lastT) : 16.7; lastT = t;
    var y = scrollY, raw = (y - lastY) / dt * 16.7; lastY = y;      // px per 60Hz frame
    var was = Math.abs(vel); vel += (raw - vel) * 0.18;
    if (was < 1.5 && Math.abs(vel) > 3) ripple(Math.min(1, Math.abs(vel) / 25));
    if (was > 6 && Math.abs(vel) < 2 && Math.abs(raw) < 0.5) ripple(0.55);
    var target = Math.max(-1, Math.min(1, vel / 28)), k = dt / 16.7;
    wv += ((target - warp) * 0.06 - wv * 0.22) * k; warp += wv * k;     // under-damped spring: gentle overshoot
    ripples = ripples.filter(function (R) { return now - R.t < R.life * 3.2; });
    var q = performance.now(); draw(); cost.push(performance.now() - q); if (cost.length > 600) cost.shift();
    var busy = Math.abs(warp) > 0.002 || Math.abs(wv) > 0.0005 || Math.abs(vel) > 0.05 || ripples.length || Math.abs(raw) > 0;
    if (manual) return busy;
    if (busy) raf = requestAnimationFrame(frame); else { lastT = 0; vel = 0; }
  }
  function kick() { if (!raf && !manual && !document.hidden) raf = requestAnimationFrame(frame); }

  var ready = false;
  function init() {      // lazily, on the first scroll: until then the identical static SVG is on screen, so load stays free
    if (ready) return; ready = true;
    P = JSON.parse(box.getAttribute('data-fab') || 'null'); cv = document.createElement('canvas'); ctx = P && cv.getContext('2d');
    if (!ctx) return;
    cv.className = 'fab-cv'; cv.setAttribute('aria-hidden', 'true'); box.appendChild(cv);
    setup(); off = scrollY * 0.32; draw(); box.classList.add('fab-live'); lastY = y0;
    addEventListener('scroll', kick, {passive: true}); kick();
    addEventListener('resize', function () { setup(); draw(); }, {passive: true});
    mob.addEventListener && mob.addEventListener('change', function () { setup(); draw(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; lastT = 0; } else kick(); });
  }
  addEventListener('scroll', init, {passive: true, once: true});
  window.__fab = {state: function () { return {warp: warp, vel: vel, ripples: ripples.length, running: !!raf}; }, cost: cost,
    // test hook: drive the simulation with explicit time (ms) after scrolling, for frame-exact captures
    step: function (t) { init(); manual = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } return frame(t); }};
})();
