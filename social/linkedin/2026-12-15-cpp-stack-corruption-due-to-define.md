+++
linkedin = "2026-12-15T08:30:00+01:00"
blog = "2026-12-15T07:00:00+01:00"
url = "https://ovaar.github.io/blog/cpp-stack-corruption-due-to-define/"
status = "approved"
+++

The 32-bit Windows build of an OpenGL application crashed. The 64-bit build of the same code did not, and the crash moved to a different place every time.

The cause was one line in a header:

#define APIENTRY

On 32-bit Windows, OpenGL functions use the __stdcall calling convention, where the called function removes its arguments from the stack. If a header defines APIENTRY as empty before windows.h is included, every OpenGL function pointer becomes __cdecl. The caller then removes the arguments as well, and every call moves the stack pointer too far.

The 64-bit build has one calling convention, so the bug never appeared there.

The compiler gave one warning, a macro redefinition, in a build with hundreds of warnings. One static_assert on a function pointer type now stops the build when the bug is present.

https://ovaar.github.io/blog/cpp-stack-corruption-due-to-define/

#cpp #windows #debugging
