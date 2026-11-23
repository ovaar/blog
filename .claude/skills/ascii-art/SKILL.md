---
name: ascii-art
description: Add or change a generative ASCII animation (scene) for the Ovaar blog, or attach one to a post. Use for "new ascii scene", "animation for this post", "change the visual of X".
---

# ASCII art

All animations live in `themes/ovaarian/assets/ascii.js`. Each one is a *scene* in the `SCENES` object. Any `<canvas data-ascii="<scene>">` on a page renders it.

## Rules

1. A scene shows the post's subject (a pipeline, cache reads, a graph), never decoration. If you can't say in one sentence what it shows, don't build it.
2. Monochrome only. Draw glyphs and alpha, never colours. The canvas `color` sets the ink.
3. No libraries. Plain canvas and the `Grid` helpers.
4. Keep it calm: slow motion, mostly low alpha, a few bright points.
5. Frame `t = 9` must look good on its own. Reduced-motion users only see that frame.

## Scene shape

```js
SCENES.name = {
  init: function (g, rand) { return state; },   // optional; runs again on every resize
  draw: function (g, t, state, seed) { ... }    // t = seconds; called at most 20 fps
};
```

- Use `rand()` (seeded by the post title) for randomness, never `Math.random`. That way a post looks the same on every visit.
- `draw` must depend only on `t` and `state`. For step-based simulations, catch up to `Math.floor(t * rate)` with a cap (see `SCENES.memory`).

## Grid helpers (`g`)

| Helper | Use |
| --- | --- |
| `g.cols`, `g.rows` | grid size in cells |
| `g.col(x)`, `g.row(y)` | unit space to cells. y runs -1..1 over the height, x uses the same scale, `g.w` is the half-width |
| `g.put(c, r, ch, alpha, force)` | one glyph; the brighter glyph wins unless `force` |
| `g.text(c, r, str, alpha)` | a label, always on top |
| `g.line(c0, r0, c1, r1, alpha, ch, [period, on])` | a line in cells; no `ch` picks `- / \| \` from the slope |
| `g.box(c, r, w, h, alpha)` | box-drawing rectangle |
| `shade(v)`, `dither(v, c, r, amount)` | intensity 0..1 to a ramp glyph, Bayer dither |
| `rotate(p, ax, ay)` | 3D point; project with `f = k / (z + d)` like `SCENES.cube` |

Cells are about twice as tall as wide; `g.col` and `g.row` already correct for that.

## Using a scene

- **Post panel and card:** `themes/ovaarian/layouts/partials/art-kind.html` maps tags to a scene. Add the tags there, or set `visual = "name"` in the post's front matter.
- **Inside an article:** `{{< ascii kind="name" caption="What it shows" >}}`
- **Gallery:** add an entry to `themes/ovaarian/layouts/experiments/list.html` (kind, name, topics, one-sentence note).

## Verify

1. Run `docker compose up server` and open `http://localhost:1313/experiments/` in Chrome DevTools.
2. Check a card (small), an article panel (wide) and a 390px viewport. The scene must hold up at every size.
3. Check dark mode and reduced motion (emulate `prefers-reduced-motion: reduce`). The console must have no errors.
4. Stop the server: `docker compose stop server`.
