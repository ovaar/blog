+++
linkedin = "2027-01-19T08:30:00+01:00"
blog = "2027-01-19T07:00:00+01:00"
url = "https://ovaar.github.io/blog/how-boolean-operations-on-3d-meshes-work/"
status = "approved"
+++

Drilling a hole in a plate or cutting a window into a wall is a boolean operation in 3D software. Boolean operations take little effort to describe and a lot of effort to implement well.

I wrote a post that explains them with interactive figures. You drag the shapes and click through each step.

- With signed distance fields, a boolean is one line of code: min, max or max(a, -b).
- With meshes it takes four steps. Find where the surfaces cross, split both meshes there, mark each piece as inside or outside the other solid, and keep the pieces the operation asks for.
- Floating point causes most of the failures. Reliable libraries use exact predicates or exact arithmetic instead of a larger epsilon.

One practical tip: a hole cutter for a 10 mm plate should be 10.2 mm long, so that no faces lie flush.

https://ovaar.github.io/blog/how-boolean-operations-on-3d-meshes-work/

#3d #computergraphics #cad
