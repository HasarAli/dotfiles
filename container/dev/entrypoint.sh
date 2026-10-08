#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
    chown -R dev:dev /home/dev/dotfiles /home/dev/app/node_modules \
        /home/dev/.local/share/pnpm/store
    exec gosu dev "$0" "$@"
fi

# Refresh links when a persistent dotfiles volume is attached to a new container.
stow -R --dotfiles -t "$HOME" -d /home/dev/dotfiles .

exec "$@"
