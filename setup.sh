#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
	printf "Error: This script must be run, not sourced. Use: bash %s\n" "${BASH_SOURCE[0]}" >&2
	return 1
fi

set -euo pipefail

ensure_installed() {
	local missing=()
	for pkg in "$@"; do
		if ! dpkg -s "$pkg" &>/dev/null; then
			missing+=("$pkg")
		fi
	done
	[[ ${#missing[@]} -eq 0 ]] && return 0
	printf "Installing: %s\n" "${missing[*]}"
	sudo apt-get update -qq
	sudo apt-get install -qq -y "${missing[@]}"
}

install_nvim() {
	ensure_installed make gcc curl

	if command -v nvim &>/dev/null; then
		printf "nvim is already installed: %s\n" "$(nvim --version | head -1)"
		return 0
	fi

	local arch
	arch=$(uname -m)
	case "$arch" in
		x86_64)  arch="x86_64" ;;
		aarch64) arch="arm64" ;;
		*)
			printf "Error: Unsupported architecture '%s'.\n" "$arch" >&2
			return 1
			;;
	esac

	local url="https://github.com/neovim/neovim/releases/latest/download/nvim-linux-${arch}.appimage"
	local dest="/usr/local/bin/nvim"

	printf "Downloading nvim AppImage for %s...\n" "$arch"
	if ! curl -fLo /tmp/nvim "$url"; then
		printf "Error: Failed to download nvim.\n" >&2
		return 1
	fi

	sudo install -m 755 /tmp/nvim "$dest"
	rm -f /tmp/nvim
	printf "nvim installed: %s\n" "$(nvim --version | head -1)"
}

install_git_prompt() {
	ensure_installed curl git

	local dest="$HOME/.config/bash/git-prompt.sh"
	if [[ -f "$dest" ]]; then
		printf "git-prompt.sh already installed.\n"
		return 0
	fi

	local url="https://raw.githubusercontent.com/git/git/refs/heads/master/contrib/completion/git-prompt.sh"
	mkdir -p "$(dirname "$dest")"
	if ! curl -fLo "$dest" "$url"; then
		printf "Error: Failed to download git-prompt.sh.\n" >&2
		return 1
	fi
	printf "git-prompt.sh installed.\n"
}

init_submodules() {
	ensure_installed git

	local repo_dir
	repo_dir=$(cd "$(dirname "$0")" && pwd)

	printf "Initializing submodules...\n"
	git -C "$repo_dir" submodule update --init --recursive

	local nvim_dir="$repo_dir/dot-config/nvim"
	local upstream="https://github.com/nvim-lua/kickstart.nvim.git"
	if [[ -e "$nvim_dir/.git" ]] && ! git -C "$nvim_dir" remote get-url upstream &>/dev/null; then
		printf "Adding upstream remote for kickstart.nvim...\n"
		git -C "$nvim_dir" remote add upstream "$upstream"
	fi

	printf "Submodules initialized.\n"
}

configure_git() {
	ensure_installed git

	local repo_dir
	repo_dir=$(cd "$(dirname "$0")" && pwd)

	printf "Configuring git settings...\n"
	git -C "$repo_dir" config push.recurseSubmodules check
	git -C "$repo_dir" config submodule.recurse true
	git -C "$repo_dir" config diff.submodule log
	git -C "$repo_dir" config status.submodulesummary 1
	git -C "$repo_dir" config checkout.defaultRemote origin
	git -C "$repo_dir" config core.hooksPath hooks
	printf "Git configured.\n"
}

stow_dotfiles() {
	ensure_installed stow

	local repo_dir
	repo_dir=$(cd "$(dirname "$0")" && pwd)

	printf "Stowing dotfiles...\n"
	stow --dotfiles --target="$HOME" --dir="$(dirname "$repo_dir")" "$(basename "$repo_dir")"
	printf "Dotfiles stowed.\n"
}

install_nerdfont() {
	ensure_installed unzip

	local font_name="JetBrainsMonoNerdFont"

	if fc-list | grep -qi "$font_name"; then
		printf "%s is already installed.\n" "$font_name"
		return 0
	fi

	local font_dir="$HOME/.local/share/fonts"
	local font_url="https://github.com/ryanoasis/nerd-fonts/releases/download/v3.0.2/JetBrainsMono.zip"
	local font_zip="$font_dir/JetBrainsMono.zip"

	mkdir -p "$font_dir"
	if ! wget -q -P "$font_dir" "$font_url"; then
		printf "Error: Failed to download %s.\n" "$font_name" >&2
		return 1
	fi

	unzip -oq "$font_zip" -d "$font_dir"
	rm -f "$font_zip"
	fc-cache -f
	printf "%s installed.\n" "$font_name"
}

main() {
	local steps=(
		"Init submodules"
		"Configure git"
		"Stow dotfiles"
		"Install tmux"
		"Install ripgrep"
		"Install neovim"
		"Install git-prompt.sh"
		"Install nerd font"
	)
	local funcs=(
		"init_submodules"
		"configure_git"
		"stow_dotfiles"
		"ensure_installed tmux"
		"ensure_installed ripgrep"
		"install_nvim"
		"install_git_prompt"
		"install_nerdfont"
	)

	printf "Available steps:\n"
	for i in "${!steps[@]}"; do
		printf "  %d) %s\n" $((i + 1)) "${steps[i]}"
	done
	printf "  a) All\n\n"

	read -rp "Select steps (e.g. 1 3 4, or a for all): " selection

	if [[ "$selection" == "a" ]]; then
		selection=$(seq 1 ${#steps[@]})
	fi

	for num in $selection; do
		local idx=$((num - 1))
		if [[ $idx -ge 0 && $idx -lt ${#funcs[@]} ]]; then
			printf "\n--- %s ---\n" "${steps[idx]}"
			${funcs[idx]}
		fi
	done
}

main
