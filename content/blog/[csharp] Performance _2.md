[csharp] Performance #2

## GC stressed

This problem can occur with real-time systems and can be mitigated by doing Memory Management optimizations such as:

1. Pre-allocating memory or use Object Pools
2. Allocate smaller memory objects to avoid memory fragmentation
3. 


## tips
1. Use non-blocking system calls when working with I/O.
2. Replace dedicated user threads with tasks which run on the ThreadPool
3. Use pre-allocated fixed size arrays
4. Do not use `IEnumerable<T>` in hot code paths
5. Use StringBuilder when concatinating strings.
6. Value types vs Reference types


### Hidden performance

If you are planning to build a high performance TCP server and client do not leave out [System.Net.Sockets.SocketAsyncEventArgs](https://docs.microsoft.com/en-us/dotnet/api/system.net.sockets.socketasynceventargs?view=netcore-3.1). Or are you working on software that processes allot of I/O in general it is worth noting to consider [System.IO.Pipelines](https://devblogs.microsoft.com/dotnet/system-io-pipelines-high-performance-io-in-net/).

TLDR; Most importantly is when developing software using a memory managed language such as csharp or java, engineers must be aware of memory allocation. If the GC (garbage collector) is stressed to much, you are going to have a fun time ready this post. 😊

cture was not prepared for it an even when increasing CPU and RAM resources (vertical scaling) it fails to perform.

* Inline functions (AggressiveInline)