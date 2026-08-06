---
name: nvim
description: Answer questions about the user's Neovim config.
disable-model-invocation: true
---

# nvim

Answer questions about the Neovim config at `~/dotfiles/dot-config/nvim` (deployed to `~/.config/nvim`). Read the config, don't recall from memory — it changes.

## Layout

- `init.lua` — options, global keymaps, filetype tweaks, lazy.nvim bootstrap. Its header comment lists self-help commands (`:Lazy`, `:checkhealth`, `<leader>sk`, …).
- `lua/plugins/*.lua` — one plugin per file, named after the plugin. Keymaps for a plugin live in its file. `which-key.lua` holds the `<leader>` group labels.
- `lua/langs/*.lua` — per-language LSP/format/lint modules, opt-in per machine via `$NVIM_LANGS` or `~/.config/nvim-langs` (see bottom of `init.lua`).
- `lazy-lock.json` — pinned plugin versions.

## Answering

1. Map the question to a file: keymap or plugin behaviour → the plugin's file (or `init.lua` for global maps); language tooling → `lua/langs/<lang>.lua`; anything else → `init.lua`.
2. Read only that file; grep across `lua/` if the first guess misses.
3. Answer with the exact keymap/command/option and cite `file:line`. If the config doesn't cover it, say so and give the stock-Neovim answer.
