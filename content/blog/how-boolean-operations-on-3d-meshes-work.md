+++
date = "2026-11-23"
title = "How boolean operations on 3D meshes work"
description = "Union, intersection and difference of 3D solids, explained with interactive figures: the one-line version for distance fields, the four steps a mesh boolean takes, the BSP trick from csg.js, and why floating point makes all of it hard."
type = "post"
categories = ["Development"]
tags = ["3d", "geometry", "csg", "javascript"]
visual = "csg"
+++

Drill a hole in a plate, cut a window out of a wall, merge two parts into one: in 3D software these are boolean operations. You take two solids and combine them with union, intersection or difference. Building geometry this way is called constructive solid geometry, or CSG.

It is one of the easiest operations to describe and one of the hardest to implement well. This post explains how it works, from the definition down to the steps a mesh library runs. The figures are interactive: drag the shapes and click through the steps.

The figures are 2D slices. Everything carries over to 3D: an edge in the figures stands for a triangle, and a point where two outlines cross stands for a curve where two surfaces cut through each other.

## What the operations mean

A solid is a set of points: everything inside its surface. A boolean operation is a set operation on those points:

- **Union**, A ∪ B: points in A *or* in B.
- **Intersection**, A ∩ B: points in A *and* in B.
- **Difference**, A − B: points in A and *not* in B. Unlike the other two, the order matters.

{{< ascii kind="csg" caption="A circle A and a square B. Drag B and pick an operation. The solid region is the result; the faint dots are material the operation removed." >}}

That definition only works if "inside" means something. The surface has to be closed, with no holes or gaps, and it must not cut through itself. Such a mesh is called *watertight* or *manifold*. Most boolean failures in practice start with input that isn't.

## The easy case: distance fields

Some programs don't store a surface at all. They store a function that says, for any point in space, how far it is from the surface. That is a *signed distance field* (SDF): the value is negative inside, positive outside and zero on the surface. Shader art, many game engines and 3D printing tools like this representation.

With distance fields, a boolean is one line of code:

```js
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

const union = (a, b) => Math.min(a, b);
const intersect = (a, b) => Math.max(a, b);
const subtract = (a, b) => Math.max(a, -b);

// Is the point (0.5, 0) inside "circle A minus circle B"?
const a = circle(0.5, 0, 0, 0, 1);  // -0.5: inside A
const b = circle(0.5, 0, 1, 0, 0.6); // -0.1: inside B
console.log(subtract(a, b) < 0);   // false: B cut it away
```

`min` works for union because a point is inside the union when it is inside at least one shape, so at least one distance is negative. `max` works for intersection because both must be negative. Negating B's distance turns its inside out, so difference is "A intersected with everything that isn't B". The first figure computes its picture with exactly these three functions, for every character on the grid.

The catch is that a GPU and most file formats want triangles. To get a mesh back you sample the field on a grid and run an algorithm such as marching cubes. Sharp edges come out rounded or stair-stepped, and detail is limited by the grid resolution. A CAD kernel or a modeller that has to keep its exact edges can't take that route, so it works on the triangles directly.

## The hard case: meshes

A mesh only stores the surface. There is no function to ask "is this point inside?", so a mesh boolean has to rebuild the result's surface out of pieces of the two input surfaces. Every mesh boolean library follows the same four steps:

1. **Find the crossings.** Find every place where a triangle of A cuts through a triangle of B. Together these form the *intersection curves*.
2. **Split.** Cut the triangles of both meshes along those curves, so that no triangle is partly inside the other solid anymore. Each one is now entirely in or entirely out.
3. **Classify.** Decide, for every piece, whether it lies inside or outside the other solid.
4. **Keep.** Keep the pieces the operation asks for, flip some of them, and stitch the rest into one mesh.

{{< ascii kind="csgsteps" caption="The four steps on the outlines of A and B. Click through the steps, change the operation, and drag B to see the crossings move. In step 4 the arrows are the normals of the result." >}}

Which pieces to keep follows from the definitions:

