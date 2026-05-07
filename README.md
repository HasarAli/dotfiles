# Dotfiles

Bash, Tmux, Neovim, ttyd tuned for devpods. One command to install.

## Setup

```sh
git clone <repo-url> dotfiles
stow -v --dotfiles -t $HOME -d <path to dotfiles> .
bash dotfiles/install_deps.sh
```

Then launch tmux and press `<prefix> I` once to install tmux plugins.

## Tmux

Catppuccin Mocha statusline matching the ttyd terminal theme. Prefix is `C-Space` — thumb + pinky, no hand travel.

- Bash auto-attaches to a session called `main` on login, so new ttyd tabs drop back into the same layout.
- Mouse-select or `y` in copy-mode emits OSC 52 — text flows straight into your laptop clipboard.
- Mouse on: click to focus a pane, drag borders to resize panes.
- `tmux-sensible` handles ergonomics: 0ms escape time (no lag on `Esc` in nvim), 50k-line scrollback, focus events forwarded to nvim, smarter resize with multiple clients.

### Navigation

| Key                             | Action                                                    |
| ------------------------------- | --------------------------------------------------------- |
| `C-h/j/k/l`                     | Move between panes (seamless with nvim splits, no prefix) |
| `<prefix> h` / `<prefix> l`     | Previous/next window                                      |
| `Shift-Left/Right`              | Previous/next window                                      |
| `<prefix> Space`                | Toggle last window                                        |
| `<prefix> C-n` / `<prefix> C-p` | Next/prev window (alternate)                              |

### Panes & windows

| Key                         | Action                                        |
| --------------------------- | --------------------------------------------- |
| `<prefix> "` / `<prefix> %` | Split pane (opens in current directory)       |
| `<prefix> c`                | New window (in current directory)             |
| `<prefix> o`                | Send current pane to another window           |
| `<prefix> J`                | Pull a pane from another window into this one |
| `<prefix> I`                | Install tmux plugins                          |
| `<prefix> R`                | Reload `tmux.conf`                            |

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

On login, bash auto-attaches to a tmux session named `main`.
