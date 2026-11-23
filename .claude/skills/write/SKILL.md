---
name: write
description: Write technical blog content.
disable-model-invocation: true
---

# Write

Write a blog post for my technical blog called 'ovaar'.

Rules
1. Remember your audience but don't assume anything: document the obvious.
2. Don't try reinventing the wheel: what you write must blend in, never step out.
3. Adopt a direct and neutral tone: no jokes, no random emojis, no funny GIFs.
4. Stick to simple English: one shouldn't need a dictionary to understand documentation.
5. Write concise, straight-to-the-point content with short sentences separated into sections.
6. Never say something is "easy" or "difficult".
7. Make sure your directions are displayed in numbered lists. Remember: one step = one action.
8. Replace enumerations with bullet lists and complex lists with tables.
9. Use pronouns sparingly and never ambiguously; avoid abbreviations and use acronyms sparingly.
10. Take advantage of the power of illustrations: diagrams are sometimes better than long sentences. Where a screenshot would help add it.
11. Don't overuse capital letters and bold: use proper content formatting instead.
12. Inform the reader ahead of time using tldr; attention is valuable. Use a summary at the beginning of the post, and a conclusion at the end.

Output
* Save the post as `content/blog/<kebab-case-slug>.md`. It is served at `/blog/<slug>/`.
* Start with TOML front matter between `+++` lines. All fields are required:

  ```toml
  +++
  date = "YYYY-MM-DD"
  title = "What the reader will learn or fix"
  type = "post"
  description = "One or two sentences, at most 160 characters."
  categories = ["Development"]
  tags = ["cpp"]
  +++
  ```

  * `type = "post"` lists the post on the homepage, `/blog/` and the newer/older links. Without it the post is unreachable.
  * `description` is the article subtitle, the homepage card text and the meta description.
  * `categories`: pick from `Development`, `DevOps`, `Linux`, `Performance`, `Python`. Ask before adding a new one.
  * `tags`: reuse existing tags in lowercase (see `/tags/`); they also pick the post's animation.
* Don't start the body with a `# Title` heading; the theme shows the title. Start with the summary, then `##` sections.
* Diagrams:
  * Static diagrams go in a fenced `text` code block.
  * An animation inside the article: `{{< ascii kind="pipeline" caption="What it shows" >}}`.
  * To choose the article's top animation, set `visual = "<scene>"` in the front matter. Scenes and how to add one: the `ascii-art` skill.
* Include code snippets with a language on every fence (` ```cpp `, ` ```yaml `).

Verify
1. Read `.claude/skills/unslop/SKILL.md` and apply its rules to the draft.
2. Start the site with `docker compose up server` and open `http://localhost:1313/blog/<slug>/`. Check the post is listed on the homepage.
3. Save the rendered page: `curl -s http://localhost:1313/blog/<slug>/ -o <scratchpad>/page.html`.
4. Run the `claude-seo:seo-page` skill on that file, with base URL `https://ovaar.github.io/blog/<slug>/`. Its fetcher refuses localhost, so pass the file, not the localhost URL.
5. Run the `claude-seo:seo-geo` skill on the same file for citability and passage structure. Its crawler-access checks need a live site; run those against `https://ovaar.github.io/`, not the unpublished post.
6. Fix the findings that belong to the post (title, description, headings, content, alt text). Report findings that belong to the theme instead of changing it.
7. Stop the server: `docker compose stop server`.
