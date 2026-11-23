+++
linkedin = "2026-12-08T08:30:00+01:00"
blog = "2026-12-08T07:00:00+01:00"
url = "https://ovaar.github.io/blog/lint-ratchet-useeffect/"
status = "approved"
+++

Our React frontend had 97 useEffect calls directly in components. Most of our "why did this re-render" bugs came from them.

A ban on useEffect would have failed the build on the first day. Without a ban, the count only went up.

We added a lint rule that fails on every new effect. The existing effects went on a list that can only get shorter. A test holds a maximum per file, a disable comment does not switch the rule off, and the test fails when a maximum is higher than the current count.

A week later, 2 effects were left. We deleted most of the others instead of moving them into a hook.

The error message lists the alternatives to useEffect. Developers read the error message first, and coding agents do too.

https://ovaar.github.io/blog/lint-ratchet-useeffect/

#react #typescript #linting
