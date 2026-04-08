# Dotfiles

This repository allows you to quickly set up a Debian shell with preconfigured Bash, Tmux, and Neovim.

## Setup

1. Clone this repository with submodules:
   ```sh
   git clone <repo-url> --recurse-submodule
   ```
2. Run the setup script:
   ```sh
   bash setup.sh
   ```
   The script provides an interactive menu to select which steps to run:
   1. **Init submodules** — clones submodules and adds an upstream remote for the kickstart.nvim fork
   2. **Configure git** — sets recommended git configs (submodule recursion, push safety, diff/status display, default remote)
   3. **Stow dotfiles** — installs GNU Stow and symlinks dotfiles to `$HOME`
   4. **Install tmux, ripgrep, neovim, git-prompt.sh, nerd font**

## Submodule Workflow

This repository uses [Git submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules) to manage and track external configurations.

### Managing Submodules
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

## Fork Workflow

The setup script adds an upstream remote for forked submodules. To sync with upstream:

```sh
git fetch upstream
git merge upstream/<branch> <branch>
```

## tmux

Press `<prefix> I` to install tmux plugins

## Writing Bash Scripts

All Bash scripts in this repository follow this standard header:

```sh
#!/usr/bin/env bash
set -euo pipefail  # Exit on error, unset variable, or pipe failure
```

This ensures reliable and predictable script behavior.
