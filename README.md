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

Give a post a `date` without a time (`date = "2026-11-23"`). Before building, the deploy runs
`./scripts/stamp-publish-times.sh`, which adds the time of the first commit in which the post is
not a draft. That way the newest post is listed first on the home page, on the blog page and in
RSS, even when several posts share a day. A local preview has no times, so posts from the same
day can show up in a different order there.

`./scripts/deploy.sh` does the same build and push from your own machine, for when CI is not an
option. It does not stamp publish times, so the next CI deploy restores the order.

## Guidelines

https://refactoringenglish.com/chapters/rules-for-software-tutorials/about.md
