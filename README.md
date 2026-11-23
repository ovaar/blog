# blog

Personal blog, built with [Hugo](https://gohugo.io/) and published to https://ovaar.github.io/.
Hugo runs in Docker, so nothing needs to be installed besides Docker.

# Getting started

```sh
git submodule init; git submodule update; git submodule status
```

## Run locally

```sh
docker compose up server
```

Open http://localhost:1313/. Pages rebuild and reload on save.

## Run locally with drafts

Posts with `draft = true` in their front matter are left out of the normal build. To preview them:

```sh
docker compose --profile drafts up drafts
```

Open http://localhost:1313/. This server also renders posts dated in the future. It uses the same
port as `server`, so stop that one first. It works from a git worktree too, because it turns
off Hugo's git info, so "last modified" dates in the preview may differ from the live site.

Add `-d` to run either server in the background, and stop it with
`docker compose --profile drafts down`.

## Deploy

Every push to `master` builds the site and publishes it to ovaar.github.io
(`.github/workflows/deploy.yml`). To publish a post, remove `draft = true` from its front matter
and merge it to `master`. Drafts are never deployed.

`./scripts/deploy.sh` does the same build and push from your own machine, for when CI is not an
option.

## Schedule a post

New posts go out one a week, on Tuesday at 07:00 CET, with a LinkedIn post at 08:30 CET.

1. Give the post its publish date with a time: `date = "2026-12-01T07:00:00+01:00"`. Hugo leaves
   a post with a future date out of the build, so it stays offline until then.
2. Save the LinkedIn text and its 1200 x 1500 image as `social/linkedin/<date>-<slug>.md` and
   `.png`, and schedule it on LinkedIn. The `linkedin` skill (`.claude/skills/linkedin/`) has the
   steps. Hugo only reads `content/`, so these files are never published.
3. Merge to `master`. The deploy also runs every Tuesday at 06:00 UTC and publishes the posts
   whose date has passed.

GitHub turns the Tuesday build off after 60 days without a commit to this repository. Commit
something before then, or run the workflow by hand from the Actions tab.

To preview a scheduled post, use the drafts server: it also renders future posts.

## Guidelines

https://refactoringenglish.com/chapters/rules-for-software-tutorials/about.md
