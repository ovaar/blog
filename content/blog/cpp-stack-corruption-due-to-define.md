+++
date = "2026-11-23"
title = "C++ stack corruption caused by an empty APIENTRY"
description = "How one empty #define APIENTRY made every OpenGL extension call on 32-bit Windows pop its arguments twice, why the x64 build never showed it, and how to make the bug impossible."
type = "post"
categories = ["Development"]
tags = ["cpp", "opengl", "windows", "debugging"]
+++

The 32-bit Windows build of an OpenGL application crashed. The 64-bit build of the same code did not. The crash was never at the same place twice: a local variable that changed for no reason, a return into garbage, an access violation a few frames above the code that caused it. That is what stack corruption looks like.

The cause was one line in a header:

```cpp
#define APIENTRY
```

This post explains why that line breaks the stack, why x64 hides it, and how to make sure it cannot happen again.

## What APIENTRY is for

On 32-bit Windows a function can use one of several *calling conventions*. The convention decides, among other things, who removes the arguments from the stack after a call:

| Convention | Who pops the arguments | Default for |
|---|---|---|
| `__cdecl` | The caller, with `add esp, N` after the call | C and C++ functions |
| `__stdcall` | The callee, with `ret N` | The Win32 API, and `opengl32.dll` |

OpenGL on Windows uses `__stdcall`. The headers spell that `APIENTRY`, which `<windows.h>` (through `<minwindef.h>`) defines as `WINAPI`, which is `__stdcall`. Every OpenGL function pointer type is declared with it:

```cpp
typedef void (APIENTRY *PFNGLBINDBUFFERPROC)(GLenum target, GLuint buffer);
```

Functions beyond OpenGL 1.1, such as `glBindBuffer`, are not exported by `opengl32.dll`. You load them at runtime with `wglGetProcAddress` (or a loader like glad or GLEW does it for you) and call them through those pointer types. The calling convention in the typedef is the only thing that tells the compiler how to call the driver's code.

## How it goes wrong

Many cross-platform headers contain a guard like this, so they compile without `<windows.h>`:

```cpp
#ifndef APIENTRY
#define APIENTRY
#endif
```

On Linux and macOS that is correct: there is only one calling convention, and `APIENTRY` should be empty. On 32-bit Windows it is only correct if `<windows.h>` was included first. If a header with this guard comes first, `APIENTRY` is defined as nothing, and every function pointer type that header declares is `__cdecl`, while the driver code behind those pointers is still `__stdcall`. When `<windows.h>` is included later, it redefines `APIENTRY` as `WINAPI`, but that only affects declarations after it. The types that were already declared stay wrong.

The compiler does notice the redefinition: MSVC reports warning C4005 ("'APIENTRY': macro redefinition") and clang reports `-Wmacro-redefined`. In a project that already has a few hundred warnings, or that turns C4005 off because `<windows.h>` and other headers trigger it all the time, nobody reads it. Nothing fails to compile, the program links, and the calls even appear to work.

## The bug in four instructions

Here is a minimal version, compiled for 32-bit Windows with `clang -target i686-pc-windows-msvc -O1 -masm=intel -S`:

```cpp
#define APIENTRY  // empty: defined before <windows.h> could make it __stdcall
typedef void (APIENTRY *PFNGLBINDBUFFERPROC)(unsigned target, unsigned buffer);
PFNGLBINDBUFFERPROC glBindBuffer;
void bind(unsigned vbo) { glBindBuffer(0x8892 /* GL_ARRAY_BUFFER */, vbo); }
```

The call site in `bind`:

```nasm
push  dword ptr [esp + 4]   ; vbo
push  34962                 ; GL_ARRAY_BUFFER
call  dword ptr [glBindBuffer]
add   esp, 8                ; caller pops 8 bytes: __cdecl
ret
```

And the end of a `__stdcall` function with the same two arguments, which is what the driver contains:

```nasm
ret   8                     ; callee pops 8 bytes: __stdcall
```

Both sides remove the same 8 bytes. After every call through the pointer, `esp` sits 8 bytes higher than the caller expects. The caller's locals, saved registers and return address are now read from the wrong place. Whether that crashes, returns garbage or seems fine depends on what happens to be on the stack, which is why the crash moved around.

With `APIENTRY` defined as `__stdcall`, the compiler leaves out the `add esp, 8` and the call is correct:

```nasm
push  dword ptr [esp + 4]
push  34962
call  dword ptr [glBindBuffer]
ret
```

## Why the 64-bit build was fine

x64 Windows has a single calling convention. The compiler accepts `__stdcall` and `__cdecl` there and ignores them. The same source compiled for x64 passes the first four arguments in registers and never cleans up arguments after a call, so a wrong or missing `APIENTRY` has no effect. If you only test 64-bit builds, you will never see this bug.

## Finding it

A Debug build with MSVC finds it on the first bad call, because `/RTCs` (part of `/RTC1`, on by default in Debug) checks `esp` around every call through a function pointer:

> Run-Time Check Failure #0 - The value of ESP was not properly saved across a function call. This is usually a result of calling a function declared with one calling convention with a function pointer declared with a different calling convention.

That message names the cause exactly. A Release build has no such check, so it only shows the corruption itself, much later. If a 32-bit crash only happens in Release, run the Debug build before you start reading crash dumps.

To find which header defined `APIENTRY` first, let the preprocessor tell you. `clang -E -dD file.cpp` keeps every `#define` in its output, with line markers naming the file it came from. Search for the first `#define APIENTRY` and read the marker above it:

```text
# 1 "./third_party/portable_gl.h" 1
#define APIENTRY
```

With MSVC, `cl /P /d1PP file.cpp` writes the same to `file.i` (`/d1PP` is undocumented, but it is what keeps the `#define` lines).

## The fix

Make sure the platform header defines `APIENTRY` before any header that has an empty fallback. On Windows, that means including `<windows.h>` (or the loader header that includes it for you) before anything else that touches OpenGL:

```cpp
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#endif
#include <glad/gl.h>
// other OpenGL headers after this
```

A rule about include order only lasts until someone sorts the includes. A check in the build lasts longer. Add this (C++17) to a header that is included after the OpenGL headers, so a 32-bit Windows build fails at compile time instead of at runtime:

```cpp
#if defined(_WIN32) && !defined(_WIN64)
#include <type_traits>
static_assert(std::is_same_v<PFNGLBINDBUFFERPROC, void (__stdcall*)(GLenum, GLuint)>,
              "APIENTRY is not __stdcall: an empty APIENTRY was defined before <windows.h>");
#endif
```

Function pointer types with different calling conventions are different types on 32-bit Windows, so the assertion fails exactly when the bug is present.

## Takeaways

- A function pointer's type is a promise about the code behind it. If the calling convention in the type is wrong, nothing checks it by default, and the result is stack corruption.
- Read macro redefinition warnings (C4005, `-Wmacro-redefined`). For this bug it is the only warning you get.
- `#ifndef X / #define X` fallbacks make include order part of a header's meaning. That is fine on platforms where the fallback is right, and dangerous on the one where it is not.
- Build and test the 32-bit target if you ship it. x64 is not a stricter version of x86: some bugs only exist on x86.
- Keep `/RTC1` in Debug builds. It turned a random crash into a one-line diagnosis.
