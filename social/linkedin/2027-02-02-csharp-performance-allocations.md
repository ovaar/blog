+++
linkedin = "2027-02-02T08:30:00+01:00"
blog = "2027-02-02T07:00:00+01:00"
url = "https://ovaar.github.io/blog/csharp-performance-allocations/"
status = "approved"
+++

In 2020 I wrote a list of C# allocation tips. They came from a WPF inspection application that froze as soon as a second FPGA connected. The post stayed unfinished for six years.

In November 2026 David Fowler had AI agents go through ASP.NET Core one component at a time, looking for allocations that could be avoided. The agents opened about a hundred small pull requests. A change became a pull request only after a BenchmarkDotNet run showed a win. Public API changes and unsafe code were not allowed.

I checked my old list against their results. Most tips still hold. Two have aged. AggressiveInlining is mostly unnecessary, because dynamic PGO is on by default since .NET 8. "Use StringBuilder" became "write the characters into a span and skip the string".

I would copy their method: work on one area at a time, measure every change, and keep a change only when the benchmark shows a clear win.

https://ovaar.github.io/blog/csharp-performance-allocations/

#dotnet #csharp #performance
