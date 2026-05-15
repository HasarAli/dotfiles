# Dotfiles

Bash, Tmux, Neovim, ttyd tuned for devpods. One command to install.

## Setup

```sh
git clone <repo-url> dotfiles
bash dotfiles/install_deps.sh
stow -v --dotfiles -t $HOME -d <path to dotfiles> .
```

Then launch tmux and press `<prefix> I` once to install tmux plugins.

## Tmux

Catppuccin Mocha statusline matching the ttyd terminal theme. Prefix is `C-Space` — thumb + pinky, no hand travel.

- Bash auto-attaches to a session called `main` on login, so new ttyd tabs drop back into the same layout.
- Mouse-select or `y` in copy-mode emits OSC 52 — text flows straight into your clipboard.
- Mouse on: click to focus a pane, drag borders to resize panes.
- Active pane pops: pink border + brighter window content; inactive panes are dimmed.
- Ergonomics tuned inline: 0ms `Esc` (no nvim lag), 50k-line scrollback, aggressive resize across clients.

### Navigation

| Key                         | Action                                                    |
| --------------------------- | --------------------------------------------------------- |
| `C-h/j/k/l`                 | Move between panes (seamless with nvim splits, no prefix) |
| `<prefix> h` / `<prefix> l` | Previous/next window                                      |
| `Shift-Left/Right`          | Previous/next window (no prefix)                          |
| `<prefix> n` / `<prefix> p` | Next/prev window                                          |

### Panes & windows

Splits open in the current pane's working directory.

| Key                          | Action                                           |
| ---------------------------- | ------------------------------------------------ |
| `<prefix> %` / `<prefix> \|` | Split left/right                                 |
| `<prefix> "` / `<prefix> -`  | Split top/bottom                                 |
| `<prefix> c`                 | New window (in current directory)                |
| `<prefix> m`                 | Mark current pane (tmux default)                 |
| `<prefix> \` / `<prefix> _`  | Pull marked pane in side-by-side / stacked       |
| `<prefix> Tab`               | Swap current pane with the marked pane           |
| `<prefix> k`                 | Kill current window (confirm)                    |
| `<prefix> K`                 | Kill all other windows (confirm)                 |
| `<prefix> X`                 | Kill all other panes in current window (confirm) |
| `<prefix> I`                 | Install tmux plugins                             |
| `<prefix> r`                 | Reload `tmux.conf`                               |

### Session persistence

`tmux-resurrect` + `tmux-continuum` keep sessions across reboots and ttyd restarts. Pane contents and `watch` processes are captured; sessions live in `~/.local/share/tmux/sessions`.

- `<prefix> S` — save now
- `<prefix> R` — restore last save
- Auto-save every 15 min, auto-restore on tmux start.

### Window status pill

Background work in another window flags itself in the statusline and terminal title:

- Red pill (`needs-input`) on the window — something is waiting on you.
- Blue pill (`done`) — a long-running task finished.
- Title gets a `(!N,✓M)` prefix tallying both states across windows.
- Pills clear the moment you focus the window (pane switch, window switch, or browser tab focus).

State is driven by `dot-config/tmux/utils/tmux-notify/tmux_notify.py` — call it from prompt hooks or long-running scripts to set/clear `@notify_state`.

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
