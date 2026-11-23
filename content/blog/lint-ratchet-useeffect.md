+++
date = "2026-11-23"
draft = true
title = "A lint ratchet: from 97 useEffects to 2 in a week"
description = "How a custom lint rule plus a shrink-only exceptions list took a React codebase from 97 effects in components to 2, and why most of them were deleted rather than moved."
type = "post"
categories = ["Development"]
tags = ["react", "lint", "oxlint", "refactoring"]
+++

Our React frontend had 97 `useEffect` calls sitting directly in components. Most of them were fine on the day they were written. Together they were the main source of "why did this re-render" and "why is this state one step behind" bugs.

Banning `useEffect` outright would have failed the build on day one. Leaving it alone meant the count only went up. What worked was a third option: a lint rule that fails on any *new* effect, plus a list of the existing ones that may only get shorter.

A week later, 2 were left.

## The rule

The rule itself is small. It reports `useEffect` and `useLayoutEffect` wherever it sees them: called bare, as `React.useEffect`, through a renamed import, or through a namespace import.

```js
const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect"]);

export const noEffectOutsideHooks = {
  meta: { /* ... */ messages: { effectOutsideHook: MESSAGE } },
  create(context) {
    const effectAliases = new Set(EFFECT_HOOKS);
    const namespaces = new Set(["React"]);

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "react") return;
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier" && EFFECT_HOOKS.has(spec.imported.name)) {
            effectAliases.add(spec.local.name); // import { useEffect as onMount }
          } else if (spec.type !== "ImportSpecifier") {
            namespaces.add(spec.local.name); // import * as R from "react"
          }
        }
      },
      CallExpression(node) {
        if (isEffectCall(node.callee)) {
          context.report({ node: node.callee, messageId: "effectOutsideHook" });
        }
      },
    };
  },
};
```

The rule doesn't decide where effects *are* allowed. That lives in the config: files named `use*.ts(x)`, the UI primitives folder, tests and stories are excluded. So an effect can still exist, but only inside a named custom hook, where its name says what it is for.

The message matters more than the rule. It is the first thing a developer (or an agent) reads when the build fails, so it lists the alternatives in the order you should try them:

> Effects live in a named custom hook (a use\*.ts(x) file). Before writing one: derive the value during render; reset state with a `key`; put user-triggered work in the event handler; use React Query hooks for server state, `useDebounce` for debouncing and `useEffectEvent` for latest-callback refs.

That is the [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) page, compressed into a lint message.

A sister rule does the same for `setTimeout`, `setInterval`, `requestAnimationFrame` and `requestIdleCallback`. Timers go through a few approved hooks (`useDebounce`, `useDelayedTrue`, a frame scheduler) or they fail lint.

## The ratchet

The interesting part is how existing violations are tolerated. A JSON file lists, per file and per rule, how many violations that file may hold:

```json
{
  "src/hooks/useForgeViewer.ts": {
    "app/no-imperative-timers": { "count": 2 }
  }
}
```

A wrapper around the rule holds back every report until the file is done, then compares the total with the allowed count:

```js
export function ratcheted(ruleId, rule) {
  return {
    meta: { ...rule.meta, messages: { ...rule.meta.messages, staleSuppression: "..." } },
    create(context) {
      const held = [];
      // Hand the inner rule a context whose report() only collects.
      const holding = new Proxy({}, {
        get(_, key) {
          if (key === "report") return (descriptor) => held.push(descriptor);
          const value = context[key];
          return typeof value === "function" ? value.bind(context) : value;
        },
      });
      const { "Program:exit": onExit, ...listeners } = rule.create(holding);
      return {
        ...listeners,
        "Program:exit"(program) {
          onExit?.(program);
          const allowed = allowedCount(context, ruleId);
          if (held.length > allowed) {
            for (const descriptor of held) context.report(descriptor);
          } else if (held.length < allowed) {
            context.report({ node: program, messageId: "staleSuppression", /* ... */ });
          }
        },
      };
    },
  };
}
```

Three outcomes per file:

* **More than allowed:** every violation in the file is reported, so you see all of them and not only the new one.
* **Exactly allowed:** silence.
* **Fewer than allowed:** lint fails with "run `npm run lint:prune-suppressions`". If you remove an effect, you have to lower the count in the same PR. Otherwise the freed slot could be spent again later without anyone noticing.

The empty `{}` target of the proxy is not decoration. The linter freezes `context.report`, and a proxy may not return a different value for a frozen property of its own target. Proxying an empty object sidesteps that.

## Guarding the guard

A list anyone can edit is a list that grows. Three things stop that.

**A test holds a ceiling per file.** The JSON file is checked against a hard-coded table in a unit test, with a comment explaining why each remaining entry is still there:

```ts
const FILE_CEILINGS = {
  // The 300 ms cap keeps a commit that never settles from freezing the step change.
  "src/hooks/stepViewTransition.ts": { timers: 1 },
  "src/hooks/useCopyToClipboard.ts": { timers: 1 },
  // ...
};
```

Raising a number means editing both the JSON and this table. That shows up in review as a deliberate change, not as a side effect of rerunning a generator.

**The test lints a real file with one extra violation.** It takes a file the list still counts, appends one effect, and checks that lint now fails. A second case lints an emptied version of that file and checks that the stale-count message appears. If someone breaks the wrapper, this goes red.

