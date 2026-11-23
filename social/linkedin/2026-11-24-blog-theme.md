+++
linkedin = "2026-11-24T08:30:00+01:00"
blog = "none, the post is about the blog theme"
url = "https://ovaar.github.io/"
status = "approved"
+++

I rebuilt the theme of my blog with a coding agent, in a series of small pull requests that I reviewed one at a time.

What readers see:

- The layout is monochrome. Text is set in a serif font. Code, labels and navigation use a monospace font.
- Every post has a generative ASCII animation. There are 15 scenes, and each scene shows the subject of its post, such as a CI pipeline or two meshes that cut each other. The post title is the random seed, so a post looks the same on every visit. With reduced motion turned on, the scene shows one still frame.
- Some figures respond to input. In upcoming posts you drag the shapes and click through an algorithm one step at a time.
- On a monitor wider than 1920 px the page grows to at most 2200 px. The old theme stopped at 1240 px.

What agents get:

- The site publishes /llms.txt. Hugo generates it from the posts, so the list always matches the site. Every page also has JSON-LD.
- The repository has four skills for the agent that works on the blog. The first says how to write a post. The second lists the rules that remove AI patterns from the text. The third says how to build an ASCII scene and how to check it at 390 px, in dark mode and with reduced motion. The fourth publishes the site and reports success only when the live URL returns the new content.

I would copy the skills to other projects first. When I gave the agent the same correction twice, the correction became a line in a skill.

https://ovaar.github.io/
All 15 scenes: https://ovaar.github.io/experiments/

#agenticcoding #webdesign #hugo
