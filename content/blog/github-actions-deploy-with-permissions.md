+++
date = "2025-01-31"
title = "Deploying a Blog with GitHub Actions, Docker, and Submodules"
description = "A step-by-step guide to deploying a static blog using GitHub Actions, Docker, and submodules."
type = "post"
categories = ["DevOps", "GitHub Actions", "Docker"]
tags = ["github", "devops", "docker", "git"]
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
- Repeat steps for each submodule repository that requires access.

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
          token: ${{ secrets.GH_PAT }} # 🔥 Ensures submodules use PAT

      - name: Submodule cleanup fix  # Bodge for https://github.com/actions/checkout/issues/358
        run: |
          git submodule foreach --recursive git clean -ffdx
          git submodule foreach --recursive git reset --hard
          git submodule foreach --recursive git checkout -f master

      - name: Run docker compose
        run: docker compose up blog
      
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          repository: public
          branch: master # Adjust if needed
          push_options: --force
          create_branch: false
```

---

## ✅ Step 3: Push and Test
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

