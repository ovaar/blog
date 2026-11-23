+++
date = "2023-11-17"
title = "Run a Python function by name from the command line"
description = "Call any function in a Python script from the command line with positional or keyword arguments, using globals() and inspect.signature."
type = "post"
categories = ["Development"]
tags = ["python"]
+++

Take the following use case, where I have a script that I use in my Continuous Integration (CI) pipeline and I would like to call a function in that file from the command-line with parameters. For a more structured alternative with typed options, see [typed command line arguments in Python](/blog/how-to-typed-command-line-arguments-in-python/).

> The [inspect](https://docs.python.org/3/library/inspect.html) module provides several useful functions to help get information about live objects such as modules, classes, methods, functions, tracebacks, frame objects, and code objects. For example, it can help you examine the contents of a class, retrieve the source code of a method, extract and format the argument list for a function, or get all the information you need to display a detailed traceback.

In more detail, the [class inspect.Signature](https://docs.python.org/3/library/inspect.html#inspect.Signature) provides the ability to capture the signature of a Callable object, meaning that it returns the parameters of the function including each parameters type.

```py
# @file: myscript.py

import inspect
import sys

def foo(bar: str):
    print(f"foo(bar={bar})")

if __name__ == "__main__":
    # args[0]  = current file
    # args[1]  = function name
    # args[2:] = function args : (*unpacked)
    func = globals()[sys.argv[1]]
    args = [arg for arg in sys.argv[2:] if "=" not in arg]
    kwargs = dict(arg.split("=", 1) for arg in sys.argv[2:] if "=" in arg)
    # Binds / maps the command-line arguments to the function,
    # raises a TypeError when the parameters do not match
    bound_arguments = inspect.signature(func).bind(*args, **kwargs)
    func(*bound_arguments.args, **bound_arguments.kwargs)
```

Lets break the example down.
The main expects one or more command-line arguments that are used to lookup a function by name with parameters in the current python file.
Using `globals` we can retrieve the Callable object to our function by name. Secondly, the optional remaining arguments are sliced from `sys.argv` and converted to a list of `args` and mapped to a dictionary of keyword argument conditionally if the parameter contains a `=` in the string. Finally, using [inspect.Signature.bind](https://docs.python.org/3/library/inspect.html#inspect.Signature.bind) the parameters are mapped to the function. The function is called once if the call signature matches, otherwise `bind` raises a `TypeError`.


```sh
# Call using positional arguments
$ python3 myscript.py foo baz
foo(bar=baz)
```

```sh
# Call using keyword arguments
$ python3 myscript.py foo bar=baz
foo(bar=baz)
```

Note that `globals()[sys.argv[1]]` lets the caller invoke any name in the module, so only use this for scripts you control, such as CI helpers.