| Operation | Keep from A | Keep from B |
|---|---|---|
| A ∪ B | outside B | outside A |
| A ∩ B | inside B | inside A |
| A − B | outside B | inside A, **flipped** |

The flip in the last row is easy to miss. For A − B, the inner wall of the hole is made of B's surface. B's triangles face outward from B, but in the result that wall bounds empty space, so it has to face the other way. Every triangle in that piece gets its winding order reversed. Forget the flip and renderers draw the hole inside out, and `inside` tests on the result give wrong answers. Step 4 in the figure shows it: switch to A − B and the arrows on B's piece point into the square.

### Step 1: finding the crossings fast

Testing every triangle of A against every triangle of B costs `n × m` triangle tests. For two meshes of 100,000 triangles that is ten billion. Libraries put each mesh in a bounding volume hierarchy (BVH): a tree of boxes, where each box holds the triangles inside it. Two boxes that don't overlap rule out every triangle pair below them, so only the triangles near the intersection curve are ever tested. This is where the "bvh" in [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) comes from.

### Step 3: inside or outside

Classification uses the same trick as point-in-polygon tests in 2D. Cast a ray from the point and count how often it crosses the surface. Each crossing switches between inside and outside, so an odd count means inside and an even count means outside.

{{< ascii kind="parity" caption="Drag the point and change the ray's direction. The count changes, but whether it is odd or even doesn't." >}}

Try dragging the point so the ray passes exactly through a corner of the star. Depending on how a naive test is written, it counts that corner once or twice, and one of the two is wrong: where the outline crosses the ray, it must count once; where the ray only grazes a tip, zero or twice. The figure handles it by counting an edge only when its two ends lie on different sides of the ray, with one end inclusive and the other exclusive. A real 3D implementation needs the same care for rays that hit an edge or a vertex of a triangle.

Casting a ray for every piece is slow, and libraries rarely do. All pieces between two intersection curves are connected without crossing the other surface, so they share one classification. Classify one piece, then flood-fill its answer to its neighbours until you reach an intersection curve.

For meshes that aren't quite closed, ray parity breaks: a ray escaping through a gap misses a crossing. The *generalized winding number* ([Jacobson et al., 2013](https://igl.ethz.ch/projects/winding-number/)) gives a smooth "how much inside am I" value instead, which degrades gracefully on holes and self-intersections.

## The elegant version: BSP trees

Evan Wallace's [csg.js](https://github.com/evanw/csg.js) does mesh booleans in about 600 lines of JavaScript, comments included. Instead of the four steps, it puts each mesh in a binary space partitioning (BSP) tree. Every node of the tree is a plane taken from one of the polygons, with the polygons in front of it on one side and the polygons behind it on the other.

The key operation is `a.clipTo(b)`: push every polygon of A down B's tree, split the ones that straddle a plane, and drop the parts that end up inside B. With that one operation and `invert()`, which flips inside and outside, union is:

```js
union: function(csg) {
  var a = new CSG.Node(this.clone().polygons);
  var b = new CSG.Node(csg.clone().polygons);
  a.clipTo(b);   // drop A's parts inside B
  b.clipTo(a);   // drop B's parts inside A
  b.invert();
  b.clipTo(a);   // with B inverted: drop B's faces that coincide with A's
  b.invert();
  a.build(b.allPolygons());
  return CSG.fromPolygons(a.allPolygons());
},
```

Read the first two lines against the table: union keeps A outside B and B outside A. The invert–clip–invert sequence removes faces where A and B touch with coplanar surfaces, so the result doesn't contain the same face twice. Subtraction and intersection are the same calls with `invert()` in different places, because A − B equals the inverse of (inverse A ∪ B).

BSP trees are compact and easy to read, but they split a lot: every polygon gets cut by every plane it straddles, so the output has many slivers. The trees also get deep on big meshes, so csg.js fits small models.

## Why it is hard: floating point

The steps above are exact on paper. On a computer, every coordinate is a floating-point number, and the trouble starts when two surfaces almost touch.

