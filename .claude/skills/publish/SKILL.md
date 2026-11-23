---
name: publish
description: Publish the blog to https://ovaar.github.io - build check, merge to master, watch the Deploy Blog run and the GitHub Pages build, then verify the live pages. Use for "publish", "deploy the blog", "make this post live".
disable-model-invocation: true
---

# Publish

The deploy path has three hops. Each one must be green before the next is checked:

1. Push to `master` in `ovaar/blog` triggers the **Deploy Blog** workflow (`.github/workflows/deploy.yml`).
2. The workflow clones `ovaar/ovaar.github.io` `master` fresh into `public` with the SSH deploy key, empties it, builds Hugo into it and pushes the result to `master`. Pages that no longer exist in the source disappear from the site. The pinned `public` submodule commit in `ovaar/blog` is not used.
3. That push triggers a **legacy Pages build** (`build_type: legacy`). It does not run as a GitHub Actions workflow, so `gh run` never shows it. Read it from the Pages API.

Publishing is done when every page this publish changed returns 200 on the live site with its new content.

## Steps

1. **Collect the changed pages.** Diff the branch against `origin/master` (or, when already on `master`, against the last commit that deployed successfully). Map each changed `content/blog/<slug>.md` to `https://ovaar.github.io/blog/<slug>/`, and `content/about.md` to `/about/`. Theme or config changes map to `/` and one existing post. Record the title of each page and one distinctive line from its body. This is the **verify list**.
   Done when every changed content file has a URL and a marker string.

2. **Build check.** Run `docker compose run --rm -e HUGO_ENVIRONMENT=production blog --gc --minify --noTimes --renderToMemory`. `--renderToMemory` keeps the `public` submodule clean.
   Then list what will go live: every post under `content/blog/` without `draft = true` is published. Run `grep -L '^draft = true' content/blog/*.md` and compare it with what Thomas expects. A post that should stay unpublished but lacks the flag is a blocker: stop and ask.
   Done when Hugo exits 0 with no `ERROR` lines and the publish list is confirmed. Fix any errors before going on.

3. **Get the change onto `master`.**
   - On a feature branch: commit what is uncommitted, push, open a PR with `gh pr create` (or reuse the open PR), then `gh pr merge --squash --delete-branch`.
   - Already on `master`: `git push origin master`.
   Record the resulting `master` SHA as `$SHA`.

4. **Watch Deploy Blog.** Find the run: `gh run list --workflow deploy.yml --commit $SHA --json databaseId,status`. It shows up a few seconds after the push. If the list is empty, run the same command again. Then block on it with `gh run watch <id> --exit-status` (this command runs in the foreground until the run finishes). Tell Thomas you are waiting on the run before you start the watch.
   Done when the run concludes `success`. On failure, read `gh run view <id> --log-failed`, report the cause, and stop. See *Known failures*.

5. **Watch the Pages build.** Take the new head of the Pages repo:
   `gh api repos/ovaar/ovaar.github.io/commits/master --jq '.sha,.commit.committer.date'`. Its date must be after the Deploy Blog run started. An older date means the workflow committed nothing (`Site unchanged, nothing to publish.` in the log), so say that.
   Then check `gh api repos/ovaar/ovaar.github.io/pages/builds/latest --jq '{status,commit,error}'`.
   Done when `commit` equals that head SHA and `status` is `built`. A build usually takes about a minute. While the status is `queued` or `building`, check again. If `status` is `errored`, report `error.message` and stop.

6. **Verify live.** GitHub Pages serves with `cache-control: max-age=600`, so add a cache-buster to every request:
   `curl -sL -o page.html -w '%{http_code}' "https://ovaar.github.io/blog/<slug>/?v=$SHA"`.
   Done when every URL on the verify list returns 200 and contains its marker string. Then open the homepage and one changed post in Chrome DevTools, take a screenshot, and check that the layout renders and the console has no errors.

7. **Report.** For each page: its URL, its HTTP status, whether the marker was found, the Deploy Blog run URL and the Pages commit SHA.

## Known failures

- `Permission denied (publickey)` in *Clone the site repository*, or `The key you are authenticating with has been marked as read only` in *Publish to ovaar.github.io*: the deploy key is missing, was removed, or has no write access. The workflow authenticates with an SSH deploy key: its public half is a deploy key with write access on `ovaar/ovaar.github.io`, its private half is the `PAGES_DEPLOY_KEY` Actions secret of `ovaar/blog`. A deploy key does not expire. Creating credentials is Thomas's call, so give him these commands to run with `!` and don't run them yourself:
  ```sh
  ssh-keygen -t ed25519 -N "" -C "ovaar/blog Deploy Blog workflow" -f /tmp/blog_deploy_key
  gh repo deploy-key add /tmp/blog_deploy_key.pub -R ovaar/ovaar.github.io --allow-write --title "ovaar/blog Deploy Blog workflow"
  gh secret set PAGES_DEPLOY_KEY -R ovaar/blog < /tmp/blog_deploy_key
  rm /tmp/blog_deploy_key /tmp/blog_deploy_key.pub
  ```
  `gh secret set` encrypts the value and stores it on GitHub as a repository secret; nothing stays on the machine once the key files are removed. Remove the old deploy key with `gh repo deploy-key delete <id> -R ovaar/ovaar.github.io` if one is listed. Then re-run with `gh run rerun <id>` and continue at step 4.
- `! [rejected] HEAD -> master (fetch first)` in *Publish to ovaar.github.io*: something else pushed to `ovaar/ovaar.github.io` while the run was building. Re-run with `gh run rerun <id>`; the clone picks up the new head.
- `mkdir /cache/images: permission denied` in *Build with Hugo*: the Hugo cache volume is not mounted. The build step must keep `-v "${{ runner.temp }}/hugo_cache:/cache"`.
- Deploy Blog green but the live page is old: either the Pages build is still running (step 5) or the CDN is serving cache. Retry with a new cache-buster value before suspecting the build.
