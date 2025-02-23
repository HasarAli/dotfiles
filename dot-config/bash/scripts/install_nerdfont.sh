#!/usr/bin/env bash
set -euo pipefail 

FONT_NAME="JetBrainsMonoNerdFont"
FONT_URL="https://github.com/ryanoasis/nerd-fonts/releases/download/v3.0.2/JetBrainsMono.zip"
FONT_DIR="$HOME/.local/share/fonts"
FONT_ZIP="$FONT_DIR/JetBrainsMono.zip"

# Download and install the font
install_font() {
    mkdir -p "$FONT_DIR"
    if ! wget -P "$FONT_DIR" "$FONT_URL"; then
        printf "Error: Failed to download %s.\n" "$FONT_NAME" >&2
        return 1
    fi

    cd "$FONT_DIR" || return 1
    if ! unzip -o "$FONT_ZIP"; then
        printf "Error: Failed to unzip %s.\n" "$FONT_NAME" >&2
        rm -f "$FONT_ZIP"
        return 1
    fi

    rm -f "$FONT_ZIP"
    if ! fc-cache -fv; then
        printf "Error: Font cache update failed.\n" >&2
        return 1
    fi
    printf "%s installed successfully.\n" "$FONT_NAME"
}

main() {
    if [ $(fc-list | grep -ci "$FONT_NAME") -eq 0 ]; then
        install_font || { printf "Installation failed.\n" >&2; return 1; }
    fi
}

main
