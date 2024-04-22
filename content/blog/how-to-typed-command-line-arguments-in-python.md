+++
date = "2024-04-22"
title = "How to typed command line arguments in python"
type = "post"
categories = ["Development"]
tags = ["Development", "python"]
+++

# How to typed command line arguments in python

Creating tools with python is a common practice due to its ease of use and productivity. Now python already has good built-in support for parsing command-line arguments, but we can take it one step further. 

Let's take the following example where we would like to create a platform independent build script that should be able to accept the build type and an option to rebuild.

Since python3 we want to utilize the typing system as much as possible, meaning that the options the user can use as input for the commandline arguments are created from types so that if the types change the script arguments are automatically updated. 

The [ArgumentParser](https://docs.python.org/3/library/argparse.html#argparse.ArgumentParser) `type` parameter accepts a function that can help us to validate and transform the input data. A very useful class is [StrEnum](https://docs.python.org/3/library/enum.html#enum.StrEnum) which, when inherited from, enables bidirectional conversion of string to enum. We can use this class to strictly declare which values our build_type argument accepts.


```py
#!/usr/bin/env python3
r"""
Platform independent build script.
"""

import argparse
import errno
import os
from pathlib import Path
from typing import Final

try:
    from enum import StrEnum
except:
    raise Exception("Install python >= 3.11")


DEFAULT_SOLUTION_PATH: Final[Path] = Path("application.sln")


class BuildType(StrEnum):
    Debug = "Debug"
    Release = "Release"


def to_build_type(arg: str) -> BuildType:
    try:
        return BuildType[arg]
    except:
        raise argparse.ArgumentTypeError(f"Invalid argument build_type '{arg}'")


def to_path(arg: str) -> Path:
    path = Path(arg)
    if path.exists():
        return path
    else:
        raise FileNotFoundError(errno.ENOENT, os.strerror(errno.ENOENT), arg)


def main(solution_path: Path, build_type: BuildType, rebuild: bool):
    print(
        f"{str(solution_path)} build_type={build_type} {'rebuild' if rebuild else ''}"
    )


parser = argparse.ArgumentParser(description="Build my application.")
parser.add_argument(
    "-b",
    "--build_type",
    type=to_build_type,
    help=f'Set the build type "{"|".join(list(BuildType._member_names_))}"',
    required=True,
)
parser.add_argument(
    "--rebuild",
    dest="rebuild",
    action="store_true",
    help="When set a rebuild is started.",
)
parser.add_argument(
    "--path",
    dest="path",
    type=to_path,
    help=f"The solution file path (optional, default={str(DEFAULT_SOLUTION_PATH)}).",
)

args = parser.parse_args()
build_type: BuildType = args.build_type
solution_path: Path = args.path if args.path else DEFAULT_SOLUTION_PATH

main(solution_path, build_type, args.rebuild)

```

```sh
$ python build.py --help
usage: build.py [-h] -b BUILD_TYPE [--rebuild] [--path PATH]

Build my application.

options:
  -h, --help            show this help message and exit
  -b BUILD_TYPE, --build_type BUILD_TYPE
                        Set the build type "Debug|Release"
  --rebuild             When set a rebuild is started.
  --path PATH           The solution file path (optional, default=application.sln).


$ python build.py --build_type=Release
application.sln build_type=Release


$ python build.py --build_type=RelWithDebug
build.py: error: argument -b/--build_type: Invalid argument build_type 'RelWithDebug'!


$ python build.py --build_type=Release --rebuild
application.sln build_type=Release rebuild


$ python build.py --build_type=Release --path=nopath.sln
File "build.py", line 38, in to_path
    raise FileNotFoundError(errno.ENOENT, os.strerror(errno.ENOENT), arg)
FileNotFoundError: [Errno 2] No such file or directory: 'nopath.sln'
```