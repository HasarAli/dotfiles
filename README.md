# Dotfiles

Debian shell setup with preconfigured Bash, Tmux, and Neovim.

## What's Included

| Component | Key features |
|-----------|-------------|
| **Bash** | Git-aware prompt, persistent unlimited history, `autocd`, git aliases (`gl`, `gs`, `gd`, ...) |
| **Tmux** | Prefix `C-Space`, mouse support, vim-style pane nav, OSC 52 clipboard (works over SSH), catppuccin theme |
| **Neovim** | Vendored [kickstart.nvim](https://github.com/nvim-lua/kickstart.nvim) tailored for TS/JS + Python (LSP via Mason, Telescope, Treesitter, blink.cmp, neo-tree, gitsigns) |

## Setup

```sh
git clone <repo-url>
bash setup.sh
```

The script has an interactive menu. Steps:

1. **Configure git** — sets `checkout.defaultRemote=origin` and `core.hooksPath=hooks`
2. **Stow dotfiles** — symlinks dotfiles to `$HOME` via GNU Stow
3. **Install tmux**
4. **Install tpm** — clones [tpm](https://github.com/tmux-plugins/tpm) to `~/.config/tmux/plugins/tpm`
5. **Install neovim** — downloads nvim + `ripgrep`, `fd`, `tree-sitter` from GitHub releases (cached under `~/.cache/dotfiles-setup`)
6. **Install git-prompt.sh**
7. **Install nerd font** — JetBrainsMono

After setup, inside tmux press `<prefix> I` to install tmux plugins.

## Tmux Keybindings

| Key | Action |
|-----|--------|
| `C-Space` | Prefix |
| `<prefix> h/j/k/l` | Select pane (vim-style) |
| `Alt-Arrow` | Select pane (no prefix) |
| `Shift-Left/Right` | Previous/next window |
| `Shift-Alt-H/L` | Previous/next window (vim-style) |
| `<prefix> J` | Join pane from another window |
| `<prefix> o` | Send current pane to another window |
| `<prefix> "` / `<prefix> %` | Split in current directory |
| `<prefix> c` | New window in current directory |
| `<prefix> I` | Install plugins (tpm) |

## Neovim Quick Reference

See `dot-config/nvim/init.lua` top of file for the full reference block.

| Command | Purpose |
|---------|---------|
| `:Tutor` | Interactive vim basics |
| `:help <topic>` | Builtin docs |
| `:checkhealth` | Diagnose config/plugin issues |
| `:Lazy` | Plugin manager UI |
| `:Mason` | LSP/tool installer UI |
| `:ConformInfo` | Formatter status for current buffer |
| `<leader>sh` | Telescope: fuzzy search help tags |
| `<leader>sk` | Telescope: list all keymaps |

Leader key is `<Space>`. See [kickstart-modular README](https://github.com/nvim-lua/kickstart.nvim) for the original upstream config.

## Writing Bash Scripts

All Bash scripts in this repository follow this standard header:

```sh
#!/usr/bin/env bash
set -euo pipefail  # Exit on error, unset variable, or pipe failure
```
