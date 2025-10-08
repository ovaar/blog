+++
date = "2024-08-01"
title = "Azure pipelines cross-platform python scripting"
type = "post"
categories = ["Devops"]
tags = ["devops", "azure"]
+++

# Azure pipelines cross-platform python scripting

This post is a continuation of [Azure pipelines cross-platform scripts]({{< ref "blog/azure-pipelines-cross-platform-scripts" >}}) for Self-Hosted Azure agents. If you've missed it make sure to read this first, since we're going to extend on it.

I can hear you think, "but Python is already cross platform ... ?".
Yes, though this is going to be about how to setup Azure Pipelines to invoke Python in a cross-platform way.

## The problem

The problem that you're going to face is that not all Python installations have the same executables `python` and `python3`. Some have only `python.exe` and others only `python3.exe`.

## UsePythonVersion

Azure introduced [UsePythonVersion@0](https://learn.microsoft.com/nl-nl/azure/devops/pipelines/tasks/reference/use-python-version-v0) this module to address this specific problem. Unfortunately, this module is not truely cross-platform, since at the time of writing, it doesn't support the ARM architecture.

So `UsePythonVersion@0` is going to find the first `python.exe` or `python3.exe` in your PATH that matches the `versionSpec` and `architecture` and adds that location to your PATH.

```yml
# Use Python version v0
# Use the specified version of Python from the tool cache, optionally adding it to the PATH.
- task: UsePythonVersion@0
  inputs:
    versionSpec: '3.x' # string. Required. Version spec. Default: 3.x.
    #disableDownloadFromRegistry: false # boolean. Disable downloading releases from the GitHub registry. Default: false.
    #allowUnstable: false # boolean. Optional. Use when disableDownloadFromRegistry = false. Allow downloading unstable releases. Default: false.
    #githubToken: # string. Optional. Use when disableDownloadFromRegistry = false. GitHub token for GitHub Actions python registry. 
    #addToPath: true # boolean. Add to PATH. Default: true.
  # Advanced
    architecture: 'x64' # 'x86' | 'x64'. Required. Architecture. Default: x64.
```

## Self-hosted agents

With self-hosted agents we can get even a step further, by adding one or more Python versions to the `AGENT_TOOLSDIRECTORY`, which you can find in the `_work/_tool` directory of the agent. 

The benefits of using `AGENT_TOOLSDIRECTORY` instead of installing Python using an installer are:

1. The installed Python version is decoupled from the agent's operating system, because multiple pipelines might require different python versions.
2. Allow updating Python versions without any downtime while migrating between versions.

We're going use an embedded python version and extract and configure that in the `AGENT_TOOLSDIRECTORY`, which is going to look like

```
$AGENT_TOOLSDIRECTORY/
    Python/
        {version number}/
            {platform}/
                {tool files}
            {platform}.complete
```


The following bash script automates the process of setting up the TOOLSDIRECTORY with the given architecture python and version. It avoid using the python `._pth`, which allows for static python module paths, so we can use pip. Lastly, it creates a `python3.exe` by copying `python.exe`, so that we're platform independent again.

```sh
#!/bin/bash
set -o errexit # Exit immediately if a pipeline returns non-zero.

PYTHON_VERSION="3.12.3"
ARCH="x64"

function usage
{
cat <<EOM
$(basename $0) outpath [--version version] [--arch arch]
Downloads the embedded python version a path designed to support Azure Self-hosted agents.

[-v] --version Sets the python release version (default=$PYTHON_VERSION).
[-a] --arch Sets the processor architecture (default=$ARCH)

example: $(basename $0) C:\agent\_work\_tool\Python --version 3.12.3 --arch x64
EOM
    exit 0
}

[[ "$1" == "-h" || "$1" == "--help" ]] && usage

AGENT_PATH="$1"; shift;

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            PYTHON_VERSION="$2"
            shift; shift;
        ;;
        -a|--arch)
            ARCH="$2"
            shift; shift;
        ;;
        -*|--*)
            echo "Unknown option $1"
            exit 1
        ;;
        *)
            shift;
        ;;
    esac
done

[ ! -d "${AGENT_PATH}" ] && echo "Directory not found!" && exit 1;
[ -z "${PYTHON_VERSION}" ] && echo "Invalid python version!" && exit 1;
[[ ! "${ARCH}" == "x64" && ! "${ARCH}" == "x86" ]] && echo "Invalid python arch!" && exit 1;

TARGET_ARCH="amd64"
if [ "$ARCH" == "x86" ]; then TARGET_ARCH="win32"; fi

ARCHIVE_NAME="python-${PYTHON_VERSION}-embed-${TARGET_ARCH}.zip"
INSTALL_PATH="${AGENT_PATH}/${PYTHON_VERSION}/${ARCH}"

mkdir -p "$INSTALL_PATH"

curl -o "${ARCHIVE_NAME}" "https://www.python.org/ftp/python/${PYTHON_VERSION}/${ARCHIVE_NAME}"
curl -o "${INSTALL_PATH}/get-pip.py" "https://bootstrap.pypa.io/get-pip.py" 

unzip "${ARCHIVE_NAME}" -d "${INSTALL_PATH}"

pushd "$INSTALL_PATH"

PTH_FILE="$(find . -iname "*._pth" -type f -print -quit)"
[ -z "$PTH_FILE" ] && echo "FileNotFound "python*._pth" file!" && exit 1;

# Avoid using embedded (fixed) paths to be able to use pip https://bugs.python.org/issue28245
mv "$PTH_FILE" "$PTH_FILE.bak"

./python.exe ./get-pip.py
cp ./python.exe ./python3.exe

popd

touch "${INSTALL_PATH}.complete"
rm "./${ARCHIVE_NAME}"
```


## Pip

Ofcourse we want to be able to consume python packages using pip, but also those we don't want to globally install. To avoid that we want to set the new `site-packages` directory to the pipelines current workspace directory. The advantage of that is that between builds you will always have the state as how it is in the branch.


## Putting it together

I'll start with the tldr version and we can break it down down below.

```yml
pool:
  name: $(poolName)

jobs:
  - job:
    displayName: "Pipeline job"
    strategy:
      matrix:
        ${{ if eq(parameters.windows_vs_2022, true) }}:
          windows_vs_2022:
            poolName: "windows_vs_2022"
            python.version: '3.x'
            python.arch: "x64"

    steps:
      - task: UsePythonVersion@0
          displayName: 'Use Python $(python.version)'
          inputs:
          versionSpec: $(python.version)
          architecture: $(python.arch)
          disableDownloadFromRegistry: true
          addToPath: true
          condition: and(succeeded(), eq(variables['Agent.OS'], 'Windows_NT'))
     
      - bash: |
          set -euo pipefail
          PIP_CACHE_DIR="$(Pipeline.Workspace)/.pip_cache"
          SITE_PACKAGES_DIR="$(Pipeline.Workspace)/.python_packages/lib/site-packages"

          echo "##vso[task.setvariable variable=PYTHONUNBUFFERED]1"
          echo "##vso[task.setvariable variable=PYTHONPATH;]${SITE_PACKAGES_DIR}"
          
          echo "##vso[task.setvariable variable=PIP_CACHE_DIR;]${PIP_CACHE_DIR}"
          echo "##vso[task.setvariable variable=SITE_PACKAGES_DIR;]${SITE_PACKAGES_DIR}"
          
          echo "##vso[task.prependpath]${SITE_PACKAGES_DIR}/bin"
        displayName: "Set env"

      - bash: |
          set -euo pipefail
          python3 -m pip install --target="${SITE_PACKAGES_DIR}" --cache-dir="${PIP_CACHE_DIR}" -r ./requirements.txt
        displayName: 'Pip install'
```



Here we setup a matrix for running jobs on multiple agents by pool name. Additionally, the python version and architecture per host are configured for `UsePythonVersion@0`.

```yml
pool:
  name: $(poolName)

jobs:
  - job:
    displayName: "Pipeline job"
    strategy:
      matrix:
        ${{ if eq(parameters.windows_vs_2022, true) }}:
          windows_vs_2022:
            poolName: "windows_vs_2022"
            python.version: '3.x'
            python.arch: "x64"
```

Here we configure the `UsePythonVersion@0` task to search for the python version in the `AGENT_TOOLSDIRECTORY` we've configured earlier. For the sake this whole example only runs for Windows.

```yml
    steps:
      - task: UsePythonVersion@0
          displayName: 'Use Python $(python.version)'
          inputs:
          versionSpec: $(python.version)
          architecture: $(python.arch)
          disableDownloadFromRegistry: true
          addToPath: true
          condition: and(succeeded(), eq(variables['Agent.OS'], 'Windows_NT'))
```

Now we have two seperate steps to first configure the environment variables so that the pip modules can be found by Python and finally we'll run `pip install`.

```yml
      - bash: |
          set -euo pipefail
          PIP_CACHE_DIR="$(Pipeline.Workspace)/.pip_cache"
          SITE_PACKAGES_DIR="$(Pipeline.Workspace)/.python_packages/lib/site-packages"

          echo "##vso[task.setvariable variable=PYTHONUNBUFFERED]1"
          echo "##vso[task.setvariable variable=PYTHONPATH;]${SITE_PACKAGES_DIR}"
          
          echo "##vso[task.setvariable variable=PIP_CACHE_DIR;]${PIP_CACHE_DIR}"
          echo "##vso[task.setvariable variable=SITE_PACKAGES_DIR;]${SITE_PACKAGES_DIR}"
          
          echo "##vso[task.prependpath]${SITE_PACKAGES_DIR}/bin"
        displayName: "Set env"

      - bash: |
          set -euo pipefail
          python3 -m pip install --target="${SITE_PACKAGES_DIR}" --cache-dir="${PIP_CACHE_DIR}" -r ./requirements.txt
        displayName: 'Pip install'
```

Then will then create a directory structure with the pip cache and python modules like so

```
_work/
    {n}/
        .pip_cache/
        .python_packages/
            lib/
                site-packages/
                    bin/
                {all_your_packages...}
```

Happy coding.
