#!/bin/bash
set -euo pipefail
set -x # enable debugging
printf "\033[0;32mDeploying updates to GitHub...\033[0m\n"

# Build the project.
docker compose up blog  # if using a theme, replace with `hugo -t <YOURTHEME>`

# Go To Public folder
pushd public

# Add changes to git.
git add .

# Commit changes.
msg="Updating site $(date)"
if [ -n "$*" ]; then
	msg="$*"
fi
git commit -m "$msg"

# Push source and build repos.
git remote -v
git push origin master

popd
git submodule foreach git push origin master
