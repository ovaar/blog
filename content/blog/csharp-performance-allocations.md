+++
date = "2027-02-02T07:00:00+01:00"
title = "C# performance 2: cutting allocations, then and now"
description = "My 2020 list of C# allocation tips, checked against David Fowler's 2026 effort where AI agents opened about a hundred allocation PRs against ASP.NET Core: what still holds, what changed, and what the microbenchmarks did not show."
type = "post"
categories = ["Development", "Performance"]
tags = ["csharp", "dotnet", "perf", "gc"]
+++

In [part 1](/blog/csharp-performance-profiling-introduction/) I described profiling a C# WPF application for a steel plate inspection system. It parsed TCP streams from FPGAs and updated a 3D model in near real-time, and it froze the machine as soon as more than one FPGA was connected. Part 2 was supposed to cover the fixes, most of which were about one thing: the garbage collector was doing far too much work because the code allocated far too much.

That draft sat unfinished for six years. When I opened it again, half of the tips in it had aged. Then David Fowler posted [dotnet/aspnetcore#70219](https://github.com/dotnet/aspnetcore/issues/70219). Starting in November 2026, AI agents went through ASP.NET Core one component at a time, looking for avoidable allocations and CPU work on hot paths. They opened about a hundred small PRs, each with its own benchmark. It is the same work I did on that inspection app, done across a whole framework, with every result written down. So this post is part 2, rebuilt around that effort.

## Why allocations are a performance problem

Allocating in .NET is cheap: the runtime bumps a pointer. The cost comes later. Every allocation fills up generation 0, and when generation 0 is full the GC stops to find out what is still alive. Objects that survive get copied to generation 1, then generation 2, and collecting generation 2 is expensive. A code path that allocates on every request, packet or frame turns into a steady stream of collections.

In the inspection app, every "shot" from every FPGA went through the parser. An allocation that looks harmless in a method that runs once becomes thousands of allocations per second in a method that runs per shot. The fix is the same in a web server: find the code that runs per request, and make it allocate less.

## How the ASP.NET Core effort worked

The method is worth copying, with or without AI agents:

- **One area per worker.** Each agent session took one part of the stack (Kestrel, routing, middleware, Identity, and so on) and checked existing PRs first, so it would not duplicate work.
- **Measure before proposing.** A candidate change was benchmarked with [BenchmarkDotNet](https://benchmarkdotnet.org/): main against the PR, three interleaved rounds, with `MemoryDiagnoser` to report bytes allocated per operation. A change became a PR only if the benchmark showed a win worth having.
- **Strict rules.** No public API changes, no behavior changes, no `unsafe` code. Pool or cache only when nothing pooled or cached is reachable by callers or can leak between requests. Prefer existing BCL building blocks such as `SearchValues`, `IndexOfAny` and `Ascii` over custom vectorized code.
- **Small PRs.** One win per PR, so each can be reviewed, merged or rejected on its own.

Fowler is explicit that this was not hands-off. His messages to the agents set the constraints, for example:

> Changing object lifetimes, pooling are possible but consider data exposed to callers or customers

and

> Consider also that we need to make sure PRs are green, it has to work not just be fast

That matches my experience in [six months of agentic coding](/blog/six-months-of-agentic-coding-what-actually-changed/): the agents write the code, but the constraints and the definition of "better" have to come from someone who knows the system.

## The patterns that came out of it

Most of the PRs fall into a handful of patterns. None of them are new. That is the point: the same few habits account for most avoidable allocations.

### 1. Do not build a string just to write bytes

For HTTP/2 and HTTP/3, Kestrel writes the `Content-Length` header by turning the number into a `string` and then encoding that string into the response buffer. The runtime only caches the strings for numbers below 300, so most responses allocate a string just to copy its digits. [#70117](https://github.com/dotnet/aspnetcore/pull/70117) (still open) writes the digits straight into the output instead. For HTTP/1.1, which did not allocate but formatted large values with a hand-written digit loop, [#70136](https://github.com/dotnet/aspnetcore/pull/70136) (merged) switched to `ulong.TryFormat` and cut the time by 43–47% for values of 1,000 and up. Since .NET 8, numbers can format directly to UTF-8 bytes, so the intermediate string is not needed at all.

Here is a minimal version of the pattern, not Kestrel's actual code:

```csharp
// Before: allocates a string, then encodes it
int written = Encoding.ASCII.GetBytes(length.ToString(), buffer);

// After: formats straight into the destination as UTF-8
length.TryFormat(buffer, out int written);
```

BenchmarkDotNet with `[MemoryDiagnoser]`, .NET 10.0.11 on an Apple M5:

| Method | Mean | Allocated |
|---|---:|---:|
| Via string | 6.41 ns | 40 B |
| `TryFormat` | 2.12 ns | 0 B |

Four nanoseconds and 40 bytes is nothing on its own. It matters for code that runs on every response.

### 2. Keep LINQ out of hot paths

LINQ allocates: a delegate here, an enumerator there, a `HashSet` for `Distinct`. In code that runs once, that does not matter. In code that runs per request, it adds up. [#70223](https://github.com/dotnet/aspnetcore/pull/70223) rewrote Identity's `PasswordValidator` without LINQ and measured about 240 ns and 832 B before and about 17 ns and 72 B after, per valid password. It was closed without being merged and without a recorded reason. My guess: a password check runs once per login, not once per request, so the win does not add up to much.

A password check in the same spirit:

```csharp
// Before
bool ok = password.Any(char.IsDigit)
       && password.Any(char.IsLower)
       && password.Any(char.IsUpper)
       && password.Distinct().Count() >= 4;

// After: one pass, and the distinct count on the stack
bool digit = false, lower = false, upper = false;
foreach (char c in password)
{
    digit |= char.IsDigit(c);
    lower |= char.IsLower(c);
    upper |= char.IsUpper(c);
}
bool ok = digit && lower && upper && CountDistinct(password) >= 4;

static int CountDistinct(ReadOnlySpan<char> s)
{
    Span<char> seen = stackalloc char[s.Length]; // fine for short input like a password
    int count = 0;
    foreach (char c in s)
        if (!seen[..count].Contains(c)) seen[count++] = c;
    return count;
}
```

Measured the same way:

| Method | Mean | Allocated |
|---|---:|---:|
| LINQ | 135.2 ns | 760 B |
| Loop | 54.1 ns | 0 B |

The "after" is longer and less obvious. That is the trade-off with every change in this post, and the reason to make it only where a profiler or benchmark says the code is hot.

### 3. Cache what does not change per request

Some work gives the same answer on every request for the same endpoint. [#70220](https://github.com/dotnet/aspnetcore/pull/70220) makes `AuthorizationMiddleware` remember which endpoints have no authorization metadata, which took that path from about 164 ns and 40 B to about 87 ns and 0 B per request. [#70224](https://github.com/dotnet/aspnetcore/pull/70224) caches a `SearchValues<char>` in `UserValidator` instead of rebuilding its lookup each time.

The rule from the effort applies here: cache only what callers cannot see or change, and nothing that could carry data from one request into the next.

### 4. Use the span-based API that already exists

Several PRs did not invent anything. They switched to an overload that works on spans instead of arrays. [#70228](https://github.com/dotnet/aspnetcore/pull/70228) made `SecureDataFormat` use `ISpanDataProtector`, which cut allocations in ticket `Unprotect` by 14–15% and `Protect` by 24–26%. Before you write a clever optimization, check whether the BCL already has a `Span<T>`, `TryFormat`, `TryWrite` or `SearchValues` version of the call you are making.

## What the microbenchmarks did not show

This is the part I find most useful, because my 2020 draft had none of it.

**Wins have trade-offs.** [#70226](https://github.com/dotnet/aspnetcore/pull/70226) would have made TOTP validation 21–35% faster, but for authenticator apps it went from 0 B to about 296 B per validation, in exchange for about 2 µs less CPU. It was put on hold and closed: it conflicted with another PR, and the gain was on a cold path. Whether a trade-off is a win depends on what you are short of and how often the code runs.

**A win on one input can be a loss on another.** A multipart change ([#70164](https://github.com/dotnet/aspnetcore/pull/70164)) made 1-byte fields much faster (1,531 to 1,220 ns, 10,296 to 6,840 B) and 100 KB fields about 4.5% slower. It was closed as "a little complex".

**Measure against the previous version too.** After review changes, [#70200](https://github.com/dotnet/aspnetcore/pull/70200) (still open) was still faster than main but slower than its own previous head in one case. Comparing only against main would have hidden that.

**Most PRs were not merged as-is.** By Fowler's status update of 23 November 2026, 99 `perf/*` PRs had been opened: 40 merged, 34 still open and 25 closed without merging. Some were closed as too complex or too small a gain for the extra code, such as #70164 above. For others no reason was recorded. A benchmark tells you a change is faster. It does not tell you the change is worth maintaining.

**Microbenchmarks are not end-to-end throughput.** One commenter pointed out that many teams care less about requests per second and more about how many containers fit on a node, which depends on how quickly memory is given back to the OS. Fowler's answer was that this kind of "peanut butter" work has always been worth it when the code does not get much more complex, and that the team checks end-to-end results with larger benchmarks. Both are true. Know which of the two you are optimizing for before you start.

## My 2020 tips, revisited

Here is the list from the original draft, and what I would write today:

| 2020 tip | 2026 version |
|---|---|
| Pre-allocate memory or use object pools | Still true. Use `ArrayPool<T>.Shared` or `ObjectPool<T>` instead of your own pool, and never let a pooled object be reachable after you return it. |
| Allocate smaller objects to avoid fragmentation | More precisely: avoid repeatedly allocating arrays of 85,000 bytes or more. Those go on the large object heap, which is only collected with generation 2. Rent big buffers from a pool. |
| Use non-blocking calls for I/O | Use `async`/`await` all the way down, and `System.IO.Pipelines` for streaming protocols. |
| Replace dedicated threads with ThreadPool tasks | Still true. Keep a dedicated thread only for work that blocks or runs for the lifetime of the process. |
| Use pre-allocated fixed-size arrays | Use `Span<T>` over pooled arrays, and `stackalloc` for small, bounded buffers. |
| Do not use `IEnumerable<T>` in hot paths | Still true, and it includes LINQ. See the `PasswordValidator` example above. |
| Use `StringBuilder` to concatenate strings | Better: do not create the string at all. Write to a span with `TryFormat`, or use `string.Create` when you do need a string. |
| Value types vs reference types | Structs used as locals or parameters avoid heap allocations, until they are boxed. Watch for boxing through interfaces and `object` parameters. |
| Use `SocketAsyncEventArgs` for TCP servers | Use Kestrel, or `System.IO.Pipelines` on top of sockets. Both do the buffer management for you. |
| Mark small methods `AggressiveInlining` | Mostly unnecessary now. Tiered compilation and dynamic PGO (on by default since .NET 8) inline hot methods on their own. Measure before you add the attribute. |

## Where to start in your own code

1. Find the code that runs per request, per message or per frame. A profiler (see part 1) or `dotnet-counters monitor` on a running process shows you the allocation rate and how often the GC runs.
2. Write a BenchmarkDotNet benchmark for that path with `[MemoryDiagnoser]`, so you see bytes per operation next to the time.
3. Apply one pattern from this post, and measure it against the original and against your previous attempt.
4. Keep the change only if the win is clear and the code is still something you want to maintain.

That is also what the ASP.NET Core effort did, about a hundred times in a row. The patterns are old. What made it work was measuring each change and being willing to throw most of them away.
