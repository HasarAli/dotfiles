#!/usr/bin/env bash
set -euo pipefail

install_apt_packages() {
	local packages=(tmux make gcc ripgrep unzip git curl)
	local missing=()

	for pkg in "${packages[@]}"; do
		if ! dpkg -s "$pkg" &>/dev/null; then
			missing+=("$pkg")
		fi
	done

	if [[ ${#missing[@]} -eq 0 ]]; then
		printf "All apt packages already installed.\n"
		return 0
	fi

	printf "Installing: %s\n" "${missing[*]}"
	sudo apt-get update -qq
	sudo apt-get install -qq -y "${missing[@]}"
}

install_nvim() {
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

install_nerdfont() {
	local font_name="JetBrainsMonoNerdFont"

	if fc-list | grep -qi "$font_name"; then
		printf "%s is already installed.\n" "$font_name"
		return 0
	fi

	printf "Install %s? (y/n): " "$font_name"
	read -r response
	if [[ "$response" != [yY] ]]; then
		printf "Skipped font installation.\n"
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
	install_apt_packages
	install_nvim
	install_nerdfont
}

main
