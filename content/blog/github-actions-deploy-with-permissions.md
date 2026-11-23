+++
date = "2025-01-31"
title = "GitHub Actions: push to a repo with a deploy key"
description = "Fix the 403 when a GitHub Actions workflow pushes a Hugo build to another repository: use an SSH deploy key, clone the repo fresh and push HEAD:master."
type = "post"
categories = ["DevOps", "GitHub Actions", "Docker"]
tags = ["github", "devops", "docker", "git"]
+++

The workflow builds the blog in Docker and pushes the result into a second repository, and the push fails:

```plaintext
remote: Permission to <owner>/<repo>.git denied to github-actions[bot].
fatal: unable to access 'https://github.com/<owner>/<repo>.git/': The requested URL returned error: 403
```

The built-in `GITHUB_TOKEN` is only valid for the repository the workflow runs in. This blog publishes its generated site to a separate GitHub Pages repository, so the push needs a credential for that repository. The fix is an SSH deploy key with write access to it.

## Why a deploy key

A personal access token works too, but a deploy key is a better fit here:

- It is scoped to one repository, so it cannot grant access to anything else.
- It does not expire, so there is no reminder to renew it.

## 1. Create the key and store it

Generate a key pair without a passphrase, register the public half as a deploy key with write access on the site repository, and store the private half as an Actions secret in the repository that runs the workflow:

```shell
ssh-keygen -t ed25519 -N "" -f deploy_key
gh repo deploy-key add deploy_key.pub -R <owner>/<site-repo> --allow-write
gh secret set PAGES_DEPLOY_KEY -R <owner>/<source-repo> < deploy_key
rm deploy_key deploy_key.pub
```

`gh secret set` sends the value to GitHub, which stores it encrypted. It is not kept locally, so after the last line the private key exists only as the secret.

## 2. Clone the site repository fresh

The blog repository still lists the site repository as the `public` submodule, but the workflow does not use it. It checks out the source with `submodules: false`:

```yaml
      - name: Checkout blog source
        uses: actions/checkout@v7
        with:
          fetch-depth: 0 # full history: enableGitInfo reads lastmod from git
          submodules: false # the site repo is cloned fresh below, not from the pinned submodule
```

A fresh clone is needed because of how a submodule is checked out:

- A submodule checkout is a detached HEAD at the pinned commit, so there is no local `master` branch to push.
- The pin goes stale. Once the site repository has moved past the pinned commit, a push from it is rejected as non-fast-forward.

Then the workflow writes the key from the secret, trusts the GitHub host key and clones the site repository into `public`:

```yaml
      - name: Clone the site repository
        env:
          DEPLOY_KEY: ${{ secrets.PAGES_DEPLOY_KEY }}
        run: |
          mkdir -p ~/.ssh
          printf '%s\n' "$DEPLOY_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
          echo "GIT_SSH_COMMAND=ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes" >> "$GITHUB_ENV"
          rm -rf public
          GIT_SSH_COMMAND="ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes" \
            git clone --depth 1 --branch master git@github.com:ovaar/ovaar.github.io.git public
          # Start from an empty tree so pages that no longer exist are removed from the site.
          find public -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
```

Emptying the clone (except `.git`) means pages that no longer exist are removed from the site on the next deploy.

## 3. Build into the clone

Hugo runs in Docker and writes into `public`. It runs as the runner user so it can write into the checkout and git can read the result:

```yaml
      - name: Build with Hugo
        run: |
          mkdir -p "${{ runner.temp }}/hugo_cache"
          # Run Hugo as the runner user so it can write into the checkout and git can read it.
          docker compose run --rm --user "$(id -u):$(id -g)" \
            -e HUGO_ENVIRONMENT=production \
            -e HUGO_CACHEDIR=/cache \
            -v "${{ runner.temp }}/hugo_cache:/cache" \
            blog --gc --minify --noTimes
          test -f public/index.html
```

The `test -f public/index.html` line fails the step if the build produced nothing, so an empty site is not pushed.

## 4. Commit and push HEAD:master

```yaml
      - name: Publish to ovaar.github.io
        working-directory: public
        run: |
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
          git add --all
          if git diff --cached --quiet; then
            echo "Site unchanged, nothing to publish."
            exit 0
          fi
          git commit -m "Deploy ${GITHUB_SHA::7}: $(git -C .. log -1 --format=%s)"
          git push origin HEAD:master
```

`git push origin HEAD:master` pushes whatever the clone has checked out to `master`, so it does not depend on a local branch name. The workflow also sets `concurrency` with `cancel-in-progress: false`, so a newer push waits for the running deploy instead of racing it.

## Summary

- `GITHUB_TOKEN` cannot push to another repository.
- Create an SSH key, add the public key as a write-enabled deploy key on the site repository and the private key as the `PAGES_DEPLOY_KEY` secret in the source repository.
- Check out the source with `submodules: false` and clone the site repository fresh with the key.
- Build with Hugo into the clone, commit, and `git push origin HEAD:master`.
