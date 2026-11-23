+++
date = "2027-01-05T07:00:00+01:00"
title = "Replacing ESLint with Oxlint, custom rules included"
description = "Moving a React codebase from ESLint to Oxlint with its own lint rules: lint went from 17 s to 2 s, and here is what we lost, what broke quietly and what got slower."
type = "post"
categories = ["Development"]
tags = ["javascript", "typescript", "lint", "oxlint", "vite"]
+++

Our React frontend ran `oxlint && eslint` on every pull request. Oxlint finished in 0.6 seconds. ESLint took 16.7. We kept ESLint for two reasons: a handful of plugins, and our own lint rules (see [the lint ratchet post](/blog/lint-ratchet-useeffect/)).

Oxlint now supports JavaScript plugins written against the ESLint rule API. So we tried running everything on Oxlint, and ended up removing ESLint completely.

The short version:

| Measurement (Apple M5, median of 5 runs) | Before | After |
| --- | --- | --- |
| `npm run lint` | 16.99 s | **2.07 s** |
| Lint steps in a PR (`fmt:check` + `lint`) | 17.44 s | **3.24 s** |
| Pre-commit hook, one staged file | 2.74 s | 3.53 s (slower) |

The rest of this post is about the parts the table doesn't show.

## One toolchain: Vite+

