+++
date = "2026-11-23"
title = "Autodesk SVF to glTF: what the tutorials leave out"
description = "Four pitfalls converting Autodesk SVF to glTF for Three.js: keep the node tree, carry dbId as _ID, preserve material names, never guess units."
type = "post"
categories = ["Development"]
tags = ["3d", "gltf", "autodesk", "typescript"]
+++

When you upload a CAD file to Autodesk Platform Services (formerly Forge), the Model Derivative API translates it to SVF, the format the Autodesk viewer reads. That works well as long as you stay inside the Autodesk viewer.

We wanted to render the same models with [Three.js](https://threejs.org/) and [React Three Fiber](https://r3f.docs.pmnd.rs/), so we needed [glTF](https://www.khronos.org/gltf/). Getting triangles out of SVF and into glTF is the easy part. The hard part is everything a product configurator depends on besides the triangles.

This post covers the four things that cost us the most time.

{{< ascii kind="twin" caption="The same model as SVF and as glTF: the triangles change format, the node tree and material names don't." >}}

## 1. The node tree is an API contract

A configurator shows, hides and recolours parts based on the options a customer picks. Those rules point at nodes in the model tree by name or by id.

That makes the node tree an interface, in the same way a REST endpoint is. Any conversion step that merges, renames, removes or re-parents nodes breaks every binding that points at them, and nothing fails loudly. A part simply stops reacting.

The rule we ended up with:

> Optimize the geometry beneath the node tree, but never change the tree itself.

Mesh simplification, Draco compression and deduplication of buffers are all fine. Flattening the hierarchy to save draw calls is not.

## 2. Keep the object id on the geometry

Every object in an SVF has a `dbId`. The property database, selection and the viewer API all use it.

glTF has no place for it by default, so the converter needs to carry it across. We store it as a custom vertex attribute named `_ID`. The underscore prefix matters: the glTF specification reserves unprefixed names for its own attributes, and tools are allowed to drop what they don't recognise.

{{< ascii kind="ids" caption="Every vertex carries its object's `dbId` as `_ID`. On hover the viewer reads `_ID` back and selects the matching object." >}}

One early mistake was writing the id into `COLOR_0`. It worked, until a tool further down the pipeline treated it as a colour.

## 3. Material names are bindings too

Colour and material overrides bind by glTF material name. A converter that deduplicates materials and renames them `material_12` produces a valid file that is useless to us.

So material names pass through untouched, and we added a guard to the pipeline that fails the conversion if a name changes between input and output.

## 4. Never guess the unit

CAD models come in millimetres, inches, metres, and sometimes with no unit at all. SVF carries a distance unit in its metadata.

{{< ascii kind="units" caption="Read the unit and convert once to metres. Millimetres and inches end up the same size; a model without a unit stays dimensionless." >}}

Our first renderer tried to be helpful. If a model looked about a thousand times too big, it assumed millimetres and scaled it down. That heuristic was right most of the time, which is the worst kind of wrong.

What we do now:

* The converter reads the unit and converts to SI metres.
* A missing or empty unit means *dimensionless*. It is passed on as such, and nothing downstream guesses.
* The renderer does no scaling of its own.

## How we keep it correct

Rules like these erode unless a test holds them in place. Two things helped:

* **Byte-identical regression tests.** Before refactoring the converter we converted a set of public-domain CAD models on `main`, stored the output, and required the refactored branch to produce the same bytes.
* **A corpus of real models.** Unit tests on hand-made cubes found nothing. Real models with thousands of nodes, instancing and odd units found something almost every time.

## Takeaways

* Treat the node tree and the material names as a public interface.
* Carry the `dbId` across in a custom, underscore-prefixed attribute.
* Read the unit, convert once, and never guess.
* Lock the behaviour in with regression tests on real models before you refactor.
