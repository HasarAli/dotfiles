#!/usr/bin/env bash
set -euo pipefail

# Function to download a file
download_file() {
    url=$1
    filename=$(basename "$url")
    curl -O "$url"
    printf "%s\n" "$filename"
}

# Function to extract a file
extract_file() {
    filename=$1
    case "$filename" in
        *.tar.gz) tar -xzvf "$filename" ;;
        *.tar.bz2) tar -xjvf "$filename" ;;
        *.tar.xz) tar -xJvf "$filename" ;;
        *.zip) unzip "$filename" ;;
        *) >&2 printf "Unknown file type: %s\n" "$filename"; exit 1 ;;
    esac
}

# Get the installed binary version if available
get_installed_version() {
    if ! command -v "$BIN_PATH" >/dev/null; then
        printf "none" # Return a placeholder if binary is not installed
    else
        "$BIN_PATH" --version | awk 'NR==1{print $2}'
    fi
}

# Download and install the binary
install_binary() {
    local download_url="$1"

    # Download the latest release
    if ! curl -LO "$download_url"; then
        printf "Error: Failed to download archive from %s.\n" "$download_url" >&2
        return 1
    fi

    # Remove any existing installation
    sudo rm -rf "$INSTALL_PATH"

    # Extract to installation directory
    sudo mkdir -p "$INSTALL_PATH"
    sudo chmod a+rX "$INSTALL_PATH"
    local archive_name; archive_name=$(basename "$download_url")
    if ! sudo tar -C "$INSTALL_PATH" -xzf "$archive_name"; then
        printf "Error: Failed to extract archive.\n" >&2
        return 1
    fi

    # Update the symlink in /usr/local/bin
    sudo ln -sf "$INSTALL_PATH/bin/$(basename "$BIN_PATH")" "$BIN_PATH"
    printf "Installation completed successfully.\n"
}



main() {
    # Params: package name, version number, and download url
    local latest_version; latest_version=$(get_latest_version) || exit 1
    local installed_version; installed_version=$(get_installed_version)

    if [[ "$installed_version" != "$latest_version" ]]; then
        printf "Update required: Installed version '%s', latest version '%s'.\n" "$installed_version" "$latest_version"
        local download_url; download_url=$(get_latest_download_url) || exit 1
        install_binary "$download_url" || exit 1
    else
        printf "Binary is up-to-date with version '%s'.\n" "$installed_version"
    fi
}

main "$@"