- **Coplanar faces.** Put two cubes side by side so they share a face and union them. For every point on the shared face, "inside" or "outside" depends on the last bit of a rounding error. Typical results: a face left inside the solid, a missing face, or a crash.
- **Inconsistent decisions.** Step 1 decides that an edge crosses a triangle. Step 3 later decides, with slightly different arithmetic, that the same point is outside. The two answers contradict each other, and the output gets a hole.
- **Slivers.** Splitting near a vertex creates triangles thinner than float precision can represent. Their normals become noise.

A bigger epsilon doesn't fix these; it moves the failure somewhere else. The libraries that work reliably make every geometric decision in a way that can't contradict itself:

- **Exact predicates.** Questions like "which side of this plane is the point on?" can be answered exactly with adaptive precision ([Shewchuk, 1997](https://www.cs.cmu.edu/~quake/robust.html)). The answer is always the same for the same input.
- **Exact arithmetic.** [CGAL's Nef polyhedra](https://doc.cgal.org/latest/Nef_3/index.html) compute with exact rational numbers. They are correct and slow.
- **Mesh arrangements.** [Zhou et al., 2016](https://www.cs.columbia.edu/cg/mesh-arrangements/) intersect all input triangles exactly and then classify each cell of space by winding number. It is implemented in libigl.
- **Guaranteed manifold output.** [Manifold](https://github.com/elalish/manifold) by Emmett Lalish treats coplanar and touching cases with symbolic perturbation and promises a manifold result for manifold input. It is fast enough for interactive use, and OpenSCAD offers it as its geometry backend.

Blender makes the trade-off visible. Its Boolean modifier has a *Fast* solver and an *Exact* solver (added in Blender 2.91), and recent versions add Manifold as a third. Fast is fine until two faces line up; then you switch to Exact and wait longer.

## Using it

Most of the time you use a library rather than write one. In Three.js, three-bvh-csg is the common choice. With `three` 0.187 and `three-bvh-csg` 0.0.18 on Node 26:

```js
import { BoxGeometry, SphereGeometry } from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

const box = new Brush(new BoxGeometry(2, 2, 2));
const sphere = new Brush(new SphereGeometry(1.3, 32, 16));
sphere.position.x = 1;
box.updateMatrixWorld();
sphere.updateMatrixWorld();

const result = new Evaluator().evaluate(box, sphere, SUBTRACTION);
result.geometry.computeBoundingBox();
console.log(result.geometry.boundingBox.max.x); // 1: the sphere took a bite out of the box
```

`updateMatrixWorld()` matters: the evaluator reads each brush's world matrix, and without the call the sphere's position is ignored.

Whichever library you use, a few habits avoid most failures:

- **Feed it closed meshes.** Check that every edge is shared by exactly two triangles before you blame the library.
- **Don't let faces coincide.** Make a cutter slightly longer than the part it cuts through, so its ends stick out instead of lying flush with the surfaces. A hole cutter for a 10 mm plate should be 10.2 mm long, not 10.
- **Combine cutters first.** To drill twenty holes, union the twenty cylinders and subtract once. Each subtraction splits and re-indexes the whole part, so one big operation is cheaper than twenty small ones.
- **Keep the inputs.** Booleans lose information: the result doesn't know which face came from which input. A CAD program stores the operation tree and recomputes it, so you can still move the hole later.

## Summary

- A boolean operation is a set operation on the points inside two solids: union, intersection or difference.
- With signed distance fields it is `min`, `max` and `max(a, -b)`. Turning the field back into a mesh costs you sharp edges.
- A mesh boolean finds where the surfaces cross, splits both meshes there, classifies every piece as inside or outside the other solid, and keeps the pieces the operation asks for. For difference, the kept part of B is flipped.
- Inside or outside comes from counting ray crossings, or from the generalized winding number when the mesh isn't quite closed.
- The hard part is floating point. Reliable libraries use exact predicates, exact arithmetic or symbolic perturbation instead of a bigger epsilon.
