+++
date = "2022-11-25"
title = "How to build Macos Universal Binaries with Conan and CMake"
type = "post"
categories = ["Development"]
tags = ["Development", "CMake", "Conan", "Macos"]
+++

[Universal Binaries](https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary) contain native instructions for multiple target architectures like x86_64 and arm64 to run your app both on Intel Mac and Apple silicon machines. When using Conan there are a few common build systems, or native build tool generators, when creating packages from the Conan Center Index(CCI) like: CMake, Autotools, Pkgconfig, b2 (Boost Build) and Make. Some of these build tools have build-in support when it comes to building Universal Binaries.

Lets start with some of the easy examples how to enable Universal builds in conan.

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

For other build tools that, I am less experienced with or have not found an easy solution for, I wrote a wrapper Conan recipe. This wrapper Conanfile takes the build output of a x86_64 and armv8 package and combines them using `lipo`.

A script writes the hashes of the built packages that will be combined to a json file. When building the "universal" conan recipe it loads the json files and combines the build output of those two packages, for example "arch=x86_64 AND build_type=Release" with "arch=armv8 AND build_type=Release", in a temporary directory that will be merged with the package_folder once done. The advantage of this approach is that you can update the original recipe from CCI without migrating the universal binaries merge logic to the updated recipe.

See this [Github Gist](https://gist.github.com/ovaar/2106071841f1e917f89d10f6d3095638) for the conanfile template.


### Verifying Universal Binaries output

```sh
cd ~/.conan/data/<packagename>/_/_/package/<hash>/lib
lipo -archs <libname>.a
# x86_64 arm64

lipo -archs <libname>.dylib
# x86_64 arm64
```

