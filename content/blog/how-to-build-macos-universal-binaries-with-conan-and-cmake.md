+++
date = "2022-11-25"
title = "How to build Macos Universal Binaries with Conan and CMake"
type = "post"
categories = ["Development"]
tags = ["Development", "CMake", "Conan", "Macos"]
+++

At [BIMcollab ZOOM](https://www.bimcollab.com) while adopting [Conan](https://conan.io/), as a package manager for C/C++, into the development workflow to create a more seamless developer experience I learned about [Universal Binaries](https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary) on Macos.

Universal binaries contain native instructions for multiple target architectures like x86_64 and arm64 to run your apps both on Intel Mac and Apple silicon machines. When using Conan there are a few build systems, or native build tool generators, that are quite common when using packages from the Conan Center Index(CCI) like: CMake, Autotools, Pkgconfig, b2 (Boost Build) and Make. Some of these build tools have build-in support when it comes to building Universal Binaries.

Disclaimer: I'm certainly no expert when it comes to all these build tools, there probably much smarter people out there than me.

Lets start with some of the easy examples.


### CMake

The CMake toolchain generator exposes the [CMAKE_OSX_ARCHITECTURES](https://cmake.org/cmake/help/latest/variable/CMAKE_OSX_ARCHITECTURES.html) flag to set the target architectures.

```py
from conan import ConanFile
from conan.tools.cmake import CMake, CMakeToolchain, cmake_layout
from conan.tools.apple import is_apple_os

class PackageConan(ConanFile):
    def generate(self):
        tc = CMakeToolchain(self)
        if is_apple_os(self):
            tc.blocks["apple_system"].values["cmake_osx_architectures"] = "x86_64;arm64"
        tc.generate()
```


### Autotools

Autotools allows you to set the target architectures via `extra_cflags`.

```py
from conan import ConanFile
from conan.tools.gnu import Autotools, AutotoolsToolchain
from conan.tools.apple import is_apple_os

class PackageConan(ConanFile):
    def generate(self):
        tc = AutotoolsToolchain(self)
        if is_apple_os(self):
            tc.extra_cflags.append("-arch x86_64 -arch arm64")
        tc.generate()
```


### Other build tools

For other build tools, that I am less experienced with and have not found an easy solution, I wrote a wrapper Conan recipe. This wrapper Conanfile takes the build output of a x86_64 and armv8 package and combines them using `lipo`.

At BIMcollab, a build script writes the hashes of built packages that should be combined to a json file. When building the "universal" conan recipe it loads the json files and combines the build output of those two packages, for example "arch=x86_64 AND build_type=Release" with "arch=armv8 AND build_type=Release", in a temporary directory that will be merged with the package_folder once done. The advantage of this approach is that you can update the original recipe from CCI without migrating the universal binaries merge logic to the updated recipe.

See this [Github Gist](https://gist.github.com/ovaar/2106071841f1e917f89d10f6d3095638) for the conanfile template.


### Verifying Universal Binaries output

```sh
cd ~/.conan/data/<packagename>/_/_/package/<hash>/lib
lipo -archs <libname>.a
# x86_64 arm64

lipo -archs <libname>.dylib
# x86_64 arm64
```

