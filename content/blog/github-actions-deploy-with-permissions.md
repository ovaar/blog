+++
date = "2025-01-31"
title = "Deploying a Blog with GitHub Actions, Docker, and Submodules"
description = "A step-by-step guide to deploying a static blog using GitHub Actions, Docker, and submodules."
type = "post"
categories = ["DevOps", "GitHub Actions", "Docker"]
tags = ["GitHub Actions", "CI/CD, Docker", "Submodules"]
+++

## 🚀 Deploying a Blog with GitHub Actions, Docker, and Submodules

### 📌 Problem Statement
If you’re using GitHub Actions to **build and deploy a static blog** that:
- Runs inside **Docker**
- Pushes generated content to a **GitHub Pages submodule**
- Requires **Git authentication** to commit and push changes

Then, you might run into permission issues, especially when pushing to submodules.

This guide walks you through setting up **GitHub Actions** to automatically deploy your blog **without permission errors**.

---

## ✅ Step 1: Set Up a GitHub Personal Access Token (PAT)
GitHub’s default `GITHUB_TOKEN` **cannot push** to repositories requiring extra permissions (like GitHub Pages). You need a **Personal Access Token (PAT)**.

### 🔥 Generate a PAT
1. **Go to GitHub Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens**
2. Click **"Generate new token"**
3. Set **Expiration**: Recommended **No Expiration**
4. **Repository access**: Select **both** repositories (your main repo and GitHub Pages repo)
5. **Permissions**:
   - ✅ `Contents: Read & Write`
   - ✅ `Workflows: Read & Write`
6. Click **Generate Token** and **copy the token**

### 🔥 Add `GH_PAT` to GitHub Secrets
- Go to **GitHub Repo → Settings → Secrets and Variables → Actions**
- Click **New repository secret**
- Name it **`GH_PAT`**
- Paste the copied token

---

## ✅ Step 2: Configure GitHub Actions Workflow
Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Blog

on:
  push:
    branches:
      - main  # Adjust if needed
  workflow_dispatch:  # Allows manual triggering

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          submodules: true  # Ensures submodules are initialized and updated
          fetch-depth: 0
          token: ${{ secrets.GH_PAT }}  # 🔥 Ensures submodules use PAT

      - name: Set execute permissions for deploy script
        run: chmod +x ./scripts/deploy.sh

      - name: Run Deploy Script
        run: ./scripts/deploy.sh
        env:
          GH_PAT: ${{ secrets.GH_PAT }}
```

---

## ✅ Step 3: Update the `deploy.sh` Script
Modify `scripts/deploy.sh` to **properly authenticate Git** before pushing:

```sh
#!/bin/sh

# If a command fails then the deploy stops
set -e

printf "\033[0;32mDeploying updates to GitHub...\033[0m\n"

# Set up Git user
git config --global user.email "github-actions[bot]@users.noreply.github.com"
git config --global user.name "github-actions[bot]"

# Update submodule URL to use authentication
git submodule foreach --recursive git remote set-url origin https://x-access-token:${GH_PAT}@github.com/ovaar/ovaar.github.io.git

git submodule update --init --recursive

# Build the project.
docker-compose up blog  # Adjust if needed

# Commit and push main repo
git add .
git commit -m "Updating site $(date)"
git push origin master

# Push submodule changes
cd public
git add .
git commit -m "Deploying blog update $(date)"
git push origin master
```

---

## ✅ Step 4: Push and Test
1. **Commit and push changes**
   ```sh
   git add .
   git commit -m "Set up GitHub Actions deployment"
   git push origin main
   ```
2. **Trigger the workflow manually** (optional) from GitHub Actions.
3. **Check GitHub Actions logs** for errors.

---

## 🎯 Summary
✅ Use a **GitHub PAT** instead of `GITHUB_TOKEN` for pushing to submodules.
✅ Pass the **PAT token** in `actions/checkout@v4`.
✅ **Set Git credentials** in `deploy.sh`.
✅ Update submodule **remote URLs** before pushing.

Now, your blog should **auto-deploy** whenever you push changes! 🚀

Need help? Drop a comment below! 😊

