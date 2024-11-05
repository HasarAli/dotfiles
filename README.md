# dotfiles

The goal of this repo is to be able to clone this into a debian shell and start using configured bash, tmux, and nvim. 

## GNU Stow

https://www.youtube.com/watch?v=y6XCebnB9gs

This project utilizes GNU Stow. 

Clone this repo to your home directory. Download and install GNU Stow. Finally, `cd` into dotfiles and run `stow .`.

## Submodule Workflow

This repository uses [git submodules](https://git-scm.com/docs/git-submodule). This allows for keeping configs up-to-date with upstream. Watch [this video](https://www.youtube.com/watch?v=gSlXo2iLBro) to learn about them. Here are some useful commands:

```sh
# Cloning this repo
git clone [address] --recurse-submodule

# If you've coloned already without the recursive flag
# you can populate the submodules 
git submodule update --init --recursive 

# Add submodule
git submodule add -b master <repository> 

# Remove a submodule
git rm <path-to-submodule>

# Execute git command for current repo and all submodules recursively
git pull -recurse-submodules

# Configure git to always execute submodule commands recursively
git config submodule.recurse true
```
# Common git workflow after forking a repository

```sh
# See remotes
git remote -v

# Add upstream remote
git remote add upstream <repository>

# Merge upstream 
git merge upstream/<branch> <branch>

# Configure git to prefer origin over upstream when executing git commands
git config checkout.defaultRemote origin
```

## Diff/Patch Workflow

Rather than forking a repository to customize a file and keep it up to date with upstream, we can use wget, diff, and patch.

1. Using the browser, find the file you want to customize on Github. 
2. Find and click the "raw" button in the file viewer. Copy the url in the address bar.
3. Download the file.

```sh
wget https://raw.githubusercontent.com/user/repo-name/branch/path/file.txt
```

4. Make a copy and edit the file.
5. Create a `diff` for the original and the edited file.

```sh
diff -u file file-copy > file.diff
```

6. Now you are able to delete your edited file, `file-copy`, and use `file.diff` to recreate it with patch. 
Note that the original file should be in the same path as noted in the diff.

```sh
patch < file.diff
```

You can revert the changes to `file` as below:

```sh
patch -R < file.diff
```

After running `patch`, you can see the orignal file in the same directory called `file.orig`. This is the file before you applied any patches. When `patch` fails, it will output a `file.rej` file. You will have to open the file and apply the diff manually.

## Bash Scripts

Bash scripts will start with the following

```sh
#!/usr/bin/env bash
set -euo pipefail # exit on error, unset variable, or pipe fail
```
