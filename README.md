# Dotfiles

This repository allows you to quickly set up a Debian shell with preconfigured Bash, Tmux, and Neovim.

## Prerequisites

1. Clone this repository to your home directory.
2. Install [GNU Stow](https://www.gnu.org/software/stow/) (a symlink manager).

## Using GNU Stow

GNU Stow simplifies the management of dotfiles. To apply the configurations:

```sh
cd ~/dotfiles
stow .
```

This will create symlinks for all configuration files in their respective locations.

### Resources
- [Video tutorial](https://www.youtube.com/watch?v=y6XCebnB9gs)

## Submodule Workflow

This repository uses [Git submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules) to manage and track external configurations. Submodules allow you to keep your configurations up-to-date with their upstream sources.

### Useful Commands

#### Initial Setup
```sh
# Clone this repository along with its submodules
git clone <repo-url> --recurse-submodule

# If cloned without the recursive flag, initialize and update submodules
git submodule update --init --recursive
```

#### Managing Submodules
```sh
# Add a new submodule
git submodule add <https-repo-url>
git config submodule.<submodule-name>.url <ssh-repo-url>  # Add an SSH URL for private use

# Remove a submodule
git config -f .gitmodules --remove-section "submodule.<submodule-name>"
rm -rf <path-to-submodule>
rm -rf .git/modules/<path-to-submodule>

# Pull updates for submodules from upstream
git submodule update --remote [<path-to-submodule>]

# Merge or rebase changes in submodules
git submodule update --remote --merge
git submodule update --remote --rebase
```

### Git Configuration for Submodules
```sh
# Fail push if submodules have unpushed commits
git config push.recurseSubmodules check

# Automatically include submodules in pull and checkout commands
git config submodule.recurse true

# Show submodule changes in diffs
git config --global diff.submodule log

# Display a summary of submodule changes in `git status`
git config status.submodulesummary 1
```

## Fork Workflow

When working with a forked repository, the following commands can help manage upstream updates:

```sh
# View configured remotes
git remote -v

# Add the upstream repository
git remote add upstream <upstream-repo-url>

# Merge changes from upstream into your branch
git fetch upstream
git merge upstream/<branch> <branch>

# Default to your fork (origin) when checking out branches
git config checkout.defaultRemote origin
```

## Diff and Patch Workflow

Use `diff` and `patch` to customize a file while staying synced with upstream changes.

### Steps
1. Locate the file on GitHub and click the "Raw" button to copy the URL.
2. Download the file using `wget`:
   ```sh
   wget https://raw.githubusercontent.com/user/repo/branch/path/file.txt
   ```
3. Create a copy of the file and make your edits.
4. Generate a diff file to capture the differences:
   ```sh
   diff -u file file-copy > file.diff
   ```
5. Use `patch` to apply the changes in the diff file:
   ```sh
   patch < file.diff
   ```
6. To revert the changes:
   ```sh
   patch -R < file.diff
   ```

   **Note**: If `patch` fails, it generates a `file.rej` file with the rejected changes, which must be applied manually.

### Additional Notes
After running `patch`, the original file is saved as `file.orig` for backup.

## tmux

Press `<prefix> I` to install tmux plugins

## Writing Bash Scripts

All Bash scripts in this repository follow this standard header:

```sh
#!/usr/bin/env bash
set -euo pipefail  # Exit on error, unset variable, or pipe failure
```

This ensures reliable and predictable script behavior.
