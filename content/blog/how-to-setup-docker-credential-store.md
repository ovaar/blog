+++
date = "2020-07-28"
publishDate = "2020-07-28"
title = "Secure Docker login credentials with pass on Linux"
description = "Stop Docker storing your password unencrypted: set up docker-credential-pass with pass and a GPG key on Ubuntu, plus the macOS and Windows helpers."
type = "post"
categories = ["Development", "Devops"]
tags = ["devops", "docker"]
+++

Since Docker version 19, `docker login` warns that the credentials are stored unencrypted:

```
WARNING! Your password will be stored unencrypted …
```

To solve this, use the Docker [credential-store](https://docs.docker.com/engine/reference/commandline/login/#credentials-store) feature with a credential helper:

- Ubuntu: [docker-credential-pass](https://github.com/docker/docker-credential-helpers/releases/latest)
- macOS: osxkeychain
- Windows: wincred

The steps below set up `docker-credential-pass` on Ubuntu, with `pass` as the store and GPG for the key.

## 1. Install the helper

The releases of docker-credential-helpers ship plain binaries, not archives. Download the one for your platform to `~/bin` and make it executable (v0.9.13 is the latest at the time of writing):

```shell
mkdir -p ~/bin
curl -fsSL -o ~/bin/docker-credential-pass https://github.com/docker/docker-credential-helpers/releases/download/v0.9.13/docker-credential-pass-v0.9.13.linux-amd64
chmod +x ~/bin/docker-credential-pass
```

On an arm64 machine, use the `docker-credential-pass-v0.9.13.linux-arm64` asset instead.

Docker looks the helper up on your `PATH`, so make sure `~/bin` is on it:

```shell
export PATH="$HOME/bin:$PATH"
```

Add that line to your shell profile to keep it.

## 2. Create a GPG key and initialize pass

```shell
sudo apt-get install -y pass gpg
gpg2 --gen-key
gpg2 --list-secret-keys
pass init "<gpg-key-id>"
```

Copy the key ID from the output of `--list-secret-keys` and use it in `pass init`.

## 3. Tell Docker to use the helper

Add `"credsStore": "pass"` to `~/.docker/config.json` with `jq`, so the file stays valid JSON and existing keys such as `auths` are kept. Create the file with `{}` first if it does not exist:

```shell
mkdir -p ~/.docker
[ -f ~/.docker/config.json ] || echo '{}' > ~/.docker/config.json
jq '. + {"credsStore": "pass"}' ~/.docker/config.json > ~/.docker/config.json.tmp && mv ~/.docker/config.json.tmp ~/.docker/config.json
```

It is safe to run twice: the key is set, not duplicated. Install `jq` with `sudo apt-get install -y jq` if you do not have it.

## 4. Log in

```shell
docker login
```

The credentials are now stored encrypted in `pass`. To check, run `docker-credential-pass list`: after logging in it lists the registry you used.
