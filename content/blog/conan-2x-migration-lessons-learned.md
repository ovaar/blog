+++
date = "2025-09-12"
title = "Conan 2.x migration and the lessons learned"
type = "post"
categories = ["software", "migration", "Conan"]
tags = ["conan"]
+++

- [1. Conan 2.x migration and the lessons learned](#1-conan-2x-migration-and-the-lessons-learned)
  - [1.1. The path to Conan 2](#11-the-path-to-conan-2)
  - [1.2. The Conan 2.x migration](#12-the-conan-2x-migration)
  - [1.3. Conan 2.x revisions and hashes](#13-conan-2x-revisions-and-hashes)
    - [1.3.1. Recipe Revisions (RREV)](#131-recipe-revisions-rrev)
    - [1.3.2. Package ID](#132-package-id)
    - [1.3.3. Package Revisions (PREV)](#133-package-revisions-prev)
    - [1.3.4. Obtaining different revisions in ~~Linux~~ Unix and Windows](#134-obtaining-different-revisions-in-linux-unix-and-windows)
  - [1.4. Conan Integrations](#14-conan-integrations)
    - [1.4.1. Conan Toolchain generator](#141-conan-toolchain-generator)
    - [1.4.2. Conan Deps generator](#142-conan-deps-generator)
      - [XcodeToolchain changes](#xcodetoolchain-changes)
  - [1.5. Conan APIs](#15-conan-apis)
    - [1.5.1. Loading a conan profile via the ConanAPI](#151-loading-a-conan-profile-via-the-conanapi)
    - [1.5.2. Computing the dependency graph via the Conan Graph API](#152-computing-the-dependency-graph-via-the-conan-graph-api)
  - [1.6. Deployers](#16-deployers)


# 1. Conan 2.x migration and the lessons learned

In this blog post I will cover some key changes in Conan 2.x, how it works and some pitfalls. I do assume you are (somewhat) familiar with Conan already. In the first paragraphs I will share some backstory and then we will go into the technical details. Otherwise, skip to [The Conan 2.x migration](#the-conan-2x-migration).

## 1.1. The path to Conan 2

[BIMcollab](https://www.bimcollab.com/en/) builds high‑performance, model-based collaboration software that helps project teams improve BIM model quality. One of those products, BIMcollab Zoom, is an IFC model viewer focused on fast navigation, model checking (e.g. clash detection), and issue tracking. The product has matured over roughly nine years (I’ve been fortunate to contribute during the last five), during which its architecture naturally evolved as capabilities, people, and expectations grew.

As with most long‑lived products, incremental ideas, framework shifts, and delivery pressure led to uneven investment in foundational refactoring. That healthy tension between delivering features and reshaping internals taught us a lot: we saw longer feedback cycles, more regression risk than we liked, and higher cognitive load in some areas of the codebase. Those signals clarified where to focus: testability, dependency hygiene, and repeatable environment setup.

A resilient architecture became the enabler. For BIMcollab Zoom that foundation starts with [Conan](https://conan.io/), our backbone for sharing native components and 3rd‑party libraries across products. When I joined, Conan was already present, but most external dependencies were still compiled outside and only wrapped afterward (Visual Studio and Xcode project files), making timely security updates and experimentation slower than we wanted.

The .NET Framework 4.8.1 upgrade across Windows projects created a natural “pause point” to reduce technical drag. We used it to standardize and automate more of the native dependency workflow—aiming for less manual orchestration, faster updates (e.g. OpenSSL), and predictable cross‑platform output. The first iteration replaced custom recipes with upstream Conan Center Index (CCI) ones: we cloned them into a local repo and drove source builds via a Python script encoding per‑package, per‑platform configuration. That script alone cut the effort to manage Conan libraries by roughly an order of magnitude. Developers still supervised platform builds manually—and occasionally rebooted between OSes—so it wasn’t the end state, but it materially improved reproducibility. It also unlocked building macOS Universal (FAT) binaries more easily (see [How to build Macos Universal Binaries with Conan and CMake]({{< ref "blog/how-to-build-macos-universal-binaries-with-conan-and-cmake" >}})). Adopting CCI upstream recipes further reduced cognitive load through cleaner, isolated settings and option models.

A later strategic move—migrating CI/CD from Jenkins to Azure DevOps—arrived just as Conan 1.x entered deprecation. Because Conan sits at the heart of the development workflow, we treated the platform migration and the Conan 2 transition as a single, well‑scoped modernization effort. Normally combining initiatives increases risk; here it consolidated context switching, aligned stakeholders, and accelerated convergence on a more maintainable pipeline.

Before we dive into the technical details I want to thank the Conan team for doing a great job!


## 1.2. The Conan 2.x migration

Since the release of Conan 2.x there has been a migration guide listing all breaking changes, read [Conan migration guide to 2.0](https://docs.conan.io/1/conan_v2.html), and a lot has changed, because over time lessons are learned on how to improve processes and designs. In this case, the resulting changes were quite impactful, which for us meant a more costly migration due to using different APIs, updating recipes, changing scripts, adopting new behavior, and setting different environment variables.

Here's a list of changes that impacted us most:

* Package names must be lowercase, finally settling the debate on CamelCase names and aligning custom packages with CCI standards.
* Package names with special characters like '.' are discouraged.
* The new way of computing revisions and hash for packages.
* [Removed imports() method](https://docs.conan.io/1/migrating_to_2.0/recipes.html#removed-imports-method) in favor of moving that to `generate()` or using 
* The new [Deployers Extension](https://docs.conan.io/2/reference/extensions/deployers.html), to support local development workflow.
* The new Conan search CLI.
* The new Toolchain and Deps generators.
* New python APIs


## 1.3. Conan 2.x revisions and hashes

The revised revision and hashing model in Conan 2.x paves the way for stronger immutability and reproducibility: any relevant change in the exported recipe inputs or the resulting packaged binary contents deterministically yields a new identifier.

Let's break down the three layers (RREV → Package ID → PREV), starting with the format:

```
pkg_name/version#rrev:package_id#prev
```

{{< img src="/img/conan2x-list-revisions.png" alt="Screenshot showing Conan 2.x list revisions output" >}}

### 1.3.1. Recipe Revisions (RREV)

The Recipe Revision (RREV) is a content hash over every exported recipe file: `conanfile.py`, `conandata.yml`, plus any files included via `exports` / `exports_sources` (patches, helper scripts, license files, etc.). Changing even a newline or whitespace in any exported file produces a new RREV. Files that are not exported (purely local build helpers) do not affect the RREV.

```
pkg_name/version#rrev
zstd/1.5.7#f98394e178ac97e2a7b445ea0ce6bcaf
```

### 1.3.2. Package ID

The [package_id](https://docs.conan.io/2/reference/binary_model/package_id.html) uniquely identifies a package *variant* (its configuration intent). Selected settings (e.g. `os=Linux`, `arch=x86_64`), options (e.g. `shared=True`), and the graph of requirements (including their RREVs) are combined to compute its hash. This separates “what we asked to build” from “what was actually built.”

You can still customize how variants collapse by overriding the `package_id()` method in a recipe—for example to ignore a compiler patch level—mirroring (and simplifying) behavior from Conan 1.x.

{{< img src="/img/conan_package_id_full.png" alt="Screenshot showing Conan 2.x list output with package ids" >}}

```
pkg_name/version#rrev:package_id
zstd/1.5.7#f98394e178ac97e2a7b445ea0ce6bcaf:43c10c705bb0f1d0030e597cb09a05ef5953fed9
```

### 1.3.3. Package Revisions (PREV)

The Package Revision (PREV) fingerprints a *realized* binary package. Conceptually:

1. The RREV (recipe content hash)
2. The Package ID (variant hash)
3. A hash of the final packaged binary contents (after the build + package() step)

The PREV only exists after a successful build of that variant. If you rebuild twice and produce byte‑identical packaged contents (including dependency artifacts copied or bundled), the PREV will be identical—enabling deterministic cache reuse across machines. If sources change, a dependency revision changes (affecting what gets packaged), or compiler flags alter the produced artifacts, the PREV changes.

```
pkg_name/version#rrev:package_id#prev
zstd/1.5.7#f98394e178ac97e2a7b445ea0ce6bcaf:43c10c705bb0f1d0030e597cb09a05ef5953fed9#3c8a259cc3c44b3a725342c5bb968f6d
```

Mental model summary:
- RREV: Recipe inputs (what defines how to build)
- Package ID: Configuration intent (settings + options + dependency graph signature)
- PREV: Actual packaged bytes for that configuration

### 1.3.4. Obtaining different revisions in ~~Linux~~ Unix and Windows

Now that we know how the new revisions are computed I want to highlight a pitfall I encountered, namely this known issue: [Obtaining different revisions in Linux and Windows](https://docs.conan.io/2/knowledge/faq.html#error-obtaining-different-revisions-in-linux-and-windows).

Knowing that hashes are content based, meaning newlines and whitespaces are accounted for in the hash, that also means that line-endings are included in the hash, changing the RREV. So when I was trying to consume zstd on macOS, after I already built it for Windows, conan said that it could not find a matching package, so I ran `conan graph explain`, awesome commandline tool btw, to get more insight in where the failing requirement was, giving me the following result:

```bash
$ conan graph explain "conanfile.py" --profile "apple.profile" -s build_type=Debug --version=1.5.7

======== Retrieving and computing closest binaries ========
Missing binary: zstd/1.5.7
With conaninfo.txt (package_id):
[settings]
arch=x86_64
build_type=Debug
compiler=apple-clang
compiler.cppstd=23
compiler.libcxx=libc++
compiler.version=15.0
os=Macos

Finding binaries in the cache
Finding binaries in remote

======== Closest binaries ========
zstd/1.5.7
  zstd/1.5.7#c85457d53c81839853cdfcdccfbe786b%1742228498.322 (2025-03-17 16:21:38 UTC)
    zstd/1.5.7#c85457d53c81839853cdfcdccfbe786b:ecb7ce4359069b1fdf033c978da144c5c37fc00e
      remote: 
      settings: Windows, x86_64, Debug, msvc, 23, dynamic, Debug, 194
      diff
        platform
          expected: os=Macos
          existing: os=Windows
        settings
          expected: compiler=apple-clang, compiler.libcxx=libc++, compiler.version=15.0, compiler.runtime=None, compiler.runtime_type=None
          existing: compiler=msvc, compiler.libcxx=None, compiler.version=194, compiler.runtime=dynamic, compiler.runtime_type=Debug
        explanation: This binary belongs to another OS or Architecture, highly incompatible.
```

There is quite allot of information in this output, but the way I read it is as following: "Unable to find exact matching package for the given profile, though the closest match was this 'Windows' package". So my first instinct was to run `conan list` to find out what packages we now have in our remote, telling that there are indeed packages for `zstd/1.5.7` for Windows and macOS, but that package for macOS has a different package_id then the one for Windows.

```bash
$ conan list "zstd/1.5.7:*" -r=remote
remote
  zstd        
    zstd/1.5.7
      revisions
        760e2c11087c6517394d4626e15bc6aa (2025-04-18 14:51:51 UTC)
          packages
            84686b40e13ac9cce8e1c0900e6b00ce53d2ec1b
              info
                settings
                  arch: x86_64
                  build_type: Debug
                  compiler: msvc
                  compiler.runtime: dynamic
                  compiler.runtime_type: Debug
                  compiler.version: 194
                  os: Windows
                options
                  build_programs: True
                  shared: False
                  threading: True
            9d69f8152c7ae20456f943b00603dfd1254e33d6
              info
                settings
                  arch: x86_64
                  build_type: Release
                  compiler: msvc
                  compiler.runtime: dynamic
                  compiler.runtime_type: Release
                  compiler.version: 194
                  os: Windows
                options
                  build_programs: True
                  shared: False
                  threading: True
        082e3dbfe806c7d9f8c0ad59c28eba27 (2025-04-18 14:52:18 UTC) # <<<< Different package id 
          packages
            e21929983ebdf96278b3a059c2639c194a5fbfc2
              info
                settings
                  arch: x86_64
                  build_type: Release
                  compiler: apple-clang
                  compiler.version: 15.0
                  os: Macos
                options
                  build_programs: True
                  fPIC: True
                  shared: False
                  threading: True
            ad39c16367de0053c3feeee333cfbe687f14b6f1
              info
                settings
                  arch: x86_64
                  build_type: Debug
                  compiler: apple-clang
                  compiler.version: 15.0
                  os: Macos
                options
                  build_programs: True
                  fPIC: True
                  shared: False
                  threading: True
```

There appeared to be two different `package_id(s)` listed, though I was expecting only one, since I was building a package with exactly the same recipe. At least I thought so .... After searching the web it turned out that this is a known issue [Obtaining different revisions in Linux and Windows](https://docs.conan.io/2/knowledge/faq.html#error-obtaining-different-revisions-in-linux-and-windows), which due to line-endings, which are different on Unix than on Windows, two unique revisions for the same recipe are created. Fortunately, it is easy to solve by adding the `.gitattributes` file with the configuration to checkout files consistently on all platforms using the same line-endings. Note, if your repository contains binary content like archives, you have to add them to the `.gitattributes`, so git does not mess with the file trying to change the line-endings.

```
* text eol=lf

# Note: After applying these changes, test the repository thoroughly to ensure no unintended consequences. Verify that files are correctly checked out with consistent line endings and that binary files remain unaffected.
*.zip binary
*.tar binary
*.tar.gz binary
```

```bash
# Run the following commands to tell Git to forget the files it’s tracking (without deleting them), and re-check them out from the current HEAD, which will apply the .gitattributes settings
git rm --cached -r .
git reset --hard
```

## 1.4. Conan Integrations

The list [Integrations](https://docs.conan.io/2/integrations.html) with Conan is growing, allowing Conan 2.x to support more and more build systems.
These build systems are supported through the concept "Generators". Generators transform configuration to build system specific output, which can be used for compilation using that tool, such as:

* [CMake](https://docs.conan.io/2/integrations/cmake.html)
* [Visual Studio](https://docs.conan.io/2/integrations/visual_studio.html)
* [Xcode](https://docs.conan.io/2/integrations/xcode.html)
* [Bazel](https://docs.conan.io/2/integrations/bazel.html)
* [Meson](https://docs.conan.io/2/integrations/meson.html)
* ...

In the following two sections I'll explain how Integrations work through the types generators that exist.

### 1.4.1. Conan Toolchain generator

Toolchain generators transform the conan `[settings]`, such that the target build system can consume build settings for compilation. Think about `build_type` being transformed to a Visual Studio configuration or what compiler or cppstd to use. These configurations are outputted in files that can be interpreted by your IDE or build system, helping you as an engineer, by not having to configure all these properties by hand 🚀.

### 1.4.2. Conan Deps generator

Deps generators materialize the resolved dependency graph into build-system–specific metadata: include dirs, lib dirs, link flags, defines, frameworks, system libs, and (for multi‑config toolchains) per‑configuration variants. Instead of manually wiring each dependency, a Deps generator emits structured files (e.g. `conandeps.xcconfig`, MSBuild `.props` / `.targets`, or CMake helper files) that your build system or IDE can include so targets inherit the correct transitive usage requirements in order. In short: Toolchain answers “how to compile” (compiler/runtimes/language level); Deps answers “what to consume and link” (headers, libraries, flags) for that graph—removing hand-maintained project drift.


#### XcodeToolchain changes

When integrating the new XcodeToolchain I found that it works slightly different than with conan 1x. In the `*.xcconfig` config files for each variable a filter is added, which sets the target cpu architecture, e.g. `x86_64` or `armv8`.


```py
from conan import ConanFile
from conan.tools.apple import XcodeToolchain, XcodeDeps

class MyAwesomeRecipeConan(ConanFile):
  author = "ovaar"
  license = "Closed"
  description = ""

  settings = "os", "build_type", "arch", "compiler"
  options = {}

  no_copy_source = True
  build_policy = "never" # This package cannot be built from sources, it is always created with conan export-pkg
  virtualbuildenv = False
  virtualrunenv = False

  def generate(self):
    if self.settings.os == "Macos":
      tc = XcodeToolchain(self)
      tc.generate()

      deps = XcodeDeps(self)
      deps.generate()
```

```c
HEADER_SEARCH_PATHS[arch=x86_64] = $(SRCROOT)/conan_deps/zstd/include
LIBRARY_SEARCH_PATHS[arch=x86_64] = $(SRCROOT)/conan_deps/zstd/lib/Debug/x86_64
OTHER_LDFLAGS[arch=x86_64] = -lzstd -Wl,-rpath,$(SRCROOT)/conan_deps/zstd/lib/Debug/x86_64
GCC_PREPROCESSOR_DEFINITIONS[arch=x86_64] = ZSTD_MULTITHREAD DEBUG=1
```

In the context of building Universal (FAT) binaries on macOS, on conan 1x you could cheat the system by building a single package, as a FAT binary, but export it as only one of the target architectures like `armv8`. This would reduce the need to have to build and store two packages, but because of the filter in the `*.xcconfig` files when consuming that `armv8` package on an intel machine all those settings are not applied in Xcode, failing the build.

To be able to get around this two Universal (FAT) binary packages are exported with the target architecture `arch=armv8` and `arch=x86_64` separately, until that project is migrated to cmake.

```
                   +------------------------+
                   | conan_config.xcconfig  |  <--- Entry point for Xcode
                   +-----------+------------+
                               |
          +--------------------+--------------------------+
          |                                               |
+-------------------------+                    +-----------------------------+
| conantoolchain.xcconfig |  <--- Aggregates   | conan_global_flags.xcconfig | (optional)
+------------+------------+        per-config  +-----------------------------+
             |
     +-------+------------------------------------------+
     |                                                  |
+----------------------------------------+  +----------------------------------------+
| conantoolchain_release_x86_64.xcconfig |  | conantoolchain_debug_x86_64.xcconfig   |
+----------------------------------------+  +----------------------------------------+
```


You can solve this by:

1. Building the package twice for `x86_64` and `armv8` separately;
    * To either combine them later using lipo, see [How to build Macos Universal Binaries with Conan and CMake]({{< ref "blog/how-to-build-macos-universal-binaries-with-conan-and-cmake" >}})
    * Or publish it twice for both platforms as FAT binaries, which we chose to do up until the point where the project is migrated to CMake.
2. Specify in your conan profile multiple archs, but this, at the time of writing, only implemented for CMake.

```
[settings]
    os=Macos
    arch=armv8|x86_64 # sort alphabetically
```


## 1.5. Conan APIs

In this section I'll be demonstrating, using a few examples, how to programmatically use some of the conan 2.x APIs available.

### 1.5.1. Loading a conan profile via the ConanAPI

```py
import pprint
import json
from pathlib import Path
from pprint import pprint
from conan.api.conan_api import ConanAPI

conan_api: ConanAPI = ConanAPI()

remote = conan_api.remotes.get("conancenter")
profile = conan_api.profiles.get_profile(
    [str(Path(__file__).parent / "msvc.profile")],
)

serialized = profile.serialize()
pprint(json.dumps(serialized, indent=4))
```

**Output:**
```json
{
    "settings": {
      "os": "Windows",
      "arch": "x86_64",
      "compiler": "msvc",
      "build_type": "Release",
      "compiler.cppstd": "23",
      "compiler.version": "194",
      "compiler.runtime": "dynamic",
      "compiler.runtime_type": "Release"
    },
    "package_settings": {},
    "options": {},
    "tool_requires": {},
    "conf": {
      "tools.microsoft.msbuild:vs_version": 17
    },
    "build_env": ""
}
```

### 1.5.2. Computing the dependency graph via the Conan Graph API

```py
import pprint
import json
from pathlib import Path
from pprint import pprint
from conan.api.conan_api import ConanAPI

conan_api: ConanAPI = ConanAPI()

remote = conan_api.remotes.get("conancenter")
profile = conan_api.profiles.get_profile(
    [str(Path(__file__).parent / "msvc.profile")],
)
recipe_path = Path(__file__).parent / "recipes" / "zstd" / "all" / "conanfile.py"
deps_graph = conan_api.graph.load_graph_consumer(
    path=str(recipe_path),
    name="zstd",
    version="1.5.7",
    user=None,
    channel=None,
    profile_host=profile,
    profile_build=profile,
    lockfile=None,
    remotes=[remote],
    update=False,
    check_updates=False,
)

serialized = deps_graph.serialize()
pprint(json.dumps(serialized, indent=4))
```

**Output:**

```json
======== Computing dependency graph ========
{
    "nodes": {
        "0": {
            "ref": "zstd/1.5.7",
            "id": "0",
            "recipe": "Consumer",
            "package_id": null,
            "prev": null,
            "rrev": null,
            "rrev_timestamp": null,
            "prev_timestamp": null,
            "remote": null,
            "binary_remote": null,
            "build_id": null,
            "binary": null,
            "invalid_build": false,
            "info_invalid": null,
            "name": "zstd",
            "user": null,
            "channel": null,
            "url": "https://github.com/conan-io/conan-center-index",
            "license": "BSD-3-Clause",
            "author": null,
            "description": "Zstandard - Fast real-time compression algorithm",
            "homepage": "https://github.com/facebook/zstd",
            "build_policy": null,
            "upload_policy": null,
            "revision_mode": "hash",
            "provides": null,
            "deprecated": null,
            "win_bash": null,
            "win_bash_run": null,
            "default_options": {
                "shared": false,
                "fPIC": true,
                "threading": true,
                "build_programs": true
            },
            "options_description": null,
            "version": "1.5.7",
            "topics": [
                "zstandard",
                "compression",
                "algorithm",
                "decoder"
            ],
            "package_type": "static-library",
            "languages": [],
            "settings": {
                "os": "Windows",
                "arch": "x86_64",
                "compiler": "msvc",
                "compiler.runtime": "dynamic",
                "compiler.runtime_type": "Release",
                "compiler.version": "194",
                "build_type": "Release"
            },
            "options": {
                "build_programs": "True",
                "shared": "False",
                "threading": "True"
            },
            "options_definitions": {
                "shared": [
                    "True",
                    "False"
                ],
                "threading": [
                    "True",
                    "False"
                ],
                "build_programs": [
                    "True",
                    "False"
                ]
            },
            "generators": [],
            "python_requires": null,
            "system_requires": {},
            "recipe_folder": "recipes\\\\zstd\\\\all",
            "source_folder": null,
            "build_folder": null,
            "generators_folder": null,
            "package_folder": null,
            "immutable_package_folder": null,
            "cpp_info": {
                "root": {
                    "includedirs": [
                        "include"
                    ],
                    "srcdirs": null,
                    "libdirs": [
                        "lib"
                    ],
                    "resdirs": null,
                    "bindirs": [
                        "bin"
                    ],
                    "builddirs": null,
                    "frameworkdirs": null,
                    "system_libs": null,
                    "frameworks": null,
                    "libs": null,
                    "defines": null,
                    "cflags": null,
                    "cxxflags": null,
                    "sharedlinkflags": null,
                    "exelinkflags": null,
                    "objects": null,
                    "sysroot": null,
                    "requires": null,
                    "properties": null,
                    "exe": null,
                    "type": null,
                    "location": null,
                    "link_location": null,
                    "languages": null
                }
            },
            "conf_info": {},
            "label": "conanfile.py (zstd/1.5.7)",
            "vendor": false,
            "dependencies": {},
            "context": "host",
            "test": false
        }
    },
    "root": {
        "0": "zstd/1.5.7"
    },
    "overrides": {},
    "resolved_ranges": {},
    "replaced_requires": {},
    "error": null
}
```

## 1.6. Deployers

[Deployers](https://docs.conan.io/2/reference/extensions/deployers.html) is a new helper utility added in conan 2.x that helps with copying dependencies from the conan local cache to the users workspace directory. This can be helpfull to support local development, resulting in a conan-independant project.

Having large dependencies, like for example `boost`, can quickly add up time when using deployers. Luckly, there's an option for creating symlinks, which can be set in the profile using `tools.deployer:symlinks=True`:

```
# msvc.profile
[settings]
  arch=x86_64
  ...
[conf]
tools.deployer:symlinks=True
```

Things I still want to explore are:
* [Conan workspace](https://docs.conan.io/2/reference/workspace_files.html)
* Setting up [multi configuration CI pipeline](https://docs.conan.io/2/ci_tutorial/packages_pipeline/multi_configuration.html)
