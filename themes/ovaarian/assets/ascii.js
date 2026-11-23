/*
 * Ovaar generative ASCII renderer.
 *
 * Every <canvas data-ascii="kind"> becomes a character grid that a scene draws into.
 * Scenes describe a subject (a CI pipeline, cache lines, a dependency graph) rather
 * than decoration. Only panels on screen animate, capped at 20 fps; with
 * prefers-reduced-motion each panel renders one still frame.
 */
(function () {
  'use strict';

  var FPS = 20;
  var RAMP = ' .·:-=+*#%@';
  var DOTS = ' .\u00b7:+*';
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var TAU = Math.PI * 2;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- small utilities ---------- */

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function cellHash(c, r, seed) {
    var h = Math.imul(c * 374761393 + r * 668265263 + seed, 1274126177);
    h ^= h >>> 13;
    return ((h >>> 0) % 10000) / 10000;
  }

  /* ---------- character grid ---------- */

  function Grid(cols, rows, cw, ch) {
    this.cols = cols;
    this.rows = rows;
    this.chars = new Array(cols * rows);
    this.alpha = new Float32Array(cols * rows);
    // Unit space: y runs -1..1 over the panel height, x uses the same scale.
    this.sy = rows / 2;
    this.sx = (rows * ch) / 2 / cw;
    this.aspect = ch / cw;
    this.w = cols / 2 / this.sx; // half-width in units
  }

  Grid.prototype.clear = function () {
    this.chars.fill(' ');
    this.alpha.fill(0);
  };

  Grid.prototype.put = function (c, r, chr, a, force) {
    c = Math.round(c); r = Math.round(r);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return;
    var i = r * this.cols + c;
    if (force || a >= this.alpha[i]) {
      this.alpha[i] = a;
      this.chars[i] = chr;
    }
  };

  Grid.prototype.text = function (c, r, str, a) {
    for (var i = 0; i < str.length; i++) this.put(c + i, r, str[i], a, true);
  };

  Grid.prototype.col = function (x) { return this.cols / 2 + x * this.sx; };
  Grid.prototype.row = function (y) { return this.rows / 2 + y * this.sy; };

  Grid.prototype.slope = function (dc, dr) {
    var ang = Math.atan2(-dr * this.aspect, dc) * 180 / Math.PI;
    ang = ((ang % 180) + 180) % 180;
    if (ang < 22.5 || ang >= 157.5) return '-';
    if (ang < 67.5) return '/';
    if (ang < 112.5) return '|';
    return '\\';
  };

  // Line in cell coordinates. dash = [period, on].
  Grid.prototype.line = function (c0, r0, c1, r1, a, chr, dash) {
    var dc = c1 - c0, dr = r1 - r0;
    var n = Math.max(Math.abs(dc), Math.abs(dr)) | 0;
    if (n === 0) { this.put(c0, r0, chr || '.', a); return; }
    var glyph = chr || this.slope(dc, dr);
    for (var k = 0; k <= n; k++) {
      if (dash && k % dash[0] >= dash[1]) continue;
      this.put(c0 + dc * k / n, r0 + dr * k / n, glyph, a);
    }
  };

  Grid.prototype.box = function (c, r, w, h, a) {
    c = Math.round(c); r = Math.round(r);
    for (var i = 1; i < w - 1; i++) { this.put(c + i, r, '─', a, true); this.put(c + i, r + h - 1, '─', a, true); }
    for (var j = 1; j < h - 1; j++) { this.put(c, r + j, '│', a, true); this.put(c + w - 1, r + j, '│', a, true); }
    this.put(c, r, '┌', a, true); this.put(c + w - 1, r, '┐', a, true);
    this.put(c, r + h - 1, '└', a, true); this.put(c + w - 1, r + h - 1, '┘', a, true);
  };

  function shade(v) {
    return RAMP[clamp(Math.round(v * (RAMP.length - 1)), 0, RAMP.length - 1)];
  }

  function dither(v, c, r, amount) {
    return v + (BAYER[(r & 3) * 4 + (c & 3)] / 16 - 0.5) * amount;
  }

  function rotate(p, ax, ay) {
    var cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    var x = p[0] * cy + p[2] * sy, z = -p[0] * sy + p[2] * cy;
    var y = p[1] * cx - z * sx; z = p[1] * sx + z * cx;
    return [x, y, z];
  }

  /* ---------- scenes ---------- */

  var SCENES = {};

  // Homepage: a lit, dithered sphere with two orbits. Light falls from the upper left.
  SCENES.sphere = {
    init: function (g, rand) {
      var stars = [];
      for (var i = 0; i < 14; i++) stars.push([rand() * g.cols, rand() * g.rows, rand() * TAU]);
      return { stars: stars };
    },
    draw: function (g, t, s, seed) {
      var R = 0.64, ox = 0, rot = t * 0.12;
      var cr = Math.cos(rot), sr = Math.sin(rot);
      for (var r = 0; r < g.rows; r++) {
        var y = (r + 0.5 - g.rows / 2) / g.sy;
        for (var c = 0; c < g.cols; c++) {
          var x = (c + 0.5 - g.cols / 2) / g.sx - ox;
          var d2 = x * x + y * y;
          if (d2 < R * R) {
            var z = Math.sqrt(R * R - d2);
            var nx = x / R, ny = y / R, nz = z / R;
            var light = Math.max(0, -0.62 * nx - 0.5 * ny + 0.6 * nz);
            var tx = nx * cr + nz * sr, tz = -nx * sr + nz * cr;
            var lon = Math.atan2(tx, tz), lat = Math.asin(ny);
            var tex = 0.5 + 0.5 * Math.sin(lon * 5 + Math.sin(lat * 4) * 1.6) * Math.cos(lat * 6 - lon * 2);
            var v = light * 0.9 + tex * 0.22 * (0.3 + light);
            v = dither(v, c, r, 0.42);
            if (v > 0.1) g.put(c, r, DOTS[clamp(Math.round(v * (DOTS.length - 1)), 1, DOTS.length - 1)], 0.3 + 0.7 * clamp(v, 0, 1));
          } else if (cellHash(c, r, seed) < 0.01) {
            g.put(c, r, '.', 0.35);
          }
        }
      }
      // Orbits: tilted circles, hidden where they pass behind the sphere.
      var orbits = [[Math.min(1.02, g.w * 0.94), 0.34, 0.42, 0.25], [Math.min(0.92, g.w * 0.86), -0.5, -0.62, -0.42]];
      for (var o = 0; o < orbits.length; o++) {
        var rad = orbits[o][0], tilt = orbits[o][1], yaw = orbits[o][2], speed = orbits[o][3];
        var prev = null;
        var steps = Math.round(rad * g.sx * 9);
        for (var k = 0; k <= steps; k++) {
          var a = k / steps * TAU;
          var p = rotate([Math.cos(a) * rad, 0, Math.sin(a) * rad], tilt, yaw);
          var px = g.col(p[0] + ox), py = g.row(p[1]);
          var hidden = p[2] < 0 && p[0] * p[0] + p[1] * p[1] < R * R;
          if (prev && !hidden && k % 3 === 0) g.put(px, py, '\u00b7', 0.85);
          prev = [px, py];
        }
        var sa = t * speed + o * 2.1;
        var sp = rotate([Math.cos(sa) * rad, 0, Math.sin(sa) * rad], tilt, yaw);
        if (!(sp[2] < 0 && sp[0] * sp[0] + sp[1] * sp[1] < R * R)) g.put(g.col(sp[0] + ox), g.row(sp[1]), '@', 1, true);
      }
      for (var i = 0; i < s.stars.length; i++) {
        var st = s.stars[i];
        var tw = 0.5 + 0.5 * Math.sin(t * 1.3 + st[2]);
        if (tw > 0.25) g.put(st[0], st[1], '+', 0.3 + 0.6 * tw);
      }
    }
  };

  // CI/CD: a job token travels through the stages; each stage lights while it runs.
  SCENES.pipeline = {
    draw: function (g, t) {
      var names = ['src', 'build', 'test', 'pack', 'ship'];
      var bw = Math.max(7, Math.min(11, Math.floor(g.cols / 8)));
      var gap = 4;
      var n = clamp(Math.floor((g.cols - 4 + gap) / (bw + gap)), 2, names.length);
      var total = n * bw + (n - 1) * gap;
      var c0 = Math.floor((g.cols - total) / 2);
      var r0 = Math.floor(g.rows / 2) - 1;
      var cycle = n * 1.6;
      var p = (t % cycle) / 1.6; // 0..n
      var stage = Math.floor(p), frac = p - stage;
      g.text(2, 1, '>_', 0.9);
      if (Math.floor(t * 2) % 2) g.put(4, 1, '█', 0.7, true);
      for (var i = 0; i < n; i++) {
        var c = c0 + i * (bw + gap);
        var done = i < stage, active = i === stage;
        var a = active ? 1 : done ? 0.75 : 0.35;
        g.box(c, r0 - 1, bw, 3, a);
        var label = names[i].slice(0, bw - 2);
        g.text(c + Math.floor((bw - label.length) / 2), r0, label, a);
        var mark = done ? 'ok' : active ? (frac < 0.5 ? '..' : '...') : '';
        g.text(c + Math.floor((bw - mark.length) / 2), r0 + 2, mark, 0.6);
        if (i < n - 1) {
          var ac = c + bw;
          for (var k = 0; k < gap - 1; k++) g.put(ac + k, r0, '-', 0.45);
          g.put(ac + gap - 1, r0, '>', 0.6);
          if (active && frac > 0.6) g.put(ac + Math.floor((frac - 0.6) / 0.4 * (gap - 1)), r0, '■', 1, true);
        }
      }
      // Run log along the bottom.
      var secs = (stage * 37 + Math.floor(frac * 37)) + 's';
      g.text(2, g.rows - 2, 'job ' + Math.min(stage + 1, n) + '/' + n + '  ' + names[Math.min(stage, n - 1)] + '  ' + secs, 0.5);
    }
  };

  // C++: a perspective cube spinning over a dot lattice.
  SCENES.cube = {
    draw: function (g, t) {
      for (var r = 1; r < g.rows; r += 2) {
        for (var c = 2; c < g.cols; c += 4) g.put(c, r, '.', 0.22);
      }
      var cx = g.cols / 2, cy = g.rows / 2;
      var corners = [[0, 0], [g.cols, 0], [0, g.rows], [g.cols, g.rows]];
      for (var q = 0; q < 4; q++) g.line(cx, cy, corners[q][0], corners[q][1], 0.22, null, [4, 1]);
      var V = [];
      for (var i = 0; i < 8; i++) {
        var p = rotate([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1], t * 0.31 + 0.5, t * 0.47);
        var f = 2.2 / (p[2] + 4.2) * 0.75;
        V.push([g.col(p[0] * f), g.row(p[1] * f), p[2]]);
      }
      var E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (var e = 0; e < E.length; e++) {
        var A = V[E[e][0]], B = V[E[e][1]];
        var depth = 0.55 + 0.45 * clamp(1 - (A[2] + B[2] + 2) / 4, 0, 1);
        g.line(A[0], A[1], B[0], B[1], depth, null, [3, 2]);
      }
      for (var v = 0; v < 8; v++) g.put(V[v][0], V[v][1], '+', 1, true);
    }
  };

  // Performance: the same number of reads, walked in order (top) and at random (bottom).
  // Sequential reads stay in cache lines that are already loaded; random reads keep missing.
  SCENES.memory = {
    init: function (g, rand) {
      var lw = 6, width = Math.max(8, g.cols - lw - 3);
      var band = Math.max(2, Math.floor((g.rows - 6) / 2));
      var N = width * band;
      return { lw: lw, width: width, band: band, N: N, seq: new Float32Array(N), rnd: new Float32Array(N),
        rand: rand, step: 0, sp: 0, hitsS: 0, hitsR: 0, total: 0, lastLine: -1 };
    },
    draw: function (g, t, s) {
      var target = Math.floor(t * 24);
      var budget = 400;
      while (s.step < target && budget-- > 0) {
        for (var i = 0; i < s.N; i++) { s.seq[i] *= 0.93; s.rnd[i] *= 0.93; }
        s.sp = (s.sp + 1) % s.N;
        s.seq[s.sp] = 1;
        var line = Math.floor(s.sp / 8);
        if (line === s.lastLine) s.hitsS++; s.lastLine = line;
        var ri = Math.floor(s.rand() * s.N);
        s.rnd[ri] = 1;
        if (s.rand() < 0.06) s.hitsR++;
        s.total++;
        s.step++;
      }
      s.step = target;
      var bands = [['seq', s.seq, 2], ['rand', s.rnd, 4 + s.band]];
      for (var b = 0; b < 2; b++) {
        var top = bands[b][2], data = bands[b][1];
        g.text(1, top, bands[b][0], 0.8);
        for (var k = 0; k < s.N; k++) {
          var cc = s.lw + (k % s.width), rr = top + Math.floor(k / s.width);
          var h = data[k];
          if (h > 0.05) g.put(cc, rr, h > 0.7 ? '#' : h > 0.3 ? '=' : ':', 0.35 + 0.65 * h);
          else g.put(cc, rr, '.', 0.18);
        }
      }
      var pct = function (h) { return s.total ? Math.round(h / s.total * 100) + '%' : '-'; };
      g.text(s.lw, 1, 'cache hits ' + pct(s.hitsS), 0.55);
      g.text(s.lw, 3 + s.band, 'cache hits ' + pct(s.hitsR), 0.55);
    }
  };

  // Agents and dependencies: a hub with nodes; messages travel along the edges.
  SCENES.graph = {
    init: function (g, rand) {
      var n = clamp(Math.round(g.cols / 9), 6, 13);
      var nodes = [[0, 0]];
      var tries = 0;
      while (nodes.length < n && tries++ < 400) {
        var p = [(rand() * 2 - 1) * g.w * 0.86, (rand() * 2 - 1) * 0.78];
        var ok = true;
        for (var j = 0; j < nodes.length; j++) {
          var dx = nodes[j][0] - p[0], dy = nodes[j][1] - p[1];
          if (dx * dx + dy * dy < 0.12) { ok = false; break; }
        }
        if (ok) nodes.push(p);
      }
      var edges = [];
      for (var i = 1; i < nodes.length; i++) {
        var best = 0, bd = Infinity;
        for (var k = 0; k < i; k++) {
          var ex = nodes[k][0] - nodes[i][0], ey = nodes[k][1] - nodes[i][1], d = ex * ex + ey * ey;
          if (d < bd) { bd = d; best = k; }
        }
        edges.push([best, i, rand() * TAU, 0.25 + rand() * 0.35]);
        if (rand() < 0.3 && best !== 0) edges.push([0, i, rand() * TAU, 0.2 + rand() * 0.3]);
      }
      return { nodes: nodes, edges: edges };
    },
    draw: function (g, t, s) {
      for (var e = 0; e < s.edges.length; e++) {
        var E = s.edges[e], A = s.nodes[E[0]], B = s.nodes[E[1]];
        var ac = g.col(A[0]), ar = g.row(A[1]), bc = g.col(B[0]), br = g.row(B[1]);
        g.line(ac, ar, bc, br, 0.3, '.', [2, 1]);
        var phase = (t * E[3] + E[2] / TAU) % 1;
        if (Math.sin(t * 0.6 + E[2]) > -0.2) {
          var f = phase;
          g.put(ac + (bc - ac) * f, ar + (br - ar) * f, '*', 1, true);
          g.put(ac + (bc - ac) * Math.max(0, f - 0.04), ar + (br - ar) * Math.max(0, f - 0.04), '·', 0.6);
        }
      }
      for (var i = 0; i < s.nodes.length; i++) {
        var c = g.col(s.nodes[i][0]), r = g.row(s.nodes[i][1]);
        if (i === 0) { g.text(Math.round(c) - 1, Math.round(r), '(@)', 1); }
        else {
          var pulse = 0.55 + 0.45 * Math.max(0, Math.sin(t * 1.1 + i));
          g.text(Math.round(c) - 1, Math.round(r), '[o]', pulse);
        }
      }
    }
  };

  // 3D: a rotating torus wireframe, depth shown as brightness.
  SCENES.mesh = {
    draw: function (g, t) {
      var U = 20, Vn = 10, R = 1, r = 0.42, sc = 0.68;
      var P = [];
      for (var i = 0; i < U; i++) {
        var row = [];
        for (var j = 0; j < Vn; j++) {
          var u = i / U * TAU, v = j / Vn * TAU;
          var p = [(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)];
          p = rotate(p, 0.9 + Math.sin(t * 0.2) * 0.3, t * 0.35);
          var f = 3 / (p[2] + 3.6) * sc;
          row.push([g.col(p[0] * f), g.row(p[1] * f), p[2]]);
        }
        P.push(row);
      }
      for (var a = 0; a < U; a++) {
        for (var b = 0; b < Vn; b++) {
          var A = P[a][b], B = P[(a + 1) % U][b], C = P[a][(b + 1) % Vn];
          var d1 = 0.25 + 0.75 * clamp(1 - (A[2] + B[2] + 3) / 6, 0, 1);
          var d2 = 0.25 + 0.75 * clamp(1 - (A[2] + C[2] + 3) / 6, 0, 1);
          g.line(A[0], A[1], B[0], B[1], d1);
          g.line(A[0], A[1], C[0], C[1], d2 * 0.8);
        }
      }
      for (var x = 0; x < U; x++) for (var y = 0; y < Vn; y += 2) {
        var q = P[x][y];
        if (q[2] < 0) g.put(q[0], q[1], '+', 1, true);
      }
    }
  };

  // Linux and containers: packets streaming between two endpoints on parallel lanes.
  SCENES.flow = {
    init: function (g, rand) {
      var lanes = [];
      for (var r = 2; r < g.rows - 1; r += 2) {
        var packets = [];
        var count = 1 + Math.floor(rand() * 3);
        for (var k = 0; k < count; k++) packets.push([rand(), 3 + Math.floor(rand() * 4)]);
        lanes.push({ row: r, speed: 0.05 + rand() * 0.09, packets: packets, dir: rand() < 0.75 ? 1 : -1 });
      }
      return { lanes: lanes };
    },
    draw: function (g, t, s) {
      var left = 3, right = g.cols - 4, span = right - left;
      for (var i = 0; i < s.lanes.length; i++) {
        var L = s.lanes[i];
        g.put(left - 2, L.row, '│', 0.7); g.put(right + 2, L.row, '│', 0.7);
        for (var c = left; c <= right; c += 2) g.put(c, L.row, '·', 0.2);
        for (var k = 0; k < L.packets.length; k++) {
          var P = L.packets[k];
          var f = (P[0] + t * L.speed) % 1;
          var head = L.dir > 0 ? left + f * span : right - f * span;
          for (var j = 0; j < P[1]; j++) g.put(head - j * L.dir, L.row, j === 0 ? '■' : '=', 1 - j / (P[1] + 1), true);
          for (var tr = P[1]; tr < P[1] + 4; tr++) g.put(head - tr * L.dir, L.row, '-', 0.35 - (tr - P[1]) * 0.07);
        }
      }
    }
  };

  // Default: a slow flow field, shaded and dithered.
  SCENES.field = {
    init: function (g, rand) {
      return { ph: [rand() * TAU, rand() * TAU, rand() * TAU, rand() * TAU] };
    },
    draw: function (g, t, s) {
      var ph = s.ph;
      for (var r = 0; r < g.rows; r++) {
        var y = (r - g.rows / 2) / g.sy;
        for (var c = 0; c < g.cols; c++) {
          var x = (c - g.cols / 2) / g.sx;
          var v = Math.sin(x * 2.1 + ph[0] + t * 0.35) * Math.sin(y * 3.3 + ph[1] - t * 0.25)
            + Math.sin((x + y) * 1.7 + ph[2] + t * 0.2) * 0.6
            + Math.sin(Math.sqrt(x * x * 4 + y * y * 9) * 3 - t * 0.8 + ph[3]) * 0.4;
          v = (v + 2) / 4;
          v = dither(v * v * 1.2, c, r, 0.3);
          if (v > 0.3) g.put(c, r, shade(clamp(v * 0.8, 0, 1)), 0.15 + 0.7 * clamp(v - 0.3, 0, 1));
        }
      }
    }
  };

  /* ---------- panel lifecycle ---------- */

  var panels = [];
  var visible = new Set();
  var running = false;
  var last = 0;
  var start = performance.now();

  function Panel(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.kind = SCENES[canvas.dataset.ascii] ? canvas.dataset.ascii : 'field';
    this.scene = SCENES[this.kind];
    this.seed = hash((canvas.dataset.seed || '') + this.kind);
    this.cell = parseFloat(canvas.dataset.cell) || 12;
    this.offset = (this.seed % 1000) / 37;
    this.resize();
  }

  Panel.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = rect.width; this.h = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    var ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.font = this.cell + 'px "IBM Plex Mono", ui-monospace, Menlo, monospace';
    ctx.font = this.font;
    this.cw = ctx.measureText('M').width;
    this.ch = Math.round(this.cell * 1.2);
    var cols = Math.max(4, Math.floor(rect.width / this.cw));
    var rows = Math.max(4, Math.floor(rect.height / this.ch));
    this.grid = new Grid(cols, rows, this.cw, this.ch);
    this.state = this.scene.init ? this.scene.init(this.grid, rng(this.seed)) : {};
    this.ox = (rect.width - cols * this.cw) / 2;
    this.oy = (rect.height - rows * this.ch) / 2;
  };

  Panel.prototype.draw = function (t) {
    var g = this.grid;
    if (!g) return;
    g.clear();
    this.scene.draw(g, t + this.offset, this.state, this.seed);
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = this.font;
    ctx.textBaseline = 'top';
    ctx.fillStyle = getComputedStyle(this.canvas).color;
    for (var r = 0; r < g.rows; r++) {
      for (var c = 0; c < g.cols; c++) {
        var i = r * g.cols + c, a = g.alpha[i];
        if (a < 0.03 || g.chars[i] === ' ') continue;
        ctx.globalAlpha = a > 1 ? 1 : a;
        ctx.fillText(g.chars[i], this.ox + c * this.cw, this.oy + r * this.ch);
      }
    }
    ctx.globalAlpha = 1;
  };

  function still(p) { p.draw(9); }

  function tick(now) {
    if (!visible.size || reduced.matches) { running = false; return; }
    requestAnimationFrame(tick);
    if (now - last < 1000 / FPS) return;
    last = now;
    var t = (now - start) / 1000;
    visible.forEach(function (p) { p.draw(t); });
  }

  function run() {
    if (running || reduced.matches || !visible.size) return;
    running = true;
    requestAnimationFrame(tick);
  }

  function setup() {
    var canvases = document.querySelectorAll('canvas[data-ascii]');
    if (!canvases.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var p = en.target.__panel;
        if (en.isIntersecting) { visible.add(p); still(p); } else visible.delete(p);
      });
      run();
    }, { rootMargin: '80px' });
    var ro = new ResizeObserver(function (entries) {
      entries.forEach(function (en) {
        var p = en.target.__panel;
        p.resize();
        still(p);
      });
    });
    canvases.forEach(function (cv) {
      var p = new Panel(cv);
      cv.__panel = p;
      panels.push(p);
      io.observe(cv);
      ro.observe(cv);
    });
    reduced.addEventListener('change', function () {
      panels.forEach(still);
      run();
    });
    // Glyph colour follows the theme toggle.
    new MutationObserver(function () { panels.forEach(function (p) { still(p); }); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function boot() {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('12px "IBM Plex Mono"').then(setup, setup);
    } else {
      setup();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
