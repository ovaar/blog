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

  // A small configurable product as named parts (base, column, arm), each an axis-aligned box
  // [x, y, z, half-x, half-y, half-z, dbId]. Shared by the SVF-to-glTF scenes below.
  var PRODUCT = [
    [0, 0.42, 0, 0.9, 0.16, 0.55, 1042],
    [-0.45, -0.18, 0, 0.16, 0.45, 0.16, 1043],
    [0.08, -0.6, 0, 0.6, 0.1, 0.12, 1044]
  ];

  // Projects the 8 corners of a box and draws its 12 edges. Returns the projected centre.
  function wireBox(g, b, ax, ay, ox, sc, a, dash) {
    var V = [];
    for (var i = 0; i < 8; i++) {
      var p = rotate([b[0] + ((i & 1) ? b[3] : -b[3]), b[1] + ((i & 2) ? b[4] : -b[4]), b[2] + ((i & 4) ? b[5] : -b[5])], ax, ay);
      var f = 3 / (p[2] + 4) * sc;
      V.push([g.col(ox + p[0] * f), g.row(p[1] * f)]);
    }
    var E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (var e = 0; e < E.length; e++) g.line(V[E[e][0]][0], V[E[e][0]][1], V[E[e][1]][0], V[E[e][1]][1], a, null, dash);
    for (var q = 0; q < 8; q++) g.put(V[q][0], V[q][1], '+', Math.min(1, a + 0.2), true);
    var cp = rotate([b[0], b[1], b[2]], ax, ay), cf = 3 / (cp[2] + 4) * sc;
    return [g.col(ox + cp[0] * cf), g.row(cp[1] * cf)];
  }

  // SVF to glTF: the same model rendered twice, side by side. Same parts, same tree, same shape.
  SCENES.twin = {
    draw: function (g, t) {
      // Sway rather than spin: edge-on views turn a wireframe into noise.
      var ax = 0.22, ay = 0.55 + Math.sin(t * 0.25) * 0.35;
      var sc = Math.min(0.62, g.w * 0.42);
      var half = g.w / 2;
      for (var r = 1; r < g.rows - 1; r += 2) g.put(g.cols / 2, r, '┊', 0.3);
      var sides = [['svf', -half], ['gltf', half]];
      for (var s = 0; s < 2; s++) {
        for (var k = 0; k < PRODUCT.length; k++) wireBox(g, PRODUCT[k], ax, ay, sides[s][1], sc, 0.45 + k * 0.2, null);
        var lc = Math.round(g.col(sides[s][1]) - sides[s][0].length / 2);
        g.text(lc, 1, sides[s][0], 0.9);
      }
      var note = g.cols > 40 ? 'nodes 3 = 3   materials 2 = 2' : 'nodes 3 = 3';
      g.text(Math.round((g.cols - note.length) / 2), g.rows - 2, note, 0.55);
    }
  };

  // Object ids survive conversion: hover walks over the parts; each one's _ID attribute resolves to its dbId.
  SCENES.ids = {
    draw: function (g, t) {
      var ax = 0.22, ay = 0.55 + Math.sin(t * 0.15) * 0.3;
      var sc = Math.min(0.78, g.w * 0.55);
      var hot = Math.floor(t / 2.4) % PRODUCT.length;
      var centre = null;
      for (var k = 0; k < PRODUCT.length; k++) {
        var on = k === hot;
        var c = wireBox(g, PRODUCT[k], ax, ay, 0, sc, on ? 1 : 0.3, on ? null : [3, 2]);
        if (on) centre = c;
      }
      var id = PRODUCT[hot][6];
      var pulse = 0.6 + 0.4 * Math.sin(t * 3);
      g.put(centre[0] + 1, centre[1] + 1, '↖', pulse, true);
      var tag = '_ID ' + id;
      g.text(Math.min(g.cols - tag.length - 1, Math.round(centre[0]) + 3), Math.round(centre[1]) + 1, tag, 0.9);
      var line = g.cols > 44 ? 'hover → _ID ' + id + ' → dbId ' + id + ' → select' : '_ID ' + id + ' → dbId ' + id;
      g.text(Math.round((g.cols - line.length) / 2), g.rows - 2, line, 0.6);
    }
  };

  // Units: read the unit and convert once to metres. Millimetres and inches land on the same size;
  // a model without a unit stays dimensionless instead of being guessed.
  SCENES.units = {
    draw: function (g, t) {
      var cases = [
        ['mm', '1200 mm × 0.001', '1.200 m'],
        ['in', '47.24 in × 0.0254', '1.200 m'],
        ['none', '1200, no unit', 'stays 1200']
      ];
      var i = Math.floor(t / 3) % cases.length, k = cases[i];
      var unknown = k[0] === 'none';
      var len = Math.min(g.cols - 8, Math.max(16, Math.round(g.cols * 0.6)));
      var c0 = Math.round((g.cols - len) / 2), r0 = Math.round(g.rows / 2) - 2;
      // The part: a long plate, dashed when its real size is unknown.
      g.box(c0, r0, len, 3, unknown ? 0.35 : 0.9);
      if (unknown) for (var c = c0 + 1; c < c0 + len - 1; c += 2) g.put(c, r0 + 1, '?', 0.25);
      // Dimension line under it.
      var dr = r0 + 4;
      g.put(c0, dr, '|', 0.7, true); g.put(c0 + len - 1, dr, '|', 0.7, true);
      g.line(c0 + 1, dr, c0 + len - 2, dr, 0.45, '-');
      g.text(Math.round(c0 + (len - k[2].length) / 2), dr, k[2], unknown ? 0.6 : 1);
      g.text(2, 1, 'unit: ' + k[0], 0.9);
      if (g.cols > 30) g.text(g.cols - k[1].length - 2, 1, k[1], 0.5);
      for (var j = 0; j < cases.length; j++) g.put(g.cols / 2 - 2 + j * 2, g.rows - 2, j === i ? '●' : '·', j === i ? 0.9 : 0.35, true);
    }
  };

  // Agentic coding, before and after. Before: one large change crawls from me to merge.
  // After: I write the rules; agents ship small PRs, and a critic and CI reject some before merge.
  SCENES.handoff = {
    draw: function (g, t) {
      var lanes = [
        { label: 'before', y: Math.round(g.rows * 0.3), st: ['me', 'code', 'review', 'merge'], speed: 0.05, n: 1, size: 5 },
        { label: 'after', y: Math.round(g.rows * 0.72), st: ['rules', 'agent', 'critic', 'ci', 'merge'], speed: 0.16, n: 4, size: 1 }
      ];
      var left = g.cols > 40 ? 9 : 2, right = g.cols - 3;
      for (var l = 0; l < lanes.length; l++) {
        var L = lanes[l], m = L.st.length, span = right - left;
        if (g.cols > 40) g.text(1, L.y, L.label, 0.5);
        else g.text(left, L.y - 3, L.label, 0.5);
        for (var c = left; c <= right; c += 2) g.put(c, L.y, '·', 0.2);
        var xs = [];
        for (var s = 0; s < m; s++) {
          var x = Math.round(left + span * s / (m - 1));
          xs.push(x);
          var name = L.st[s];
          g.put(x, L.y, '┼', 0.6, true);
          g.text(clamp(x - Math.floor(name.length / 2), 0, g.cols - name.length), L.y - 1, name, 0.65);
        }
        for (var k = 0; k < L.n; k++) {
          var f = (t * L.speed + k / L.n) % 1;
          var head = left + f * span;
          // The critic (after-lane, station 2) rejects every third PR.
          var rejected = l === 1 && (Math.floor(t * L.speed + k / L.n) * L.n + k) % 3 === 0;
          if (rejected && head > xs[2]) {
            if (head < xs[2] + 3) g.put(xs[2], L.y + 1, 'x', 0.9, true);
            continue;
          }
          for (var j = 0; j < L.size; j++) if (head - j >= left) g.put(head - j, L.y, '■', 1 - j * 0.12, true);
        }
      }
    }
  };

  /* ---------- boolean operations (CSG) ----------
   * Three figures for the CSG post. Inside an article figure they are interactive: the reader
   * drags the handle (shape B or the probe) and picks options from buttons the panel adds
   * under the canvas. Elsewhere (post panel, gallery) they animate through the same states.
   */

  var CSG_OPS = [['union', 'A ∪ B'], ['intersect', 'A ∩ B'], ['subtract', 'A − B']];
  var CSG_FORMULA = { union: 'min(a, b)', intersect: 'max(a, b)', subtract: 'max(a, -b)' };

  function cross2(ax, ay, bx, by) { return ax * by - ay * bx; }

  // Signed distances, negative inside.
  function sdCircle(x, y, cx, cy, r) { return Math.hypot(x - cx, y - cy) - r; }
  function sdBox(x, y, cx, cy, h) {
    var qx = Math.abs(x - cx) - h, qy = Math.abs(y - cy) - h;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  }
  function csgDist(op, a, b) {
    return op === 'union' ? Math.min(a, b) : op === 'intersect' ? Math.max(a, b) : Math.max(a, -b);
  }
  function csgKeep(op, inA, inB) {
    return op === 'union' ? inA || inB : op === 'intersect' ? inA && inB : inA && !inB;
  }

  function polygon(n, r, cx, cy, rot) {
    var P = [];
    for (var i = 0; i < n; i++) P.push([cx + r * Math.cos(rot + i * TAU / n), cy + r * Math.sin(rot + i * TAU / n)]);
    return P;
  }
  function starPolygon(n, R, r, cx, cy) {
    var P = [];
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, d = i % 2 ? r : R;
      P.push([cx + d * Math.cos(a), cy + d * Math.sin(a)]);
    }
    return P;
  }

  // Crossing test along a ray from (px, py) in direction (dx, dy). Every vertex is moved into the
  // ray's frame; an edge counts when its ends lie on different sides of the ray (half-open), so a
  // ray through a vertex is counted once and a ray grazing a tip is counted zero or two times.
  function rayCrossings(px, py, dx, dy, P) {
    var hits = [];
    for (var i = 0; i < P.length; i++) {
      var A = P[i], B = P[(i + 1) % P.length];
      var ax = (A[0] - px) * dx + (A[1] - py) * dy, ay = -(A[0] - px) * dy + (A[1] - py) * dx;
      var bx = (B[0] - px) * dx + (B[1] - py) * dy, by = -(B[0] - px) * dy + (B[1] - py) * dx;
      if ((ay > 0) === (by > 0)) continue;
      var s = ax + (0 - ay) * (bx - ax) / (by - ay);
      if (s > 0) hits.push(s);
    }
    hits.sort(function (u, v) { return u - v; });
    return hits;
  }
  function insidePoly(x, y, P) { return rayCrossings(x, y, 1, 0, P).length % 2 === 1; }

  // Cuts the outline of P wherever it crosses the outline of Q and groups the cut edges into
  // pieces: runs of outline between two crossings. Each piece is classified against Q.
  function splitOutline(P, Q) {
    var frags = [], crossings = [];
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ey = b[1] - a[1];
      var ts = [];
      for (var j = 0; j < Q.length; j++) {
        var c = Q[j], d = Q[(j + 1) % Q.length], fx = d[0] - c[0], fy = d[1] - c[1];
        var den = cross2(ex, ey, fx, fy);
        if (Math.abs(den) < 1e-12) continue;
        var wx = c[0] - a[0], wy = c[1] - a[1];
        var t = cross2(wx, wy, fx, fy) / den, u = cross2(wx, wy, ex, ey) / den;
        if (t > 0 && t < 1 && u >= 0 && u < 1) ts.push(t);
      }
      ts.sort(function (u, v) { return u - v; });
      var prev = 0, cut = false;
      for (var k = 0; k <= ts.length; k++) {
        var tk = k < ts.length ? ts[k] : 1;
        frags.push({ a: [a[0] + ex * prev, a[1] + ey * prev], b: [a[0] + ex * tk, a[1] + ey * tk], cut: cut });
        if (k < ts.length) { crossings.push([a[0] + ex * tk, a[1] + ey * tk]); cut = true; }
        else cut = false;
        prev = tk;
      }
    }
    var start = 0;
    for (var f = 0; f < frags.length; f++) if (frags[f].cut) { start = f; break; }
    var pieces = [], cur = null;
    for (var n = 0; n < frags.length; n++) {
      var fr = frags[(start + n) % frags.length];
      if (!cur || fr.cut) { cur = { frags: [] }; pieces.push(cur); }
      cur.frags.push(fr);
    }
    pieces.forEach(function (pc) {
      var m = pc.frags[Math.floor(pc.frags.length / 2)];
      pc.mid = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2];
      pc.dir = [m.b[0] - m.a[0], m.b[1] - m.a[1]];
      pc.inside = insidePoly(pc.mid[0], pc.mid[1], Q);
    });
    return { pieces: pieces, crossings: crossings };
  }

  // The animated stand-in for the reader outside an interactive figure.
  function csgHandle(input, t, def) {
    return input.live ? input.h : [def[0] + Math.sin(t * 0.4) * 0.14, def[1] + Math.cos(t * 0.3) * 0.1];
  }
  function csgOption(input, key, t, options, period) {
    return input.live ? input.ui[key] : options[Math.floor(t / period) % options.length][0];
  }

  // Arrow glyph for a direction in unit space (y runs down).
  function arrow(nx, ny) {
    var k = Math.round(Math.atan2(-ny, nx) / (Math.PI / 4));
    return ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'][(k + 8) % 8];
  }

  // Wide panels get bigger shapes; a phone-width panel stays at 1.
  function csgZoom(g) { return clamp(g.w * 0.75, 0.8, 1.35); }

  function hint(g, input, str) {
    if (input.live && g.cols > str.length + 14) g.text(2, g.rows - 2, str, 0.4);
  }

  // What the operations mean: a point is in the result when it passes the set test. With signed
  // distances that test is min or max. Removed material stays as faint dots.
  SCENES.csg = {
    label: 'A circle A and a square B, combined with the chosen boolean operation. Drag B, or focus the figure and use the arrow keys.',
    handle: [0.38, 0.08],
    controls: [{ key: 'op', label: 'operation', options: CSG_OPS }],
    draw: function (g, t, s, seed, input) {
      var op = csgOption(input, 'op', t, CSG_OPS, 4), h = csgHandle(input, t, this.handle);
      var z = csgZoom(g), ax = -0.3 * z, ay = 0, ar = 0.55 * z, hb = 0.42 * z;
      var edge = 0.6 / g.sy;
      for (var r = 0; r < g.rows; r++) {
        var y = (r - g.rows / 2) / g.sy;
        for (var c = 0; c < g.cols; c++) {
          var x = (c - g.cols / 2) / g.sx;
          var a = sdCircle(x, y, ax, ay, ar), b = sdBox(x, y, h[0], h[1], hb), d = csgDist(op, a, b);
          if (Math.abs(d) < edge) g.put(c, r, '#', 1);
          else if (d < 0) g.put(c, r, shade(clamp(dither(0.42, c, r, 0.5), 0, 1)), 0.55);
          else if (Math.abs(a) < edge || Math.abs(b) < edge) g.put(c, r, '·', 0.35);
          else if (a < 0 || b < 0) g.put(c, r, '·', 0.13);
        }
      }
      g.text(Math.round(g.col(ax - 0.2)), Math.round(g.row(ay)), 'A', 1);
      g.text(Math.round(g.col(h[0] + 0.18)), Math.round(g.row(h[1])), 'B', 1);
      var name = CSG_OPS.filter(function (o) { return o[0] === op; })[0][1];
      g.text(2, 1, g.cols > 36 ? name + '    ' + CSG_FORMULA[op] : name, 0.9);
      hint(g, input, 'drag B');
    }
  };

  // Inside or outside? Cast a ray from the point and count how often it crosses the outline:
  // odd is inside, even is outside, whatever the direction.
  SCENES.parity = {
    label: 'A star-shaped outline and a point with a ray. The crossings along the ray are numbered; an odd count means the point is inside. Drag the point, or focus the figure and use the arrow keys.',
    handle: [-0.12, 0.12],
    controls: [{ key: 'dir', label: 'ray', options: [['e', '→'], ['ne', '↗'], ['n', '↑'], ['w', '←']] }],
    draw: function (g, t, s, seed, input) {
      var dirs = { e: [1, 0], ne: [Math.SQRT1_2, -Math.SQRT1_2], n: [0, -1], w: [-1, 0] };
      var dk = csgOption(input, 'dir', t, this.controls[0].options, 5);
      var D = dirs[dk];
      var p = input.live ? input.h : [Math.sin(t * 0.21) * Math.min(1.1, g.w * 0.7), Math.sin(t * 0.33 + 1) * 0.55];
      var R = Math.min(0.85, g.w * 0.8);
      var S = starPolygon(5, R, R * 0.45, 0, 0.06);
      // Light fill, so the true answer is visible next to the count.
      for (var r = 1; r < g.rows; r += 1) {
        for (var c = 1; c < g.cols; c += 2) {
          if (insidePoly((c - g.cols / 2) / g.sx, (r - g.rows / 2) / g.sy, S)) g.put(c, r, '·', 0.16);
        }
      }
      for (var i = 0; i < S.length; i++) {
        var A = S[i], B = S[(i + 1) % S.length];
        g.line(g.col(A[0]), g.row(A[1]), g.col(B[0]), g.row(B[1]), 0.75);
      }
      var far = 2 * g.w + 2;
      g.line(g.col(p[0]), g.row(p[1]), g.col(p[0] + D[0] * far), g.row(p[1] + D[1] * far), 0.45, null, [2, 1]);
      var hits = rayCrossings(p[0], p[1], D[0], D[1], S);
      for (var k = 0; k < hits.length; k++) {
        var hc = g.col(p[0] + D[0] * hits[k]), hr = g.row(p[1] + D[1] * hits[k]);
        g.put(hc, hr, '×', 1, true);
        g.text(Math.round(hc) + 1, Math.round(hr) - 1, String(k + 1), 0.9);
      }
      var inside = hits.length % 2 === 1;
      g.put(g.col(p[0]), g.row(p[1]), inside ? '●' : '○', 1, true);
      var n = hits.length;
      var msg = n + (n === 1 ? ' crossing' : ' crossings') + (inside ? ': odd, inside' : ': even, outside');
      g.text(2, 1, g.cols > msg.length + 4 ? msg : (inside ? 'odd: in' : 'even: out'), 0.9);
      hint(g, input, 'drag the point');
    }
  };

  // How a mesh boolean is computed, on the outlines of a 2D slice: find where the outlines cross,
  // cut them there, classify every piece as inside or outside the other shape, keep the pieces the
  // operation asks for. Kept pieces show their outward normal; for A − B, B's pieces turn inward.
  SCENES.csgsteps = {
    label: 'The outlines of a polygon A and a square B, taken through the four steps of a mesh boolean: find crossings, split, classify, keep. Drag B, or focus the figure and use the arrow keys.',
    handle: [0.36, 0.06],
    controls: [
      { key: 'step', label: 'step', options: [['1', '1 cross'], ['2', '2 split'], ['3', '3 classify'], ['4', '4 keep']] },
      { key: 'op', label: 'operation', options: CSG_OPS }
    ],
    draw: function (g, t, s, seed, input) {
      var step = +csgOption(input, 'step', t, this.controls[0].options, 3);
      var op = csgOption(input, 'op', t, CSG_OPS, 12);
      var h = csgHandle(input, t, this.handle);
      var z = csgZoom(g), acx = -0.28 * z;
      var PA = polygon(12, 0.55 * z, acx, 0, 0.13);
      var PB = polygon(4, 0.42 * z * Math.SQRT2, h[0], h[1], Math.PI / 4 + 0.35);
      var sa = splitOutline(PA, PB), sb = splitOutline(PB, PA);
      var both = [['A', sa, false], ['B', sb, true]];

      if (step === 4) {
        for (var r = 1; r < g.rows; r++) {
          for (var c = 1; c < g.cols; c += 2) {
            var x = (c - g.cols / 2) / g.sx, y = (r - g.rows / 2) / g.sy;
            if (csgKeep(op, insidePoly(x, y, PA), insidePoly(x, y, PB))) g.put(c, r, '·', 0.32);
          }
        }
      }

      for (var q = 0; q < 2; q++) {
        var isB = both[q][2], pieces = both[q][1].pieces;
        for (var i = 0; i < pieces.length; i++) {
          var pc = pieces[i], style;
          if (step === 1) style = [0.55, null];
          else if (step === 2) style = [i % 2 ? 0.4 : 0.95, null];
          else if (step === 3) style = pc.inside ? [0.6, [2, 1]] : [0.95, null];
          else {
            var keep = op === 'union' ? !pc.inside : op === 'intersect' ? pc.inside : (isB ? pc.inside : !pc.inside);
            style = keep ? [1, null] : [0.16, [2, 1]];
            pc.keep = keep;
          }
          for (var f = 0; f < pc.frags.length; f++) {
            var fr = pc.frags[f];
            g.line(g.col(fr.a[0]), g.row(fr.a[1]), g.col(fr.b[0]), g.row(fr.b[1]), style[0], null, style[1]);
          }
          if (step === 3) {
            var tag = pc.inside ? 'in' : 'out';
            g.text(Math.round(g.col(pc.mid[0])) - 1, Math.round(g.row(pc.mid[1])) + (pc.mid[1] > (isB ? h[1] : 0) ? 1 : -1), tag, 0.85);
          }
          if (step === 4 && pc.keep) {
            // Outward normal of the result: the side of the piece that is not in the result.
            var len = Math.hypot(pc.dir[0], pc.dir[1]) || 1, nx = pc.dir[1] / len, ny = -pc.dir[0] / len, e = 0.03;
            var mx = pc.mid[0] + nx * e, my = pc.mid[1] + ny * e;
            if (csgKeep(op, insidePoly(mx, my, PA), insidePoly(mx, my, PB))) { nx = -nx; ny = -ny; }
            g.put(g.col(pc.mid[0] + nx * 0.1), g.row(pc.mid[1] + ny * 0.14), arrow(nx, ny), 1, true);
          }
        }
      }
      if (step <= 2) {
        sa.crossings.forEach(function (p) { g.put(g.col(p[0]), g.row(p[1]), step === 1 ? '×' : '+', 1, true); });
      }
      g.text(Math.round(g.col(acx)), Math.round(g.row(0)), 'A', 0.9);
      g.text(Math.round(g.col(h[0])), Math.round(g.row(h[1])), 'B', 0.9);

      var n = sa.crossings.length;
      var lines = {
        1: ['1  find the crossings: ' + n, '1  crossings: ' + n],
        2: ['2  cut both outlines into ' + (n || 1) + ' pieces each', '2  split'],
        3: ['3  classify: inside the other shape?', '3  in / out'],
        4: [{ union: '4  keep A out of B, B out of A', intersect: '4  keep A in B, B in A', subtract: '4  keep A out of B, B in A, flipped' }[op], '4  ' + op]
      }[step];
      g.text(2, 1, g.cols > lines[0].length + 4 ? lines[0] : lines[1], 0.9);
      hint(g, input, 'drag B');
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
    this.t = 9;
    // Reader input survives resizes, unlike the scene state. `live` is set only inside an
    // article figure; scenes animate their options and handle when it is false.
    var sc = this.scene, input = { live: false, ui: {}, h: sc.handle ? sc.handle.slice() : null };
    (sc.controls || []).forEach(function (ctl) { input.ui[ctl.key] = ctl.options[0][0]; });
    this.input = input;
    this.resize();
    var fig = canvas.closest('.art-figure');
    if (fig && (sc.controls || sc.handle)) this.interactive();
  }

  Panel.prototype.redraw = function () { this.draw(this.t); };

  // Pixel position on the canvas to unit space (the inverse of Grid.col/row, at the glyph centre).
  Panel.prototype.unit = function (e) {
    var rect = this.canvas.getBoundingClientRect(), g = this.grid;
    var c = (e.clientX - rect.left - this.ox) / this.cw - 0.5, r = (e.clientY - rect.top - this.oy) / this.ch - 0.5;
    return [(c - g.cols / 2) / g.sx, (r - g.rows / 2) / g.sy];
  };

  Panel.prototype.moveHandle = function (x, y) {
    var g = this.grid, m = 0.15;
    this.input.h = [clamp(x, -g.w + m, g.w - m), clamp(y, -1 + m, 1 - m)];
    this.redraw();
  };

  Panel.prototype.interactive = function () {
    var p = this, sc = this.scene, cv = this.canvas, input = this.input, art = cv.parentNode;
    input.live = true;
    art.removeAttribute('aria-hidden');
    art.classList.add('art--live');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', sc.label || '');

    if (sc.controls) {
      var bar = document.createElement('div');
      bar.className = 'art-controls';
      sc.controls.forEach(function (ctl) {
        var grp = document.createElement('div');
        grp.className = 'art-controls__group';
        grp.setAttribute('role', 'group');
        grp.setAttribute('aria-label', ctl.label);
        var name = document.createElement('span');
        name.textContent = ctl.label;
        grp.appendChild(name);
        ctl.options.forEach(function (o) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = o[1];
          b.setAttribute('aria-pressed', String(input.ui[ctl.key] === o[0]));
          b.addEventListener('click', function () {
            input.ui[ctl.key] = o[0];
            grp.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            p.redraw();
          });
          grp.appendChild(b);
        });
        bar.appendChild(grp);
      });
      art.insertAdjacentElement('afterend', bar);
    }

    if (!sc.handle) return;
    cv.tabIndex = 0;
    var grab = null;
    cv.addEventListener('pointerdown', function (e) {
      var u = p.unit(e), h = input.h;
      // Near the handle, drag it by the point grabbed; elsewhere, jump to the pointer.
      grab = Math.hypot(u[0] - h[0], u[1] - h[1]) < 0.35 ? [h[0] - u[0], h[1] - u[1]] : [0, 0];
      cv.setPointerCapture(e.pointerId);
      p.moveHandle(u[0] + grab[0], u[1] + grab[1]);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!grab) return;
      var u = p.unit(e);
      p.moveHandle(u[0] + grab[0], u[1] + grab[1]);
    });
    var release = function () { grab = null; };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);
    cv.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      var step = e.shiftKey ? 0.15 : 0.04;
      p.moveHandle(input.h[0] + d[0] * step, input.h[1] + d[1] * step);
    });
  };

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
    this.t = t;
    g.clear();
    this.scene.draw(g, t + this.offset, this.state, this.seed, this.input);
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
    // Interactive figures only change on input; they skip the clock.
    visible.forEach(function (p) { if (!p.input.live) p.draw(t); });
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
