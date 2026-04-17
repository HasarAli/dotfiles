#!/usr/bin/env bash

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
	printf "Error: This script must be run, not sourced. Use: bash %s\n" "${BASH_SOURCE[0]}" >&2
	return 1
fi

set -euo pipefail

CACHE_DIR="$HOME/.cache/dotfiles-setup"

download_to_tmp() {
	local file="$1" url="$2"
	if [[ -f "/tmp/$file" ]]; then
		return 0
	fi
	printf "Downloading %s...\n" "$file"
	if ! curl -fLo "/tmp/$file" "$url"; then
		printf "Error: Failed to download %s.\n" "$file" >&2
		rm -f "/tmp/$file"
		return 1
	fi
}

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

install_ripgrep() {
	ensure_installed curl

	if command -v rg &>/dev/null; then
		printf "ripgrep is already installed: %s\n" "$(rg --version | head -1)"
		return 0
	fi

	local target
	case "$(uname -m)" in
		x86_64)  target="x86_64-unknown-linux-musl" ;;
		aarch64) target="aarch64-unknown-linux-gnu" ;;
		*)
			printf "Error: Unsupported architecture '%s'.\n" "$(uname -m)" >&2
			return 1
			;;
	esac

	local tag="15.1.0"
	local dir="ripgrep-${tag}-${target}"
	local cached="$CACHE_DIR/${dir}"

	if [[ ! -f "${cached}/rg" ]]; then
		local tarball="${dir}.tar.gz"
		local url="https://github.com/BurntSushi/ripgrep/releases/download/${tag}/${tarball}"
		download_to_tmp "$tarball" "$url" || return 1
		mkdir -p "$CACHE_DIR"
		tar -C "$CACHE_DIR" -xzf "/tmp/${tarball}"
		rm -f "/tmp/${tarball}"
	else
		printf "Using cached %s.\n" "$dir"
	fi

	sudo ln -sf "${cached}/rg" /usr/local/bin/rg
	printf "ripgrep installed: %s\n" "$(rg --version | head -1)"
}

install_fd() {
	ensure_installed curl

	if command -v fd &>/dev/null; then
		printf "fd is already installed: %s\n" "$(fd --version)"
		return 0
	fi

	local arch
	arch=$(uname -m)
	case "$arch" in
		x86_64)  arch="x86_64" ;;
		aarch64) arch="aarch64" ;;
		*)
			printf "Error: Unsupported architecture '%s'.\n" "$arch" >&2
			return 1
			;;
	esac

	local tag="v10.4.2"
	local dir="fd-${tag}-${arch}-unknown-linux-gnu"
	local cached="$CACHE_DIR/${dir}"

	if [[ ! -f "${cached}/fd" ]]; then
		local tarball="${dir}.tar.gz"
		local url="https://github.com/sharkdp/fd/releases/download/${tag}/${tarball}"
		download_to_tmp "$tarball" "$url" || return 1
		mkdir -p "$CACHE_DIR"
		tar -C "$CACHE_DIR" -xzf "/tmp/${tarball}"
		rm -f "/tmp/${tarball}"
	else
		printf "Using cached %s.\n" "$dir"
	fi

	sudo ln -sf "${cached}/fd" /usr/local/bin/fd
	printf "fd installed: %s\n" "$(fd --version)"
}

install_treesitter() {
	ensure_installed curl

	if command -v tree-sitter &>/dev/null; then
		printf "tree-sitter is already installed: %s\n" "$(tree-sitter --version | head -1)"
		return 0
	fi

	local arch
	arch=$(uname -m)
	case "$arch" in
		x86_64)  arch="x64" ;;
		aarch64) arch="arm64" ;;
		*)
			printf "Error: Unsupported architecture '%s'.\n" "$arch" >&2
			return 1
			;;
	esac

	local tag="v0.25.10"
	local cached="$CACHE_DIR/tree-sitter-${tag}"

	if [[ ! -f "$cached" ]]; then
		local gz="tree-sitter-linux-${arch}.gz"
		local url="https://github.com/tree-sitter/tree-sitter/releases/download/${tag}/${gz}"
		download_to_tmp "$gz" "$url" || return 1
		mkdir -p "$CACHE_DIR"
		gunzip -c "/tmp/${gz}" > "$cached"
		chmod +x "$cached"
		rm -f "/tmp/${gz}"
	else
		printf "Using cached tree-sitter %s.\n" "$tag"
	fi

	sudo ln -sf "$cached" /usr/local/bin/tree-sitter
	printf "tree-sitter installed: %s\n" "$(tree-sitter --version | head -1)"
}

install_nvim() {
	ensure_installed git make gcc curl unzip
	install_ripgrep
	install_fd
	install_treesitter

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

	local dir="nvim-linux-${arch}"
	local cached="$CACHE_DIR/${dir}"

	if [[ ! -f "${cached}/bin/nvim" ]]; then
		local tarball="${dir}.tar.gz"
		local url="https://github.com/neovim/neovim/releases/latest/download/${tarball}"
		download_to_tmp "$tarball" "$url" || return 1
		mkdir -p "$CACHE_DIR"
		tar -C "$CACHE_DIR" -xzf "/tmp/${tarball}"
		rm -f "/tmp/${tarball}"
	else
		printf "Using cached %s.\n" "$dir"
	fi

	sudo ln -sf "${cached}/bin/nvim" /usr/local/bin/nvim
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
	git -C "$repo_dir" submodule update --init
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
		"Install neovim"
		"Install git-prompt.sh"
		"Install nerd font"
	)
	local funcs=(
		"init_submodules"
		"configure_git"
		"stow_dotfiles"
		"ensure_installed tmux"
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
