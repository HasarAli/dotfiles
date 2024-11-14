#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="/opt"
BIN_PATH="/usr/local/bin"

extract_archived_package() {
    local archive_name="$1"
    local extracted_dir temp_dir file_type

    local temp_dir; temp_dir=$(mktemp -d)
    local file_type; file_type=$(file -b --mime-type "$archive_name")

    case "$file_type" in
        *gzip)    tar -xzvf "$archive_name" -C "$temp_dir" ;;
        *bzip2)   tar -xjvf "$archive_name" -C "$temp_dir" ;;
        *xz)      tar -xJvf "$archive_name" -C "$temp_dir" ;;
        *zip)     unzip "$archive_name" -d "$temp_dir" ;;
        *)
            printf "Error: Unsupported file type '%s' for %s\n" "$file_type" "$archive_name" >&2
            rm -rf "$temp_dir"
            return 1
            ;;
    esac

    local dirs; dirs=$(find "$temp_dir" -maxdepth 1 -mindepth 1 -type d)
    local files; files=$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type f)

    if [[ "$(echo "$dirs" | wc -l)" -lt 1 ]]; then
        printf "Error: No directory found after extraction.\n" >&2
        rm -rf "$temp_dir"
        return 1
    fi

    if [[ "$(echo "$dirs" | wc -l)" -ne 1 ]] && [[ "$(echo "$files" | wc -l)" -eq 0 ]]; then
        printf "Error: Expected only one root directory, but found more.\n" >&2
        rm -rf "$temp_dir"
        return 1
    fi

    sudo mv "$dirs" .
    sudo rm -f "$archive_name"
    rm -rf "$temp_dir"

    local extracted_dir; extracted_dir=$(basename "$dirs")
    printf "%s" "$extracted_dir"
}

install_archive() {
    local command_name="$1"
    local download_url="$2"
    
    local archive_name; archive_name=$(basename "$download_url")
    if ! curl -LO "$download_url"; then
        printf "Error: Failed to download archive from %s.\n" "$download_url" >&2
        return 1
    fi

    local extracted_package
    extracted_package=$(extract_archived_package "$archive_name") || {
        printf "Error: Failed to extract archive.\n" >&2
        return 1
    }

    local install_path; install_path="$INSTALL_ROOT/$extracted_package"
    sudo rm -rf "$install_path"
    sudo mkdir -p "$install_path"
    sudo chmod a+rX "$install_path"
    sudo mv "$extracted_package" "$INSTALL_ROOT"

    local package_bin_path; package_bin_path="$install_path/bin/$command_name"
    if [[ -x "$package_bin_path" ]]; then
        sudo ln -sf "$package_bin_path" "$BIN_PATH/"
        printf "Installation completed successfully.\n"
    else
        printf "Error: Expected binary not found at '%s'.\n" "$package_bin_path" >&2
        return 1
    fi
}

main() {
    if [[ $# -ne 2 ]]; then
        printf "Usage: %s <command_name> <download_url>\n" "$(basename "$0")" >&2
        exit 1
    fi

    local command_name="$1"
    local download_url="$2"
    
    install_archive "$command_name" "$download_url" || exit 1
}

main "$@"
