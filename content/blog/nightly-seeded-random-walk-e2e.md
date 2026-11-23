+++
date = "2026-11-23"
title = "A robot that clicks around staging every night"
description = "A seeded random walk in Playwright that checks every screen for crashes, server errors and leaked translation keys, cannot write tenant data, and found a WebGL viewer leak on its second night."
type = "post"
categories = ["Development"]
tags = ["testing", "playwright", "e2e", "typescript"]
+++

Our end-to-end tests follow scripts. Open the product, pick an option, go to the summary, check the price. They catch regressions in the paths we wrote down. They don't catch the crash that only happens when you press Escape in a dialog, go Back, and click something else.

So we added a test that doesn't follow a script. Every night it opens our React product configurator on staging and clicks around at random for a few minutes, checking every screen it lands on. When it finds something, it prints a command that replays the exact same walk.

On its second night it found a memory leak in our 3D viewer.

## What a walk does

Each walk starts from an entry page (home, the product list, the configurator) and repeats:

1. Pick an action, weighted: click, type or select on a visible control (80%), Tab (7%), Escape (7%), Shift+Tab (3%), browser Back (3%).
2. Wait for the app to settle.
3. Check the screen.

```ts
const ACTIONS = [
  { value: "control", weight: 80 },
  { value: "tab", weight: 7 },
  { value: "shift-tab", weight: 3 },
  { value: "escape", weight: 7 },
  { value: "back", weight: 3 },
];
```

When it types into a field, it picks from a small list of inputs that hand-written tests rarely try:

```ts
export const FILL_CORPUS = [
  "", "a", "x".repeat(300), "Ünïcødé ✓ 日本語 🚀", "<b>bold</b>",
  "42", "-1", "0", "1e9", "3.14",
];
```

After every step, it checks:

* no uncaught error and no `console.error`
* no API response with status 500 or higher
* no raw translation key on screen (`summary.dialog.title` instead of a label)
* no `undefined`, `NaN` or `[object Object]` on screen
* the page isn't blank, has exactly one `<main>` and at most one visible `<h1>`
* focus doesn't drop to `<body>` after Escape

Five walks run in a GitHub Actions workflow at 03:30, after the normal scripted suite. It never runs on pull requests and isn't a required check. Its job is to find things, not to block merges.

## Same seed, same walk

