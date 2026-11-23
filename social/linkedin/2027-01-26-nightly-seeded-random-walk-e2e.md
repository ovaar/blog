+++
linkedin = "2027-01-26T08:30:00+01:00"
blog = "2027-01-26T07:00:00+01:00"
url = "https://ovaar.github.io/blog/nightly-seeded-random-walk-e2e/"
status = "approved"
+++

Our end-to-end tests follow scripts, so they only find bugs on the paths we wrote down.

We added a test that follows no script. Every night it opens our product configurator on staging and clicks at random for a few minutes. It uses controls, Tab, Escape and the browser Back button. After each step it checks for uncaught errors, server responses with status 500 or higher, and raw translation keys on the screen.

Each walk has a seed. When a walk fails, the test prints a command that replays the same walk step by step. The test cannot write data. The network layer blocks every write that is not on an allow-list, and a blocked write counts as a finding.

On the second night the walk found a leak in our WebGL viewer, at step 484.

The walk also found a bug in its own checks. A focus check read the focus before the UI library had returned it, on a busy CI runner. The fix kept the rule and made the check wait up to 1.5 seconds.

https://ovaar.github.io/blog/nightly-seeded-random-walk-e2e/

#playwright #testing #e2e