**Disable comments can't switch the rules off.** The ratchet would be pointless if `// eslint-disable-next-line` worked on it. Every disable comment needs a reason on the same line, blanket disables fail, and the two ratchet rules can't be disabled by comment at all. The list is the only way to tolerate an effect.

## Then the cleanup

The rule landed with 97 effects in 61 files. Three hand-rolled 300 ms search debounces were replaced by `useDebounce` in the same PR, which brought it to 94. Then the cleanup went area by area, one PR per folder or feature, each with a before/after table in the description:

| Step | Effects in components | Timers outside hooks | Files on the list |
| --- | --- | --- | --- |
| Rule lands | 94 in 61 files | 39 in 30 files | 84 |
| Shell and layout | 84 in 53 files | 39 | 76 |
| Shared components | 43 in 32 files | 36 in 27 files | 55 |
| Providers, timer-only hooks | 27 in 20 files | 32 in 23 files | 39 |
| Remaining feature areas | **2** | **32** | **23** |

The obvious way to clear the list is to cut each effect out of its component and paste it into a `useSomething.ts` file. That makes the rule go quiet and changes nothing else. We did some of that, for effects that are real subscriptions: a postMessage bridge, a third-party image cropper, tracking scripts. Each of those hooks has a doc comment saying why it has to be an effect.

But most effects weren't subscriptions. They were synchronising one piece of state with another, and those could be deleted.

### Example: a paginated picker with ten effects

Three CRM picker tables (accounts, contacts, delivery addresses) together held ten effects like these:

```tsx
useEffect(() => setCurrentPage(1), [debouncedSearchTerm, accountId]);
useEffect(() => setCurrentPage(1), [sorting]);

// Reset selection for a new account or search.
useEffect(() => {
  if (initialSelectedId) setRowSelection({ [initialSelectedId]: true });
  else setRowSelection({});
}, [accountId, initialSelectedId]);
```

Every one of them renders once with stale state, then again with the reset. With a remote table that can mean a request for page 3 of a search that only has one page.

The replacement is one hook with no effects. Changes the user makes do their resets in the handler:

```ts
const setSorting: OnChangeFn<SortingState> = (updater) => {
  setSortingState(updater);
  setCurrentPage(1);
  if (!keepSelectionAcrossPages) setRowSelection({});
};
```

Changes that arrive from outside an event (a prop, the debounced search term) are compared with the last value seen and adjusted *during render*. This is React's documented "[adjusting state when a prop changes](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)" pattern:

```ts
const [seen, setSeen] = useState({ debouncedSearchTerm, scope, defaultSelectedId });
const searchChanged = seen.debouncedSearchTerm !== debouncedSearchTerm;
const scopeChanged = seen.scope !== scope;

if (searchChanged || scopeChanged) {
  setSeen({ debouncedSearchTerm, scope, defaultSelectedId });
  setCurrentPage(1);
  setRowSelection(selectionOf(defaultSelectedId));
}
```

React throws away the render that called `setState` and renders again before anything reaches the screen, so no render ever queries a stale page. Ten effects, three components, one hook, 13 tests.

### Other patterns that removed effects

* **A form submitted from a dialog footer** used an effect to watch a "submit requested" counter. Now the footer button is a native `<button type="submit" form={formId}>`. Validation and Enter-to-submit work as before.
* **A tooltip that only opens when text is cut off** measured the element in an effect. Now it measures in the pointer-move and focus handlers, right before the tooltip would open, and cancels the event if the text fits. As a side effect it now follows resizes.
* **A "save failed" notice that hides after 6 seconds** used an effect plus `setTimeout`. Now it is a child component keyed on the failure count, using the approved `useDelayedTrue` hook. Each new failure remounts it, which restarts the timer.
* **A ref that mirrors the latest callback** became `useEffectEvent`.
* **Components that registered refs with a parent in an effect** now read from a tiny store with `useSyncExternalStore`.

### One that went back on the list

One PR first moved a 3D viewer's loading effect into `useReportViewerLoading`. In review we undid that. The effect copied the viewer's loading state up into a parent, which is exactly the kind of effect the rule is meant to remove. Hiding it in a hook file only made the rule go quiet. The real fix is to have the parent own that state, and that wasn't something I could prove safe with the tests we had. So it went back on the list until the follow-up.

That is the rule I'd give anyone doing this: **moving an effect into a hook is only progress if the effect is a real subscription.** Otherwise you are hiding it from the linter.

## What's left

Two effects and 32 timers. The timers are mostly legitimate: animation fallbacks for an `animationend` that a reduced-motion setting never sends, a copy-to-clipboard confirmation, a reCAPTCHA poll. Each one has its reason next to its ceiling in the test file, so the next person doesn't have to work it out again.

## Takeaways

* **Ban the pattern, not the code that already uses it.** A shrink-only list lets you start enforcing on day one.
* **Make the list hard to grow.** A ceiling in a test, no disable comments, and a failure when a count is higher than it needs to be.
* **Put the alternatives in the error message.** That is where people (and coding agents) look.
* **Measure progress in the PR description.** A before/after table per PR made the cleanup easy to review and kept it moving.
