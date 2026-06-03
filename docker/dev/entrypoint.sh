#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
    chown -R dev:dev /app/node_modules
    exec gosu dev "$0" "$@"
fi

DOTFILES_DIR="${DOTFILES_DIR:-/home/dev/dotfiles}"
DOTFILES_REPO="${DOTFILES_REPO:-https://github.com/HasarAli/dotfiles.git}"
TPM_DIR="${HOME}/.config/tmux/plugins/tpm"

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

ensure_tpm() {
	if [[ -d "${TPM_DIR}/.git" ]]; then
		return 0
	fi
	mkdir -p "$(dirname "${TPM_DIR}")"
	git clone --depth 1 https://github.com/tmux-plugins/tpm "${TPM_DIR}"
}

ensure_tmux_plugins() {
	if ! command -v tmux &>/dev/null; then
		printf 'Warning: tmux not found; skipping tmux plugin install\n' >&2
		return 0
	fi
	if [[ ! -x "${TPM_DIR}/bin/install_plugins" ]]; then
		printf 'Error: TPM install script missing at %s\n' "${TPM_DIR}/bin/install_plugins" >&2
		exit 1
	fi
	"${TPM_DIR}/bin/install_plugins"
}

ensure_dotfiles_repo
ensure_stowed
ensure_tpm
ensure_tmux_plugins

exec "$@"
