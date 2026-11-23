+++
linkedin = "2026-12-01T08:30:00+01:00"
blog = "2026-12-01T07:00:00+01:00"
url = "https://ovaar.github.io/blog/six-months-of-agentic-coding-what-actually-changed/"
status = "approved"
+++

Since May I have led a team where coding agents write most of the code. In that time I merged a little under 500 pull requests.

That number says less than it seems to. Typing was never the bottleneck. What changed is where I spend my attention:

1. I write constraints instead of code. When I give an agent the same correction twice, a line is missing from AGENTS.md.
2. The agent that builds a feature does not review it. A separate critic sees only the result and the bar the result has to meet.
3. Small pull requests matter more now. An agent can write a 4,000-line pull request, and nobody can review that.
4. "Tests pass" is the weakest claim an agent can make. For visual work I ask for a screenshot of the running application.
5. Lint rules, formatting checks and audit gates now take little effort to add. Each check in CI stops a mistake before an agent can merge it.

Some things stayed the same. A person still has to know what good work looks like, talk to the customer and answer for what ships.

https://ovaar.github.io/blog/six-months-of-agentic-coding-what-actually-changed/

#agenticcoding #softwareengineering #codereview
