+++
date = "2022-11-25"
title = "How to build Macos Universal Binaries with Conan and CMake"
type = "post"
categories = ["Development"]
tags = ["Development", "CMake", "Conan", "Macos"]
+++

*** update (May 2025) ***

* Added conan 2.x cmaketoolchain universal binary support.
* Added VirtualBuildEnv configuration examples.
* Added section about compiling boost.
* Added automated patching section.


# How to build Macos Universal Binaries with Conan and CMake

[Universal Binaries](https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary) contain native instructions for multiple target architectures like x86_64 and arm64 to run your app both on Intel Mac and Apple silicon machines. When using Conan there are a few common build systems, or native build tool generators, when creating packages from the Conan Center Index(CCI) like: CMake, Autotools, Pkgconfig, b2 (Boost Build) and Make. Some of these build tools have build-in support when it comes to building Universal Binaries.

Lets start with some of the easy examples how to enable Universal builds in conan.


## CMake

Conan 2.x CMakeToolchain generator now has built-in support for to specify multiple architectures from the architecture settings, read [Support for Universal Binaries in macOS](https://docs.conan.io/2/reference/tools/cmake/cmaketoolchain.html#support-for-universal-binaries-in-macos), but this feature is only works with packages built using CMake, so for other recipes you still need to patch the upstream recipe.

```sh
# Passes the alphabetically sorted architectures as a setting option
$ conan create . --name=mylibrary --version=1.0 -s="arch=armv8|x86_64"
```

Or using the profiles
```sh
# apple.profile
[settings]
    os=Macos
    arch=armv8|x86_64
    compiler=apple-clang
    build_type=Release
    compiler.cppstd=23
    compiler.version=15.0
    compiler.libcxx=libc++
```
```sh
$ conan create . --name=mylibrary --version=1.0 -pr:a="apple.profile"
```


The CMake toolchain generator exposes the [CMAKE_OSX_ARCHITECTURES](https://cmake.org/cmake/help/latest/variable/CMAKE_OSX_ARCHITECTURES.html) flag to set the target architectures.

```py
from conan import ConanFile
from conan.tools.cmake import CMake, CMakeToolchain, cmake_layout

class PackageConan(ConanFile):
    def generate(self):
        tc = CMakeToolchain(self)
        if self.settings.os == "Macos":
            tc.blocks["apple_system"].values["cmake_osx_architectures"] = "x86_64;arm64"
        tc.generate()
```

If you want to decouple the architecture settings from your recipe you, for example use the VirtualBuildEnv to read the settings from your conan profile, by setting the `[buildenv]` environment variable like `OSX_ARCH_VARIANTS` as shown in the following example:

```sh
# apple.profile
[settings]
    os=Macos
    arch=armv8|x86_64
    compiler=apple-clang
    build_type=Release
    compiler.cppstd=23
    compiler.version=15.0
    compiler.libcxx=libc++

[buildenv]
OSX_ARCH_VARIANTS=x86_64;arm64
```

```py
from conan import ConanFile
from conan.tools.cmake import CMake, CMakeToolchain, cmake_layout

class PackageConan(ConanFile):
    def generate(self):
        tc = CMakeToolchain(self)
        if self.settings.os == "Macos":
            from conan.tools.env import VirtualBuildEnv
            buildenv = VirtualBuildEnv(self).vars()
            arch_variants = buildenv.get("OSX_ARCH_VARIANTS", "")
            self.output.info(f"CMAKE_OSX_ARCHITECTURES={arch_variants}")
            tc.blocks["apple_system"].values["cmake_osx_architectures"] = arch_variants
        tc.generate()
```



## Autotools

Autotools allows you to set the target architectures via `extra_cflags`.

```py
from conan import ConanFile
from conan.tools.gnu import Autotools, AutotoolsToolchain

class PackageConan(ConanFile):
    def generate(self):
        tc = AutotoolsToolchain(self)
        if self.settings.os == "Macos":
            tc.extra_cflags.append("-arch x86_64 -arch arm64")
        tc.generate()
```

## Boost

Boost 1.80.0 uses Autotools to build, so we can utilize what we have already learned with the Autotools patch and apply it on the boost recipe and compile with `-s:a="boost*:pch=False"`

```diff
[PATCH] patch: Applying AUTOTOOLS_UNIVERSAL_PATCH for boost

- Set extra flags for Autotools to compile a Universal FAT binary on macOS from the OSX_ARCH_VARIANTS buildenv option

@@ -1392,6 +1392,12 @@ class BoostConan(ConanFile):
 
         if is_apple_os(self):
             apple_min_version_flag = AutotoolsToolchain(self).apple_min_version_flag
+            buildenv = VirtualBuildEnv(self).vars()
+            arch_variants = buildenv.get("OSX_ARCH_VARIANTS", "")
+            self.output.info(f"AUTOTOOLS_OSX_ARCHITECTURES={arch_variants}")
+            extra_archs = [f"-arch {arch}" for arch in arch_variants.split(";")]
+            cxx_flags.extend(extra_archs)
+            link_flags.extend(extra_archs)
             if apple_min_version_flag:
                 cxx_flags.append(apple_min_version_flag)
                 link_flags.append(apple_min_version_flag)
```

## Automated Conan Recipe patching for Universal (FAT) binaries

I really like to automate things, so I can spend my valuable time on other things where it is needed.
That is why I wrote a little python script that helps to insert the universal binaries patch for all my recipes.
Since we know how and where to patch recipes that use CMake or Autotools we can search the content of a file and insert the patch where needed.
In the patch I have added the marker `CMAKE_OSX_ARCHITECTURES` or `AUTOTOOLS_OSX_ARCHITECTURES`, so I later easily know if the recipe has been patched.

```py
from pathlib import Path
import re
import textwrap
from typing import List


def find_in_file(path: Path, q: str) -> bool:
    try:

        with path.open("r", encoding="utf-8") as f:
            for l in f.readlines():
                if m := re.search(q, l):
                    return True
    except Exception as e:
        print(f"Failed to read file {path}, error: {e}")
        raise e

    return False

CMAKE_UNIVERSAL_PATCH = textwrap.dedent(
    """\
if self.settings.os == "Macos":
    {IMPORT_VIRTUALBUILDENV}
    buildenv = VirtualBuildEnv(self).vars()
    arch_variants = buildenv.get("OSX_ARCH_VARIANTS", "")
    self.output.info(f"CMAKE_OSX_ARCHITECTURES={{arch_variants}}")
    {VARIABLE_NAME}.blocks["apple_system"].values["cmake_osx_architectures"] = arch_variants"""
).strip()

"""
source: https://www.gnu.org/software/autoconf/manual/autoconf-2.63/html_node/Multiple-Architectures.html
"""
AUTOTOOLS_UNIVERSAL_PATCH = textwrap.dedent(
    """\
if self.settings.os == "Macos":
    {IMPORT_VIRTUALBUILDENV}
    buildenv = VirtualBuildEnv(self).vars()
    arch_variants = buildenv.get("OSX_ARCH_VARIANTS", "")
    self.output.info(f"AUTOTOOLS_OSX_ARCHITECTURES={{arch_variants}}")
    extra_archs = [f"-arch {{arch}}" for arch in arch_variants.split(";")]
    {VARIABLE_NAME}.extra_cflags.extend(extra_archs)
    {VARIABLE_NAME}.extra_cxxflags.extend(extra_archs)
    {VARIABLE_NAME}.extra_ldflags.extend(extra_archs)
    """
).strip()


class ConanRecipeFatBinaryPatcher:
    """
    This class automates the insertion of a FAT binary patch into a Conan recipe.
    It searches for the toolchain assignment in the recipe and inserts the patch code
    immediately after that line.

    Note:
        - This automated patching process is designed to handle the majority of cases
          (approximately 99% of use cases), but it is not guaranteed to be foolproof.
    """

    def __init__(self, toolchain: str, patch_code: str):
        self.patch_code = patch_code
        self.toolchain = toolchain

    def apply_patch(self, recipe_file_path: Path) -> str:
        """Find the toolchain assignment and insert patch after that line"""

        content = recipe_file_path.read_text(encoding="utf-8")
        lines: List[str] = []
        for line in content.splitlines():
            line_without_whitespace = line.replace(" ", "")
            if f"={self.toolchain}" in line_without_whitespace:
                indentation: int = len(line) - len(line.lstrip())
                assignment = line_without_whitespace.split("=")

                patch_code = textwrap.indent(
                    self.patch_code.format(
                        VARIABLE_NAME=assignment[0],
                        IMPORT_VIRTUALBUILDENV=(
                            ""
                            if find_in_file(recipe_file_path, r"import VirtualBuildEnv")
                            else "from conan.tools.env import VirtualBuildEnv"
                        ),
                    ),
                    " " * indentation,
                )

                # Insert patch after
                lines.append(line)
                lines.extend([line for line in patch_code.splitlines() if line.strip() != ""])
                is_patched = True
            else:
                lines.append(line)

        if not is_patched:
            raise Exception("Failed to patch recipe, manual action required!")

        return "\n".join(lines)


class AutotoolsToolchainConanRecipePatcher(ConanRecipeFatBinaryPatcher):
    """
    Patches a Conan recipe with a FAT binary patch for the Autotools toolchain.
    """

    def __init__(self):
        super().__init__("AutotoolsToolchain", AUTOTOOLS_UNIVERSAL_PATCH)


class CMakeToolchainConanRecipePatcher(ConanRecipeFatBinaryPatcher):
    """
    Patches a Conan recipe with a FAT binary patch for the CMake toolchain.
    """

    def __init__(self):
        super().__init__("CMakeToolchain", CMAKE_UNIVERSAL_PATCH)


recipe_path:Path = Path("conanfile.py")

# Patch CMake
if find_in_file(package.recipe_path, r"CMakeToolchain"):
    if not find_in_file(package.recipe_path, r"CMAKE_OSX_ARCHITECTURES"):
        logger.info(
            f"Applying Cmake FAT Binary patch to '{package.name}' conan recipe."
        )
        patched_code = CMakeToolchainConanRecipePatcher().apply_patch(
            package.recipe_path
        )
        with package.recipe_path.open(encoding="utf-8", mode="w") as f:
            f.write(patched_code)

# Patch Autotools, note I don't use elif here, since recipes can have both CMake and Autotools
if not find_in_file(recipe_path, r"AUTOTOOLS_OSX_ARCHITECTURES"):
    print(
        f"Applying Autotools FAT Binary patch to '{recipe_path.name}' conan recipe."
    )
    patched_code = AutotoolsToolchainConanRecipePatcher().apply_patch(
        recipe_path
    )
    with recipe_path.open(encoding="utf-8", mode="w") as f:
        f.write(patched_code)
```

## Other build tools

For other build tools that, I am less experienced with or have not found an easy solution for, I wrote a wrapper Conan recipe. This wrapper Conanfile takes the build output of a `x86_64` and `armv8` package and combines them using `lipo`.

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

