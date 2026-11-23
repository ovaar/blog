+++
linkedin = "2027-01-05T08:30:00+01:00"
blog = "2027-01-05T07:00:00+01:00"
url = "https://ovaar.github.io/blog/eslint-to-oxlint-with-custom-rules/"
status = "approved"
+++

Our lint step took 17 seconds. Now it takes 2.

We moved a React codebase from ESLint to Oxlint. Our own lint rules moved too, and now run as an Oxlint JavaScript plugin. About 80 packages left node_modules.

The timing table leaves some things out:

- Some import bans stopped matching, and lint stayed green. Oxlint reads the patterns as globs, and ESLint read them the way git reads .gitignore. Test your bans against real imports.
- We lost all 11 Storybook lint rules. Nothing checks our stories now.
- The pre-commit hook got slower, from 2.7 s to 3.5 s.
- The Oxlint docs still call JavaScript plugins alpha, and every custom rule depends on that API. We pinned the version, and the tests run the rules through the real binary.

For us the move was worth it. It took more work than the phrase "drop-in replacement" suggests.

https://ovaar.github.io/blog/eslint-to-oxlint-with-custom-rules/

#javascript #oxlint #developerexperience
