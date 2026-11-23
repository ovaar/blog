+++
date = "2025-01-31"
title = "GitHub Actions: deploy Hugo to a Pages submodule"
description = "Fix 403 errors when a GitHub Actions workflow pushes a Hugo build to a GitHub Pages submodule: a fine-grained token, submodule checkout and the push."
type = "post"
categories = ["DevOps", "GitHub Actions", "Docker"]
tags = ["github", "devops", "docker", "git"]
+++

The workflow builds the blog in Docker and pushes the result into a second repository, and the push fails:

```plaintext
remote: Permission to <owner>/<repo>.git denied to github-actions[bot].
fatal: unable to access 'https://github.com/<owner>/<repo>.git/': The requested URL returned error: 403
```

The built-in `GITHUB_TOKEN` is only valid for the repository the workflow runs in. This blog keeps its generated site in a separate GitHub Pages repository, mounted as the `public` submodule, so pushing there needs a token that has access to that repository. The fix has three parts: a personal access token, a checkout that uses it, and a push from inside the submodule.

## 1. Create a personal access token

1. Go to GitHub Settings, Developer settings, Personal access tokens, Fine-grained tokens, and generate a new token.
2. Set an expiry date.
3. Under repository access, select only the repository you push to (the Pages repository).
4. Under permissions, set Contents to Read and write.
5. Copy the token.

Then store it as a repository secret in the repository that runs the workflow: Settings, Secrets and variables, Actions, New repository secret. The workflow below expects the name `GH_PAT`.

The token stops working on its expiry date. Put a reminder in your calendar to create a new one and update the secret.

## 2. Check out with the token and configure the submodule

Pass the token to `actions/checkout` so the submodules are cloned with it. Then rewrite GitHub URLs to include the token and set a commit identity inside the `public` submodule:

```yaml
name: Deploy Blog

on:
  push:
    branches:
      - master
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v7
        with:
          submodules: recursive
          fetch-depth: 0
          token: ${{ secrets.GH_PAT }}
          persist-credentials: true

      - name: Configure git credentials for submodule
        run: |
          git config --global url."https://x-access-token:${{ secrets.GH_PAT }}@github.com/".insteadOf "https://github.com/"
          cd public
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
```

The `url.insteadOf` setting makes every `https://github.com/` URL carry the token, including the submodule's remote from `.gitmodules`, so the later `git push` from `public` is authenticated.

## 3. Build and push from the submodule

Run the Hugo build through `docker compose`, then commit and push from inside `public`:

```yaml
      - name: Get UID and GID
        run: |
          echo "UID=$(id -u)" >> $GITHUB_ENV
          echo "GID=$(id -g)" >> $GITHUB_ENV

      - name: Prepare Hugo cache directory
        run: mkdir -p "${{ runner.temp }}/hugo_cache"

      - name: Run docker compose
        run: |
          docker compose run --rm \
            -v "${{ runner.temp }}/hugo_cache:/cache" \
            blog \
              --gc \
              --minify \
              --noTimes

          cd public
          git add .
          git commit -m "Deploy site $(date)" || echo "No changes to commit"
          git push origin master
        env:
          HUGO_CACHEDIR: ${{ runner.temp }}/hugo_cache
          HUGO_ENVIRONMENT: production
```

The UID and GID are exported so the container user matches the runner user and can write to the mounted directories. The `|| echo` after `git commit` keeps the step green when nothing changed.

## Summary

- `GITHUB_TOKEN` cannot push to another repository, so use a fine-grained personal access token limited to the target repository, with Contents read and write and an expiry date, stored as a repository secret.
- Pass it to `actions/checkout` with `token:` and `submodules: recursive`.
- Rewrite `https://github.com/` URLs with `url.insteadOf` and set the git identity inside the submodule.
- Build with `docker compose run`, then commit and push from `public`.
