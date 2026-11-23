+++
date = "2026-11-23"
draft = true
title = "Property-based tests found two bugs our example tests never would"
description = "Adding fast-check to a React frontend: a saved cart where \"abc\" counted as 3 items, a translation key named valueOf that crashed the app, and a model test that runs 2000 cart sequences in a quarter of a second."
type = "post"
categories = ["Development"]
tags = ["typescript", "testing", "fast-check", "property-based-testing"]
+++

Example tests check the cases you thought of. Property-based tests check a rule against inputs you didn't think of. I'd known that for years and never got round to adding them to our React frontend.

When we did, using [fast-check](https://fast-check.dev/), two of the first eight property files found real bugs. Neither was exotic. Both were the kind of `in` and `??` code most JavaScript codebases have.

## Bug 1: a saved cart where "abc" counts as 3

The app keeps a quote cart in `localStorage`: a JSON list of configuration ids and a JSON map of quantities. Reading it looked like this:

```ts
this.savedIds = this.parseOr<string[]>(raw, []);
```

`parseOr` returns the fallback when `JSON.parse` throws. That covers garbage. It doesn't cover *valid JSON in the wrong shape*, which is what you get from an older version of the app on the same origin, another tab, or someone editing values in DevTools:

| Stored value | Result |
| --- | --- |
| `null` | crash: `null.includes is not a function` |
| `"abc"` | a cart with 3 items: `"a"`, `"b"`, `"c"` |
| `{"a":1}` | crash further down |

The type annotation `<string[]>` made it look checked. It wasn't.

The fix validates the shape and keeps only what a cart can hold:

```ts
function toConfigurationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id !== ""))];
}

function toQuantities(value: unknown): Record<string, number> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, n]) => Number.isInteger(n) && (n as number) >= 1)
  );
}
```

There was a second bug in the same code. The quantity lookup was `stored[id] ?? 1`. For an id named `toString`, `stored[id]` isn't undefined. It's `Object.prototype.toString`, a function, so the summary page showed a function as the quantity. Every reader of a cart quantity now goes through one helper that checks own keys:

```ts
export const cartQuantity = (stored: Record<string, number>, id: string) =>
  Object.hasOwn(stored, id) ? stored[id] : 1;
```

## Bug 2: a translation named `valueOf` crashes the app

Admins can override the app's built-in labels. The merge only applies an override if the key exists in the bundled messages and the override keeps the same ICU placeholders:

```ts
for (const [key, value] of Object.entries(remoteMessages)) {
  if (!(key in bundledMessages)) continue;
  // ...validate placeholders against the default, then apply
}
```

`key in bundledMessages` is true for `"valueOf"`, because `in` walks the prototype chain. The validation then took `defaultMessages["valueOf"]` (a function), called `.matchAll` on it, and threw. One oddly named key from the admin side would have broken every label in the app.

fast-check shrank the failure to this:

```text
Counterexample: [{}, {"valueOf":"'"}, {}]
```

Empty bundle, one remote key named `valueOf`, empty defaults. You can see the bug from the counterexample alone.

The fix is two `Object.hasOwn` calls. The counterexample stays in the suite as a normal example test.

## How the properties are written

The properties are mostly simple statements:

```ts
const RUNS = { seed: 4075, numRuns: 100 };

it("never throws, never adds a key and takes each value from the bundle or the remote", () => {
  fc.assert(
    fc.property(messages, messages, messages, (bundled, remote, defaults) => {
      const merged = mergeRemoteMessages(bundled, remote, defaults);
      expect(Object.keys(merged)).toEqual(Object.keys(bundled));
      for (const k of Object.keys(merged)) {
        expect([bundled[k], remote[k]]).toContain(merged[k]);
      }
    }),
    RUNS
  );
});

it("is idempotent", () => {
  fc.assert(
    fc.property(messages, messages, messages, (bundled, remote, defaults) => {
      const once = mergeRemoteMessages(bundled, remote, defaults);
      expect(mergeRemoteMessages(once, remote, defaults)).toEqual(once);
    }),
    RUNS
  );
});
```

Two choices made the difference between properties that find things and properties that only pass.

**Build generators from the input's own tokens.** A random string almost never contains valid ICU syntax, so a property fed `fc.string()` only ever tests the "reject garbage" branch. Building messages from ICU pieces reaches the interesting code:

```ts
const icuMessage = fc
  .array(
    fc.constantFrom(
      "{", "}", "'", "#", " ", "Label", "{count}", "{name}",
      "{count, plural, one {# item} other {# items}}",
      "<b>", "</b>", "<link>go</link>", "l'<b>"
    ),
    { maxLength: 8 }
  )
  .map((tokens) => tokens.join(""));
```

**Put the dangerous values in the generator on purpose.** The key generator is a short list that includes `toString`, `constructor` and `valueOf`. fast-check would rarely produce those names from random strings. Once they're in the list, it hits them within a few runs.

```ts
const key = fc.constantFrom("a", "b", "c", "d", "toString", "constructor", "valueOf");
```

**Pin the seed.** Every `fc.assert` gets a fixed `seed` and `numRuns`. CI is deterministic, and a failure prints the seed and path needed to replay it.

## A model test for the cart

A cart has more behaviour than a single function: add, duplicate, change a quantity, remove, submit a quote, reload. Bugs tend to be in the order of operations. fast-check's [model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/) generates sequences of commands, runs them against the real code and against a simple model, and checks they agree after every step.

The model is just what a visitor would say is in the cart:

```ts
interface CartModel {
  ids: string[];
  quantities: Record<string, number>;
  current: string | null;
  multiple: boolean | undefined; // the "multiple configurations" setting
}
```

Each command updates the model, calls the real service, then checks every cart rule against what the service reads back:

```ts
const commit = configurationId.map((id) =>
  command(`Commit(${id})`, async (model) => {
    await cartService.commitConfiguration(id, { enableMultipleConfigurations: model.multiple });
    if (model.multiple === false) {
      model.ids = [id];
      model.quantities = {};
    } else if (!model.ids.includes(id)) {
      model.ids = [...model.ids, id];
    }
    model.current = id;
  })
);
```

There are seven commands: Commit, Duplicate, SetQuantity, Remove, SubmitQuote, Reload, and ForeignWrite. The last one is the important one. It writes something into `localStorage` behind the app's back (valid JSON, unparseable text, prototype names, empty strings, duplicates) and works out on its own what the cart should read as. That is how the wrong-shape bug turned into a permanent regression test rather than a one-off fix.

The test runs **2000 sequences of up to 30 steps** against the real storage service and takes about 0.25 seconds.

## Do the tests actually catch anything?

A property that can't fail is worse than no test, because it looks like coverage. So before merging, the reviewer and I made deliberate mutations to the source (flip a comparison, drop a filter, swap an `Object.hasOwn` back to `in`) and checked which ones turned a test red. **29 of 33 mutations** did. The four that didn't are listed in the PR, with a note on why: mostly mutations that don't change behaviour for any input the app can produce.

## A free speed-up

One property checked that sorting search results by name is stable and drops nothing. While writing it I noticed the comparator stripped HTML from both names with `DOMParser` on *every comparison*. That's O(n log n) DOM parses for a sort. Stripping each key once before sorting made those properties run 3 to 6 times faster, with the same order.

## Takeaways

* **`in` and `??` on objects keyed by user data are bugs waiting for a key named `toString`.** Use `Object.hasOwn`, or a `Map`.
* **A TypeScript annotation on `JSON.parse` is a promise, not a check.** Validate the shape at the boundary.
* **Generators decide what you test.** Build them from real tokens and add the edge cases by hand.
* **Keep the shrunk counterexample as an example test.** It documents the bug better than any description.
* **Mutate the code to check the tests.** It's the fastest way to find a property that passes regardless.