We moved to [Vite+](https://viteplus.dev/) at the same time. It bundles Vite, Vitest, Oxlint and the Oxfmt formatter as one dependency, pinned together, with one CLI: `vp dev`, `vp build`, `vp test`, `vp lint`, `vp fmt`.

`vp migrate` did most of the mechanical work. The diff touched 526 files, but almost all of it was one line per file: `from "vitest"` became `from "vite-plus/test"`.

The lint config moves into `vite.config.ts`:

```ts
import { defineConfig } from "vite-plus";
import { lintConfig } from "./config/lint.config.ts";

export default defineConfig({
  lint: lintConfig,
  staged: {
    "*": "vp fmt",
    "*.{js,ts,jsx,tsx}": "vp lint --fix",
  },
  // ...
});
```

The `staged` block replaced lint-staged. Husky stayed for the git hooks.

What left `package.json`: `eslint`, `typescript-eslint`, `@eslint/js`, `globals`, and the react-hooks, react-refresh, import-x, eslint-comments and storybook plugins. About 80 packages left `node_modules`.

## Custom rules as an Oxlint JS plugin

Our own rules were already written against the ESLint rule API (`meta`, `create(context)`, AST visitors). They load into Oxlint unchanged as a plugin:

```js
// scripts/lint-rules/plugin.mjs
export default {
  meta: { name: "app" },
  rules: {
    "no-effect-outside-hooks": ratcheted("app/no-effect-outside-hooks", noEffectOutsideHooks),
    "no-imperative-timers": ratcheted("app/no-imperative-timers", noImperativeTimers),
    "no-restricted-dynamic-imports": noRestrictedDynamicImports,
    "no-manual-memoization": noManualMemoization,
    "require-disable-description": requireDisableDescription,
    // ...eight rules about disable comments in total
  },
};
```

```ts
// config/lint.config.ts
export const lintConfig = {
  jsPlugins: ["./scripts/lint-rules/plugin.mjs"],
  rules: { "app/no-effect-outside-hooks": "error", /* ... */ },
};
```

Two things had to be rebuilt rather than ported.

**Bulk suppressions.** ESLint 9 can store existing violations in a suppressions file. Oxlint can't. Our ratchet rules now read the file themselves: a wrapper holds back a rule's reports until the end of the file and compares the count with the file's entry.

**The `eslint-comments` plugin.** We used it to require a reason on every disable comment and to forbid disabling certain rules. It peer-depends on ESLint, so it had to go. Eight small rules in our own plugin replace it. They still read `// eslint-disable-next-line rule -- reason` comments, because Oxlint honours that spelling.

## Testing lint rules without `lintText`

ESLint has a Node API: give it a string and a file path, get back messages. We used that to test the config itself, for example "a file in `src/api` may not import from `src/components`".

Oxlint has no such API. The replacement writes the code to a temp folder *at the same relative path* as the real file, next to a copy of the real config, and runs the binary:

```ts
export async function lintText(code: string, filePath: string): Promise<LintMessage[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "lint-probe-"));
  try {
    const file = path.join(dir, filePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, code);
    await writeFile(path.join(dir, ".oxlintrc.json"), probeConfig);
    // Oxlint exits non-zero when it reports an error, which is what most probes want.
    const { stdout } = await run(OXLINT, ["-c", ".oxlintrc.json", "-f", "json", filePath], {
      cwd: dir,
    }).catch((failure) => ({ stdout: failure.stdout ?? "" }));
    return JSON.parse(stdout).diagnostics.map(toLintMessage);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

Override globs in the config are relative to the config file, so a probe at `src/api/x.ts` in the temp folder gets exactly the rules the real `src/api/x.ts` would. The only change to the config is making the plugin path absolute.

It's slower than an in-process API, about a process spawn per probe. For a few hundred config tests that is fine.

## What broke quietly

These are the ones worth knowing before you try this.

**Import-ban patterns match differently.** ESLint's `no-restricted-imports` matches a `group` pattern gitignore-style. Oxlint matches it as a glob. So `@/services/*` stopped matching `@/services/a/b`, and lint stayed green. We only noticed because the boundary tests probe a nested import. The fix is to spell every level out:

```ts
// Matches the folder itself and everything beneath it, in both matchers.
const under = (...dirs: string[]) => dirs.flatMap((dir) => [`@/${dir}`, `@/${dir}/**`]);
```

If you have layer rules and no tests for them, check this by hand.

**A rule name with a plugin prefix still disables the built-in rule.** In Oxlint, `// eslint-disable-next-line x/no-restricted-imports` disables the built-in `no-restricted-imports`. Our "you may not disable this rule" check compared full names, so it needed to compare the bare rule name.

**A blanket disable silences its own report.** `/* eslint-disable */` also turns off the rule that is supposed to complain about blanket disables. That guard is now a test that scans every linted file for one.

**A peer dependency on the old Vite+ range.** Storybook declared an optional peer of `vite-plus ^0.1 || ^0.2`, which made `npm install` fail against 1.7. An `overrides` entry fixes it.

**New findings.** Oxlint's port of the React Compiler `purity` rule flags `new Date().getFullYear()` in a footer. ESLint's didn't. And `react/only-export-components` reports 14 warnings the old plugin didn't.

## What we lost

* **All 11 `eslint-plugin-storybook` rules.** There is no Oxlint equivalent and the plugin needs ESLint. Nothing checks our stories now. This is the biggest loss, and the plan is to write the few rules we care about into our own plugin.
* **`import-x/order`.** It was only a warning. Oxfmt's `sortImports` can replace it, but turning it on reorders imports across the whole repo once.
* **Editor feedback for two guards.** The per-file ceiling and the blanket-disable scan are Vitest tests now. CI still enforces them, but the editor and the commit hook don't show them.
* **The editor, partly.** The Oxlint language server does run JS plugin rules while you type, but only when it finds a `.oxlintrc.json`. With the config inside `vite.config.ts` it showed nothing in my test. I haven't tried the Vite+ editor extension yet.

## What got slower

The pre-commit hook went from 2.74 s to 3.53 s. Formatting the repo with `vp fmt` is 0.46 s slower than calling `oxfmt` directly, and `vp staged` is 0.28 s slower than lint-staged. That's the price of going through one CLI. It runs once per commit, so we accepted it, but the "everything gets faster" story isn't true for every step.

## The risk

The Oxlint docs still call JS plugins alpha. Every custom rule we have now depends on that API. What makes that acceptable for us:

* `vite-plus` is pinned to an exact version, so an Oxlint upgrade is always its own PR.
* The config tests lint real probes through the real binary. If a plugin API change breaks a rule, the upgrade PR goes red.
* The rules are written against the ESLint rule API. If the alpha stalls, ESLint can host them again.

## Was it worth it?

For us, yes. Lint dropped from 17 seconds to 2, we have one dependency where there were six, and none of our own guardrails were lost. But "Oxlint is a drop-in replacement" undersells the work. Test your import bans, list the plugins you'd lose, and time the commit hook as well as the full lint.
