+++
date = "2026-12-01T07:00:00+01:00"
title = "Six months of agentic coding: what actually changed"
description = "After about 500 merged PRs with coding agents: write constraints instead of code, separate builder and critic, keep PRs small, and verify like a user."
type = "post"
categories = ["Development"]
tags = ["ai", "agents", "workflow"]
+++

Since May I've led a team where coding agents do most of the typing. In that time I merged a little under 500 pull requests across our platform, our 3D viewer and the conversion tooling behind it.

The number says less than it seems to. Typing was never the bottleneck. What changed is where my attention goes, and this post is about that.

## 1. I write constraints, not code

Most of my corrections to an agent are not about logic. They are about things the codebase can't tell it:

* "We use oxfmt here, not prettier."
* "Don't use public packages for this, we maintain a fork."
* "Treat the node tree as an API contract."

Each of those cost me a wasted run the first time. Now they live in the repository, in an `AGENTS.md` or in memory the agent reads at the start of a session. A correction I have to give twice is a missing line in that file.

## 2. The builder should not grade its own work

An agent that implements a feature and then reviews it will tell you it looks good. The fix is the same as with people: separate the roles.

We run a builder and a separate critic that has not seen the builder's reasoning, only the result and the bar it has to meet. For UI work the bar is the design, and the critic compares screenshots against it. The loop repeats until the critic can't tell which is which, or until it is clear the approach is wrong.

Context separation is the part that matters. When I let both roles share one context, the critic inherited the builder's blind spots.

## 3. Small pull requests matter more, not less

An agent will happily produce a 4,000-line pull request. Nobody can review that, and an AI reviewer can't either.

What works for us:

* **Stacked pull requests.** One concern each, reviewed in order.
* **An automated reviewer on every pull request**, with written "lenses" for the things we care about, such as the data types in a database migration.
* **One round of rework** on the reviewer's remarks, then a human decides.

## 4. Verify like a user

"Tests pass" is the weakest claim an agent can make. For anything visual I ask for proof from the running application: open the page, click through the flow, take the screenshot.

It is slower. It also catches the things that would otherwise reach a customer, like a 3D scene that renders on desktop and is black on a phone.

## 5. Hygiene pays twice

Linting, formatting, audit gates, test coverage and release automation used to be things a team got around to. With agents they are cheap to add, and they pay back immediately, because every guard in CI is a mistake an agent can't merge.

## What didn't change

* Someone still has to know what good looks like.
* Someone still has to talk to the customer.
* Someone is still accountable for what ships.

The work moved from writing code to deciding what should exist and checking that it does. I find I like that part of the job more.

{{< ascii kind="handoff" caption="Before: one large change, written by me, waits for review. After: I write the rules, agents open small PRs, and a critic and CI turn some back before anything merges." >}}
