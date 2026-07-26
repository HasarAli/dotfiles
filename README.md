# Dotfiles

Bash, Herdr, Neovim, pi tuned for devpods. One command to install.

## Setup

Requires **Debian, Ubuntu, or macOS**.

```sh
git clone <repo-url> dotfiles
dotfiles/install_deps.sh
```

Run it as yourself, not under `sudo` — it escalates per command for system
packages, then stows the tree, installs the pi extension dependencies, and
clones the herdr plugins into `~/.config/herdr/plugins/`. Running as root is
fine where root is the main user (dev containers); running it via `sudo` from a
normal account is rejected, since the dotfiles would land in root's home.

The one step it cannot do for you is the age identity — see Secrets below.

## Runtimes

Apt and Homebrew supply only system packages. Everything versioned — neovim,
node, python, sops, pi, herdr — comes from [mise](https://mise.jdx.dev),
declared in `dot-config/mise/config.toml`. One manifest, both platforms, no root.

Versions float on `latest`; pin one by naming its version there.

A project overrides these with its own `mise.toml`, and the PATH swaps on `cd`.
Run `mise trust` in the repo first — a `mise.toml` can run commands.

## Secrets

API keys live encrypted in `secrets/env.yaml` ([sops](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age)); values are ciphertext, key names stay diffable. `.bashrc` decrypts and exports them on shell start. Requires the age identity at `~/.config/age/keys.txt` — copy it to each machine out-of-band (it is never committed).

```sh
SOPS_AGE_KEY_FILE=~/.config/age/keys.txt sops secrets/env.yaml   # edit keys (re-encrypts on save)
```

## Neovim language modules

Language tooling (LSP servers, formatters, linters, debug adapters) is opt-in
per machine, so a box that isn't used for active development downloads none of
it. Enable modules by listing them comma-separated in `$NVIM_LANGS`, or in
`~/.config/nvim-langs` (checked when the env var is unset):

```sh
echo 'python,lua,bash,data' > ~/.config/nvim-langs
```

| Module       | Installs (via Mason)                                     |
| ------------ | -------------------------------------------------------- |
| `python`     | basedpyright, ruff, debugpy (+ dap config)               |
| `typescript` | ts_ls, eslint, prettier, js-debug-adapter (+ dap config) |
| `lua`        | lua_ls, stylua                                           |
| `bash`       | bash-language-server                                     |
| `data`       | jsonls, yamlls, marksman, prettier                       |

Node and python come from mise, so every module works on a stock install. Mason
installs the tools on the
next nvim launch; disabling a module stops loading its servers but doesn't
delete installed binaries (`:MasonUninstall <pkg>` if you want them gone).
Modules live in `dot-config/nvim/lua/langs/` — one file per language, extending
the base lsp/lint/dap specs via lazy.nvim opts fragments.

## Herdr

Herdr is the multiplexer, replacing tmux. Configuration lives in
`dot-config/herdr/config.toml`; plugins are declared in
`dot-config/herdr/plugins.list` — one `OWNER/REPO` per line — and installed by
`install_deps.sh`. Plugins shell out to `wt`, `fzf`, `jq`, and `git`, all
installed for you.

herdr's own `plugins.json` is machine-specific and stays untracked.

## Bash

### Prompt

Colored, compact, and loaded with signal. Path is trimmed to the last three components; branch and repo state appear inline in yellow.

```
.../web/my/pages (main *+)$
```

Status glyphs: `*` unstaged, `+` staged, `%` untracked, `|MERGING`/`|REBASE` mid-op, `u=` in sync with upstream, `u+N-M` N ahead / M behind.

### Prefix-filtered history

Type the start of a command, press `Up` — you walk only the history entries starting with that prefix. Matches are deduped, so you never page through the same command twice.

```
$ git s<Up>       →  git stash pop
       <Up>       →  git status
       <Up>       →  git stash
```

`Down` walks the other way. `Ctrl-R` is still there for fuzzy anywhere-in-line.

History is unlimited, written after every command, and shared: new shells see what you typed in other sessions.

### Navigation

```
~/proj$ src                       # autocd — no `cd` needed
~/proj$ cd ~/prj                  # typo fixed (cdspell) → ~/proj
~/proj$ ls **/*.py                # globstar recurses
```

### Smart completion

- Case-insensitive (`cd /USR/local` tabs to `/usr/local`).
- `-` and `_` are interchangeable (`my_app<Tab>` completes `my-app`).
- Ambiguous matches show on the first tab press, not the second.

### Tooling swaps

`grep` → `rg`, `find` → `fd`, `vi`/`vim` → `nvim`, when installed.

### Git aliases

Full list in `dot-bash_aliases`. Most-used:

| Alias                         | Runs                                            |
| ----------------------------- | ----------------------------------------------- |
| `gs`                          | `git status`                                    |
| `gl`                          | `git log --oneline --graph`                     |
| `gd` / `gds`                  | `git diff` / `git diff --staged`                |
| `ga` / `gaa` / `gap`          | `add` / `add --all` / `add --patch`             |
| `gc` / `gcm` / `gca` / `gcan` | commit / `-m` / `--amend` / `--amend --no-edit` |
| `gco` / `gcb`                 | `checkout` / `checkout -b`                      |
| `gp` / `gpf` / `gpl`          | `push` / `push --force-with-lease` / `pull`     |
| `gst` / `gstp` / `gstl`       | `stash` / `stash pop` / `stash list`            |
| `gr` / `gri`                  | `rebase` / `rebase -i`                          |
| `grh` / `grhh`                | `reset HEAD` / `reset --hard HEAD`              |
| `gf` / `gfa`                  | `fetch` / `fetch --all`                         |

On login, bash launches herdr when it is installed and not already inside a session.