A random test is only useful if you can reproduce what it found. All randomness comes from one seeded generator. It is [mulberry32](https://gist.github.com/tommyettinger/46a874533244883189143505d203312c), inline, because the walk needs nothing more than a 32-bit stream that replays the same way on every machine:

```ts
export function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Each run has one base seed (the CI run id, or `Date.now()` locally). Each walk mixes in its own name with FNV-1a, so the five walks differ from each other but any one can be replayed on its own:

```ts
export function walkSeed(base: string | number, walk: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${base}:${walk}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
```

A failure names the rule, the step, the URL and the seed, and the job summary gets a command like this:

```sh
E2E_EXPLORE=1 E2E_SEED=20261116 E2E_STEPS=16 \
  npx playwright test --project=explore-chromium --grep "walk from home"
```

`E2E_STEPS` stops the replay at the failing step, so you land on the broken screen in Playwright's UI mode instead of watching 400 steps go by.

One limit is worth stating: the seed fixes which actions the walk *chooses*. It doesn't fix what a shared staging backend returns or how long it takes. In practice the replay hits the same bug almost every time, but not always.

## It must not break staging

Staging is shared with the whole team. A robot that clicks every button would eventually request quotes, upload files and edit customer records. Steering it away from dangerous buttons isn't enough, because buttons get renamed. So safety has two layers.

**Steering.** The walk never touches file inputs, `type=submit` buttons, download links, links that open a new tab, links that leave the app, or a short list of names like the "send request" button (in all nine languages, because the walk can switch language).

**The guarantee is at the network layer.** Every request goes through `page.route`, and every write to the API is aborted unless it is on an allow-list:

```ts
export function blockReason(method: string, rawUrl: string): string | null {
  if (READ_METHODS.has(method.toUpperCase())) return null;
  const url = new URL(rawUrl);
  if (!isOurApi(url.hostname)) return null;

  const blocked = BLOCKED_WRITES.find(({ pattern }) => pattern.test(url.pathname));
  if (blocked) return blocked.reason;
  const allowed = ALLOWED_WRITES.some(
    ({ methods, pattern }) => methods.has(method) && pattern.test(url.pathname)
  );
  if (allowed) return null;
  return "write to an endpoint the walk does not allow";
}
```

The allow-list is the draft-configuration endpoints, verb by verb, with real GUIDs for ids (so a path like `/configurator/pdf` can't pass as an id). Each entry also names its HTTP methods, so a stray `DELETE` to a draft path is blocked too. Anything with `quot` in the path is always blocked.

The important part is the last line. A new endpoint that writes data is blocked by default and shows up as a `blocked-request` violation. **It fails closed.** That is the opposite of what my first draft did, which was a list of endpoints to block.

The walk also stubs `window.print` and `window.open`, and dismisses any stray browser dialog.

## Settling without a destination

The usual Playwright advice is to wait for a specific element, never a fixed time. A random walk has no destination to wait for. And `networkidle` doesn't help in a single-page app: it resolves at once.

So the walk tracks requests itself and waits until none have been in flight for 400 ms, capped at 5 seconds so a streaming 3D model can't stall it:

```ts
export function trackRequests(page: Page) {
  const inFlight = new Set<Request>();
  let lastChange = Date.now();
  const touch = () => (lastChange = Date.now());
  page.on("request", (r) => inFlight.add(r) && touch());
  page.on("requestfinished", (r) => inFlight.delete(r) && touch());
  page.on("requestfailed", (r) => inFlight.delete(r) && touch());

  return {
    async settle() {
      const until = Date.now() + 5000;
      await pause(100); // let a request the last action triggered register
      while (Date.now() < until) {
        if (!inFlight.size && Date.now() - lastChange >= 400) return;
        await pause(100);
      }
    },
  };
}
```

A screen that fails a check is read again 1.5 seconds later, and only violations that are still there count. Without that, every loading skeleton caught mid-transition would be a failure.

## Keeping the rules honest

**Rules live outside the browser.** Everything that *decides* is a pure function with unit tests: the PRNG, the action filter, the network block, the screen rules, the allow-list matcher. The Playwright side only reads facts from the page and drives the walk. That makes the rules cheap to test and keeps flakes out of them.

**A walk that does nothing fails.** A walk of 10 or more steps that never clicked, filled or selected a control fails as `no-control-acted`, instead of passing green because it spent five minutes pressing Tab on an error page.

**I checked that each rule can fail.** Before merging I put one violation of each kind into a real walk: an uncaught error, a `console.error`, a 500, a blocked write, a raw key, `NaN`, two `<h1>`s, a blank page, lost focus. All nine went red with the rule, step, URL, seed and replay command.

**Known bugs go on a narrow list.** Two things on `main` already failed the walk on day one. They went into a `KNOWN_VIOLATIONS` list, each matched on its rule plus a narrow regex, with a reason. Entries only ever get removed:

```ts
const DIALOG_OUTLIVES_ROUTE: KnownViolation = {
  rule: "focus-lost",
  // Only a dialog that outlived its route: opened on one path, now on another.
  detail: /\(dialog opened on (\S+), now on (?!\1\))\S+\)$/,
  reason:
    "dialog state sits above the routes, so a dialog stays open after browser Back; " +
    "closing it then has no trigger to return focus to",
};
```

The regex is the point. A dialog that loses focus on its *own* route still fails.

## What it found

### A WebGL viewer that never died

Two nights in, a walk failed at step 484 with:

```text
console-error: Rendering to a canvas that was resized to zero. If you see this message
you may be accidentally leaking a viewer instance. ErrorCode:14.
```

It was followed by dozens of `Cannot set properties of null (setting 'shareDepthFrom')`.

Our 3D view wraps Autodesk's viewer. Leaving a 3D step while the viewer was still waiting for its auth token went like this:

1. React unmounted the component, and our hook removed the element.
2. The token arrived.
3. The wrapper built Autodesk's `Viewer3D` on the detached, zero-sized element and started its render loop. Nothing ever stopped it.

Even without the error burst, every visit to a 3D step left one live viewer and one WebGL context behind. `window.NOP_VIEWERS.length` went up by one per visit.

A colleague added an idempotent `dispose()` to the wrapper package, and the hook now calls it on every path that drops a viewer: unmount, both cancelled-init paths and the failed-init `catch`. Each of the four cases has a test that fails on the old hook.

No scripted test would have found this. You have to leave the page during a window of a few hundred milliseconds, on a slow network, and then keep going for a while.

### A focus check that raced the UI library

The walk also failed with "Escape dropped focus" on an image preview dialog. The failure snapshot showed focus *on the opener*, so the app was right and the check was wrong.

[Radix](https://www.radix-ui.com/) returns focus in a `setTimeout(0)` after the dialog unmounts, so between unmount and that timeout `document.activeElement` is `<body>`. On a fast machine that gap is 5 ms. With 20x CPU throttling it's 116 ms. The CI runner, busy rendering 3D, read focus right in that window.

The fix wasn't to drop the rule. The check now reads focus every 50 ms and only reports a loss if focus is still on `<body>` after 1.5 seconds. If focus is already on an element it reads once and doesn't wait.

### Smaller things

* A product on staging returned a 500 without CORS headers, so the browser could only report it as a CORS error.
* A link in the header with no accessible name.
* A dialog that stays open after browser Back (the known violation above).

## Takeaways

* **Seed everything and print the replay command.** A random test without a replay is a flaky test.
* **Make safety fail closed.** Allow-list writes at the network layer, and treat a blocked write as a finding.
* **Keep the decisions in pure functions.** The browser side should only read and act.
* **Check every rule can fail before trusting it green.**
* **Expect to fix your own checks.** One of the first three failures was the test being wrong about timing. That's fine, as long as the fix keeps the rule strict.
