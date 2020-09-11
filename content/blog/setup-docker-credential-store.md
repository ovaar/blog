+++
date = "2020-07-28"
publishDate = "2020-07-28"
title = "[Docker] Setup docker credential-store"
type = "post"
categories = ["Development", "Devops"]
tags = ["Development", "Devops", "Docker"]
+++

## [Docker] Setup docker credential-store

Since docker version 19 it start notifying the user that the docker credentials are stored unencrypted.

```
WARNING! Your password will be stored unencrypted …
```

To solve this we will use the Docker [credential-store](https://docs.docker.com/engine/reference/commandline/login/#credentials-store) feature.

- Ubuntu: [docker-credential-pass](https://github.com/docker/docker-credential-helpers/releases/latest)
- OSX: osxkeychain
- Windows: wincred

In this blog post we are going to use install the latest docker-credential-pass helper in combination with pass as a store and gpg for key generation.

```shell
sudo apt-get install -y pass gpg
gpg2 --gen-key
# copy gpg-key
pass init "<gpg-pub-key>"

sed -i '0,/{/s/{/{\n\t"credsStore": "pass",/' ~/.docker/config.json
```

The following one-line will download the latest `docker-credential-pass` helper from github and extract it to the `~/bin` directory:

```shell
curl -fsSLI -o /dev/null -w %{url_effective} https://api.github.com/repos/docker/docker-credential-helpers/releases/latest | xargs curl -s | grep -o "https.*docker-credential-pass.*tar.gz" | wget -qi - && mkdir -p ~/bin && tar -xvf docker-credential-pass-v*-amd64.tar.gz -C ~/bin
```

Finally, login with your docker credentials.

```shell
docker login
```
