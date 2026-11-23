+++
date = "2025-01-31"
title = "Fix the ctypes _type_ error on Azure Pipelines"
description = "pip fails on a self-hosted Windows Azure Pipelines agent with \"class must define a '_type_' attribute\". Prepending Python's DLLs folder to PATH fixed it."
type = "post"
categories = ["Devops"]
tags = ["devops", "python"]
+++

When running `pip install` on an Azure Pipelines self-hosted Windows agent, it can fail with this error:

```plaintext
File "~\myselfhostedagent\_work\_tool\Python\3.12.3\x64\Lib\site-packages\pip\_vendor\platformdirs\windows.py", line 254, in _pick_get_win_folder
    import ctypes  # noqa: PLC0415
    ^^^^^^^^^^^^^
  File "ctypes\__init__.py", line 157, in <module>
AttributeError: class must define a '_type_' attribute
```

It is an `AttributeError` raised while importing `ctypes`, not an `ImportError`. If you run `pip install` manually with the same `python.exe` it works, but inside the Azure Pipelines agent it fails.

## The fix

Prepend Python's `DLLs` directory to the `PATH` in the pipeline. On a Windows agent a `script:` step runs in cmd.exe, so use a `powershell:` step (Windows PowerShell, available on any Windows agent):

```yaml
steps:
  - powershell: |
      $root = python -c "import sys, os; print(os.path.dirname(sys.executable))"
      Write-Host "##vso[task.prependpath]$root\DLLs"
    displayName: "Fix Python DLL Path"
```

The step prepends the interpreter's `DLLs` folder to the `PATH` of all later steps in the job.

### A minimal pipeline

This example adds `UsePythonVersion@0` so the correct Python version is on the `PATH` first. See [Running Python cross-platform in Azure Pipelines](/blog/azure-pipelines-cross-platform-python-scripting/) for setting up Python on self-hosted agents.

```yaml
trigger: main

pool:
  name: Self-Hosted-Agent-Pool

steps:
  - task: UsePythonVersion@0
    inputs:
      versionSpec: '3.12'
      addToPath: true

  - powershell: |
      $root = python -c "import sys, os; print(os.path.dirname(sys.executable))"
      Write-Host "##vso[task.prependpath]$root\DLLs"
    displayName: "Fix Python DLL Path"

  - script: |
      python -m pip install --upgrade pip
      python -m pip install -r requirements.txt
    displayName: "Install Dependencies"
```

### Alternative: `os.add_dll_directory()`

If you prefer not to modify `PATH`, set the DLL directory inside your Python script before using `ctypes`:

```python
import os
import sys

dll_path = os.path.join(os.path.dirname(sys.executable), "DLLs")
os.add_dll_directory(dll_path)

import ctypes  # This should now work correctly
```

This only helps code you control. Setting `PATH` in the pipeline also covers pip and any other Python process on the agent.

## Why it happens

A typical Python installation on Windows consists of:

- `python.exe` in `<PYTHON_ROOT>`.
- Standard libraries in `<PYTHON_ROOT>\Lib`.
- DLLs (such as `_ctypes.pyd`, `_queue.pyd`) in `<PYTHON_ROOT>\DLLs`

I did not pin down the root cause. What I know is that prepending the `DLLs` folder to `PATH` made the error go away on this agent, and that `python.exe` works when I run it manually but not inside the pipeline.

Since Python 3.8, Windows resolves the DLL dependencies of extension modules through the application directory, the system directories and [`os.add_dll_directory()`](https://docs.python.org/3/library/os.html#os.add_dll_directory), not through `PATH`. So the `PATH` change is a workaround that worked here, not a documented way to load extension modules. If you want to stay within what Python documents, use the `os.add_dll_directory()` alternative above.
