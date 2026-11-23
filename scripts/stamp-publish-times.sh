#!/usr/bin/env bash
# Give each post's front matter date the time of day it was published, so posts that share a
# day sort newest first on the home page, the blog page, the RSS feed and the next/previous
# links. Without a time, Hugo breaks those ties in its own order, and a post published today
# can miss the "Latest articles" on the home page.
#
# The publish time is the commit time of the first commit in which the post is not a draft.
# Only dates written as a bare day (date = "2026-11-23") are changed; a date that already has
# a time is left alone, and so are drafts.
#
# The deploy workflow runs this on its checkout before the Hugo build. It edits the post files
# in place and nothing commits them. Run it locally only to preview the order, then undo it with
# `git checkout -- content/blog`.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

is_draft() { grep -Eq '^draft[[:space:]]*=[[:space:]]*true' ; }

for post in content/blog/*.md; do
  [ "$(basename "$post")" = "_index.md" ] && continue
  is_draft < "$post" && continue

  day=$(sed -nE 's/^date[[:space:]]*=[[:space:]]*"([0-9]{4}-[0-9]{2}-[0-9]{2})"[[:space:]]*$/\1/p' "$post" | head -n 1)
  [ -n "$day" ] || continue

  published=""
  for commit in $(git log --reverse --format=%H -- "$post"); do
    if ! git show "$commit:$post" 2>/dev/null | is_draft; then
      published=$(git show -s --format=%cI "$commit")
      break
    fi
  done
  [ -n "$published" ] || continue # not committed yet

  stamped="${day}T${published#*T}" # front matter day, commit time of day and offset
  tmp=$(mktemp)
  awk -v day="$day" -v stamped="$stamped" '
    !done && $0 ~ "^date[[:space:]]*=[[:space:]]*\"" day "\"[[:space:]]*$" { print "date = \"" stamped "\""; done = 1; next }
    { print }
  ' "$post" > "$tmp"
  cat "$tmp" > "$post"
  rm -f "$tmp"
  echo "$post: $stamped"
done
