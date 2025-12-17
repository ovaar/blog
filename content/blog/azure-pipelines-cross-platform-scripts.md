+++
date = "2024-08-01"
title = "Azure pipelines cross-platform scripts" Updating site Wed, Dec 17, 2025
type = "post"
categories = ["Devops"]
tags = ["devops", "azure"]
+++

# Azure pipelines cross-platform scripts

To keep things simple when setting up a CI/CD pipeline for a cross-platform application we cautiously have to consider our options for running the steps in what scripting language, because we don't want to end up with scripts that do the same thing functionally, but are different for each platform, which means extra maintenance and complexity for the maintainers.

So we have to consider languages like Powershell, Bash, Zsh or Python for to run on Windows, macOS and Linux. 


## Bash or Powershell

By default Linux and macOS come with Bash installed, except for Windows, though its likely that your Windows machine already has Git Bash or Window Subsystem for Linux installed.

I personally prefer Bash, because I find that the amount of text I need to write in Powershell in comparison to Bash to accomplish something is to big. Secondly, Bash is such a commonly used
scripting language and it is so easy to find on the internet how to implement something that the productivity is much higher.

```sh
# Git for Windows v2.45.2
$ bash --version
GNU bash, version 5.2.26(1)-release (x86_64-pc-msys)

# Bash on Mac Pro 2023 (12.7.5 Monterey)
$ bash --version
GNU bash, version 3.2.57(1)-release (x86_64-apple-darwin21)
Copyright (C) 2007 Free Software Foundation, Inc.

# Bash on Mac Mini M1 2020 (14.5 Sonoma)
$ bash --version
GNU bash, version 3.2.57(1)-release (arm64-apple-darwin23)
Copyright (C) 2007 Free Software Foundation, Inc.

# Bash on Ubuntu (20.24 Focal Fossa)
$ bash --version
GNU bash, version 5.0.6(1)-release (x86_64)
```

As you can see there are quite some differences in versions between platforms. Especially, macOS comes with an ancient version of Bash, which reduces the amount of modern Bash feature you can use. Depending on your needs this could be a limiting factor, though with you'll often find that with a limiting amount of changes you can achieve the same thing.

### Preparing Git for Windows

To prepare the Windows agent install [Git for Windows](https://git-scm.com/download/win) and make sure to add the `C:\Program Files\Git\bin` directory to the PATH.

## The pipeline definition

Let get started by creating a `azure-pipelines.yml` file and setup our platform parameters so that the pipeline can conditionally be run. Next we'll utilize a [jobs strategy matrix](https://learn.microsoft.com/en-us/azure/devops/pipelines/yaml-schema/jobs-job-strategy?view=azure-pipelines#build-on-multiple-platforms) to start the pipeline on the selected platforms' agents. 

Resulting in each agent running the step "Getting started" that will print something to our terminal.

```yml
# azure-pipelines.yml

name: cross_platform_ci

parameters:
  - name: windows_vs_2022
    type: boolean
    default: true
  - name: macOS_x86_64
    type: boolean
    default: true
  - name: macos_arm64
    type: boolean
    default: true
  - name: ubuntu_x86_64
    type: boolean
    default: true

pool:
  name: $(poolName)

jobs:
  - job:
    displayName: "Pipeline job"
    strategy: # https://learn.microsoft.com/en-us/azure/devops/pipelines/yaml-schema/jobs-job-strategy
      matrix:
        ${{ if eq(parameters.windows_vs_2022, true) }}:
          windows_vs_2022:
            poolName: "windows_vs_2022"

        ${{ if eq(parameters.macOS_x86_64, true) }}:
          macOS_x86_64:
            poolName: "macOS_x86_64"

        ${{ if eq(parameters.macos_arm64, true) }}:
          macOS_arm64:
            poolName: "macos_arm64"

        ${{ if eq(parameters.ubuntu_x86_64, true) }}:
          ubuntu_x86_64:
            poolName: "ubuntu_x86_64"

    steps:
      - bash: |
          set -euo pipefail
          echo "Hello Azure pipeline from $AGENT_OS!"
        displayName: "Getting started"
```

### Failing a Bash step in Azure pipelines

By default commands that are executed in a Bash step will not fail the pipeline if they returned a non-zero exit code, unless we explicitly tell bash to fail.

We can set these options using [Bash Set](https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html).

I personally prefer setting the following options

```sh
set -euo pipefail

# -e Exit immediately if a pipeline returns a non-zero status
# -u Treat unset variables and parameters as an error when performing parameter expansion.
# -o pipefail Exit if a pipe returns a non-zero status
```

