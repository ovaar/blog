---
name: linkedin
description: Write, illustrate and schedule the LinkedIn post that goes with a blog post - short text, a 1200x1500 title-card image from the live post, and scheduling in LinkedIn's own scheduler through Chrome DevTools. Use for "linkedin post", "promote this post", "schedule on linkedin", "social post for the blog".
---

# LinkedIn

One blog post a week, every Tuesday. The blog post goes live at 07:00 CET, the LinkedIn post at 08:30 CET and links to it. Each LinkedIn post lives in `social/linkedin/<YYYY-MM-DD>-<slug>.md` with its image next to it. Hugo only reads `content/`, so these files are never published.

## 1. Pick the date

1. List the dates already taken: `ls social/linkedin/`.
2. Take the next free Tuesday. Skip the weeks of 25 December and 1 January.
3. A post may only link to blog posts that are live on its date. Check the `/blog/` links in the post against their `date`.
4. Give the blog post that date with a time: `date = "2027-02-09T07:00:00+01:00"` (`+02:00` in summer time). Hugo leaves a future post out of the build. The Tuesday build in `deploy.yml` (06:00 UTC) publishes it.

Done when the blog date and the LinkedIn date are the same Tuesday.

## 2. Write the text

Rules, learned from the first round of posts:

- 40 to 80 words. The first draft was 150 to 200 words and was rejected as too long.
- The first line is the hook: a number or a result from the post ("97 useEffect calls. A week later it had 2.").
- Two or three short paragraphs, a blank line between them. No bullet lists, no headings.
- Then the link on its own line, then three lowercase hashtags on the last line.
- No `#` anywhere except the hashtag line. LinkedIn turns `#define` into a hashtag. Write "a header that defined APIENTRY as empty" instead.
- No Markdown. Backticks and `**` show up as literal characters.
- Only facts from the post. Check every number against the post text.
- Apply `.claude/skills/unslop/SKILL.md`.

File format:

```toml
+++
linkedin = "2027-02-09T08:30:00+01:00"
blog = "2027-02-09T07:00:00+01:00"
url = "https://ovaar.github.io/blog/<slug>/"
status = "review"
image = "2027-02-09-<slug>.png"
+++

<text>
```

`status` goes `review`, then `approved` once Thomas approves it, then `scheduled` once it is in LinkedIn's scheduler.

## 3. Make the image

A 1200 x 1500 px title card: OVAAR and ovaar.github.io at the top, then the category, title and subtitle, then the post's own ASCII animation filling the rest. Take it from the post page while it is still a draft or live. Use the drafts server for a future post.

1. Open the post in Chrome DevTools. Emulate viewport `1200x1500x1`, `colorScheme: dark`, `prefersReducedMotion: reduce`. Reduced motion renders the scene's still frame, which every scene is built to look good on.
2. Run `card.js` from this folder with `evaluate_script` (paste its source inline: the DevTools server cannot read files outside the repository).
3. Save the screenshot straight into the repository with `take_screenshot` and `filePath` = `social/linkedin/<date>-<slug>.png` (absolute path). Paths in the scratchpad are refused.
4. Check `sips -g pixelWidth -g pixelHeight <file>` says 1200 x 1500, then look at it. A scene that is mostly dim glyphs reads as a grey block in a feed; say so before scheduling.

For a post with no blog article (a site change), build a card from another page, for example `/experiments/` with a 3 x 3 grid of scenes and your own headline.

Show Thomas the text and the image together. Do not schedule before he approves both.

## 4. Schedule on LinkedIn

Thomas logs in himself in the DevTools Chrome window. The interface is in Dutch. Labels below are the Dutch ones.

For each post:

1. On `https://www.linkedin.com/feed/`, find the `Foto` button uid. The feed snapshot is huge: save it with `take_snapshot` `filePath` to a file in the repository, `grep 'button "Foto"'`, delete the file.
2. `upload_file` with that uid and the PNG. The image editor opens.
3. Click `Alt-tekst`. `fill` the textbox with a description ("Title card for the blog post "<title>", with its ASCII animation in light characters on a dark background."). `fill` alone does not enable the button: `type_text " "`, then `press_key Backspace`. Click `Toevoegen`, then `Volgende`.
4. Wait for `Proeflezen`, take a snapshot and note the uid of textbox `Geef uw mening…`.
5. Paste the text with `paste.js` from this folder, passing the textbox uid as the argument. It must return `exact`. The editor is ProseMirror: an HTML paste is ignored, and a plain-text paste drops blank lines, so the script pastes each paragraph and sends two Enter keydowns between them. Run `python3 -I .claude/skills/linkedin/paste.py social/linkedin/<file>.md` to print the script with the paragraphs filled in.
6. Take a screenshot and check the text, the blank lines and that the image is still there.
7. Close the `Bijdrage is ingepland.` toast if one is showing, so the next check does not see an old one.
8. Click the `Ingepland` link (the clock). Set `Datum` (`DD-MM-YYYY`) and `Tijd` (`08:30`) with `schedule.js`, passing both textbox uids. Typing into `Tijd` appends to the old value, so the script sets the value through the native setter. Check the returned line says the right day and `08:30`.
9. Click `Bevestigen`, wait for `Inplannen`, check `Wordt geplaatst op di, <date>, 08:30`, click `Inplannen`.
10. Wait until the page is back on `/feed/` with the toast `Bijdrage is ingepland.`.
11. Set `status = "scheduled"` in the post file.

When all are done, click `Ingeplande bijdragen weergeven` in the toast and check the list (`Ingepland (n)`) shows every post on the right date at 08:30.

## Known problems

- LinkedIn fetches a link preview when the post is written, not when it goes out. With an image attached, no preview card is shown, so a blog post that is offline until its date does no harm.
- GitHub disables the Tuesday build after 60 days without a commit to the repository. Committing the `status` changes keeps it running.
- A scheduled post can fail if the LinkedIn session expires. Check the post went out on Tuesday morning.
