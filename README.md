# Dotfiles

This repository allows you to quickly set up a Debian shell with preconfigured Bash, Tmux, and Neovim.

## What's Included

| Component | Key features |
|-----------|-------------|
| **Bash** | Git-aware prompt, persistent unlimited history, `autocd`, git aliases (`gl`, `gs`, `gd`, ...) |
| **Tmux** | Prefix `C-Space`, mouse support, vim-style pane nav, OSC 52 clipboard (works over SSH), catppuccin theme |
| **Neovim** | [kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim) fork with LSP, Telescope, Treesitter, blink.cmp |

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

After installing tmux plugins: press `<prefix> I` inside tmux.

## Submodule Workflow

This repository uses [Git submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules) to manage and track external configurations.

A pre-commit hook automatically syncs submodule pointers to their latest remote HEAD on commits to `main`.

### Managing Submodules
```sh
# Add a new submodule
git submodule add <https-repo-url>
git config submodule.<submodule-name>.url <ssh-repo-url>  # Add an SSH URL for private use

# Remove a submodule
git config -f .gitmodules --remove-section "submodule.<submodule-name>"
rm -rf <path-to-submodule>
rm -rf .git/modules/<path-to-submodule>

# Pull updates for submodules
git submodule update --remote [<path-to-submodule>]

# Rebase changes in submodules
git submodule update --remote --rebase
```

## Fork Workflow

The setup script adds an upstream remote for forked submodules. To sync with upstream:

```sh
git fetch upstream
git rebase upstream/<branch>
```

To rebase the nvim fork with upstream and pull all submodules in one shot:
```sh
git -C dot-config/nvim fetch upstream && git -C dot-config/nvim rebase upstream/master && git submodule update --remote
```

## Tmux Keybindings

| Key | Action |
|-----|--------|
| `C-Space` | Prefix |
| `<prefix> h/j/k/l` | Select pane (vim-style) |
| `Alt-Arrow` | Select pane (no prefix) |
| `Shift-Left/Right` | Previous/next window |
| `Shift-Alt-H/L` | Previous/next window (vim-style) |
| `<prefix> J` | Join pane from another window |
| `<prefix> "` / `<prefix> %` | Split in current directory |
| `<prefix> c` | New window in current directory |
| `<prefix> I` | Install plugins (TPM) |

## Writing Bash Scripts

All Bash scripts in this repository follow this standard header:

```sh
#!/usr/bin/env bash
set -euo pipefail  # Exit on error, unset variable, or pipe failure
```

This ensures reliable and predictable script behavior.
