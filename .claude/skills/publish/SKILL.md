---
name: publish
description: Publish the blog to https://ovaar.github.io - build check, merge to master, watch the Deploy Blog run and the GitHub Pages build, then verify the live pages. Use for "publish", "deploy the blog", "make this post live".
disable-model-invocation: true
---

# Publish

The deploy path has three hops. Each one must be green before the next is checked:

1. Push to `master` in `ovaar/blog` triggers the **Deploy Blog** workflow (`.github/workflows/deploy.yml`).
2. The workflow builds Hugo into the `public` submodule and pushes it to `ovaar/ovaar.github.io` `master`.
3. That push triggers a **legacy Pages build** (`build_type: legacy`). It does not run as a GitHub Actions workflow, so `gh run` never shows it. Read it from the Pages API.

Publishing is done when every page this publish changed returns 200 on the live site with its new content.

## Steps

1. **Collect the changed pages.** Diff the branch against `origin/master` (or, when already on `master`, against the last commit that deployed successfully). Map each changed `content/blog/<slug>.md` to `https://ovaar.github.io/blog/<slug>/`, and `content/about.md` to `/about/`. Theme or config changes map to `/` and one existing post. Record the title of each page and one distinctive line from its body. This is the **verify list**.
   Done when every changed content file has a URL and a marker string.

2. **Build check.** Run `docker compose run --rm blog --gc --minify --noTimes --renderToMemory`. `--renderToMemory` keeps the `public` submodule clean.
   Done when Hugo exits 0 with no `ERROR` lines. Fix any errors before going on.

3. **Get the change onto `master`.**
   - On a feature branch: commit what is uncommitted, push, open a PR with `gh pr create` (or reuse the open PR), then `gh pr merge --squash --delete-branch`.
   - Already on `master`: `git push origin master`.
   Record the resulting `master` SHA as `$SHA`.

4. **Watch Deploy Blog.** Find the run: `gh run list --workflow deploy.yml --commit $SHA --json databaseId,status`. It shows up a few seconds after the push. If the list is empty, run the same command again. Then block on it with `gh run watch <id> --exit-status` (this command runs in the foreground until the run finishes). Tell Thomas you are waiting on the run before you start the watch.
   Done when the run concludes `success`. On failure, read `gh run view <id> --log-failed`, report the cause, and stop. See *Known failures*.

5. **Watch the Pages build.** Take the new head of the Pages repo:
   `gh api repos/ovaar/ovaar.github.io/commits/master --jq '.sha,.commit.committer.date'`. Its date must be after the Deploy Blog run started. An older date means the workflow committed nothing (`No changes to commit` in the log), so say that.
   Then check `gh api repos/ovaar/ovaar.github.io/pages/builds/latest --jq '{status,commit,error}'`.
   Done when `commit` equals that head SHA and `status` is `built`. A build usually takes about a minute. While the status is `queued` or `building`, check again. If `status` is `errored`, report `error.message` and stop.

6. **Verify live.** GitHub Pages serves with `cache-control: max-age=600`, so add a cache-buster to every request:
   `curl -sL -o page.html -w '%{http_code}' "https://ovaar.github.io/blog/<slug>/?v=$SHA"`.
   Done when every URL on the verify list returns 200 and contains its marker string. Then open the homepage and one changed post in Chrome DevTools, take a screenshot, and check that the layout renders and the console has no errors.

7. **Report.** For each page: its URL, its HTTP status, whether the marker was found, the Deploy Blog run URL and the Pages commit SHA.

## Known failures

- `remote: Permission to ovaar/ovaar.github.io.git denied` / `403` in the *Run docker compose* step: the `GH_PAT` secret in `ovaar/blog` has expired, or it lacks `Contents: write` on `ovaar/ovaar.github.io`. Only Thomas can rotate the token. Tell him to update the PAT and run `gh secret set GH_PAT -R ovaar/blog`, then re-run with `gh run rerun <id>`. Then continue at step 4.
- Deploy Blog green but the live page is old: either the Pages build is still running (step 5) or the CDN is serving cache. Retry with a new cache-buster value before suspecting the build.
