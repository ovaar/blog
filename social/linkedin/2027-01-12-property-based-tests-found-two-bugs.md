+++
linkedin = "2027-01-12T08:30:00+01:00"
blog = "2027-01-12T07:00:00+01:00"
url = "https://ovaar.github.io/blog/property-based-tests-found-two-bugs/"
status = "approved"
+++

We added property-based tests with fast-check to our React frontend. Two of the first eight property files found real bugs.

1. The app read the saved cart from localStorage with a TypeScript annotation and no check. A stored value of "abc" became a cart with 3 items, and a stored null crashed the page.
2. An admin label override with the key valueOf would have broken every label in the app. The check `key in bundledMessages` walks the prototype chain, so it found Object.prototype.valueOf.

Neither bug is unusual. Most JavaScript codebases use `in` and `??` on objects with keys that come from users.

What I took from it:

- A type annotation on JSON.parse does not check anything. Validate the shape where the data enters the app.
- Use Object.hasOwn or a Map for keys that come from users.
- Change the code on purpose and check that a test fails. A property that passes no matter what gives false confidence.

https://ovaar.github.io/blog/property-based-tests-found-two-bugs/

#testing #typescript #javascript
