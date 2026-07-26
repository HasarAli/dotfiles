#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
    chown -R dev:dev /home/dev/app/node_modules
    chown dev:dev "${DOTFILES_DIR:-/home/dev/dotfiles}"
    exec gosu dev "$0" "$@"
fi

DOTFILES_DIR="${DOTFILES_DIR:-/home/dev/dotfiles}"
DOTFILES_REPO="${DOTFILES_REPO:-https://github.com/HasarAli/dotfiles.git}"

ensure_dotfiles_repo() {
	if [[ -d "${DOTFILES_DIR}/.git" ]]; then
		return 0
	fi

	if [[ -n "$(ls -A "${DOTFILES_DIR}" 2>/dev/null || true)" ]]; then
		printf 'Error: %s exists but is not a git repository.\n' "${DOTFILES_DIR}" >&2
		exit 1
	fi

	printf 'Cloning dotfiles from %s into %s\n' "${DOTFILES_REPO}" "${DOTFILES_DIR}"
	git clone --depth 1 "${DOTFILES_REPO}" "${DOTFILES_DIR}"
}

ensure_stowed() {
	rm -f "${HOME}/.bashrc" "${HOME}/.profile" "${HOME}/.bash_logout"
	stow -v --dotfiles -t "${HOME}" -d "${DOTFILES_DIR}" .
}

ensure_dotfiles_repo
ensure_stowed

exec "$@"
