+++
linkedin = "2026-12-15T08:30:00+01:00"
blog = "2026-12-15T07:00:00+01:00"
url = "https://ovaar.github.io/blog/cpp-stack-corruption-due-to-define/"
status = "scheduled"
image = "2026-12-15-cpp-stack-corruption-due-to-define.png"
+++

Our 32-bit Windows build crashed in a different place every time. The 64-bit build was fine.

The cause was one line in a header that defined APIENTRY as empty. It turned every OpenGL call from __stdcall into __cdecl, so each call moved the stack pointer too far.

One static_assert now stops the build if it happens again.

https://ovaar.github.io/blog/cpp-stack-corruption-due-to-define/

#cpp #windows #debugging
