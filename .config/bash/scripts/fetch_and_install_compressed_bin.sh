#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="/opt/app"
BIN_PATH="/usr/local/bin"

extract_archived_package() {
    local archive_name="$1"
    local extracted_dir temp_dir file_type

    temp_dir=$(mktemp -d)
    file_type=$(file -b --mime-type "$archive_name")

    case "$file_type" in
        application/x-gzip)    tar -xzvf "$archive_name" -C "$temp_dir" ;;
        application/x-bzip2)   tar -xjvf "$archive_name" -C "$temp_dir" ;;
        application/x-xz)      tar -xJvf "$archive_name" -C "$temp_dir" ;;
        application/zip)       unzip "$archive_name" -d "$temp_dir" ;;
        *)
            printf "Error: Unsupported file type '%s' for %s\n" "$file_type" "$archive_name" >&2
            rm -rf "$temp_dir"
            return 1
            ;;
    esac

    dirs=$(find "$temp_dir" -maxdepth 1 -mindepth 1 -type d)
    files=$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type f)

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

    extracted_dir=$(basename "$dirs")

    sudo mv "$temp_dir/$extracted_dir" .
    sudo rm -f "$archive_name"
    rm -rf "$temp_dir"

    printf "%s" "$extracted_dir"
}

get_installed_version() {
    local package_name="$1"

    if ! command -v "$BIN_PATH/$package_name" >/dev/null; then
        printf "none"
    else
        "$BIN_PATH/$package_name" --version | awk 'NR==1{print $2}'
    fi
}

install_binary() {
    local package_name="$1"
    local download_url="$2"
    local archive_name install_path package_bin_path

    archive_name=$(basename "$download_url")
    if ! curl -LO "$download_url"; then
        printf "Error: Failed to download archive from %s.\n" "$download_url" >&2
        return 1
    fi

    local extracted_package
    extracted_package=$(extract_archived_package "$archive_name") || {
        printf "Error: Failed to extract archive.\n" >&2
        return 1
    }

    install_path="$INSTALL_ROOT/$extracted_package"
    sudo rm -rf "$install_path"
    sudo mkdir -p "$install_path"
    sudo chmod a+rX "$install_path"
    sudo mv "$extracted_package" "$install_path"

    package_bin_path="$install_path/bin/$package_name"
    if [[ -x "$package_bin_path" ]]; then
        sudo ln -sf "$package_bin_path" "$BIN_PATH/$package_name"
        printf "Installation completed successfully.\n"
    else
        printf "Error: Expected binary not found at '%s'.\n" "$package_bin_path" >&2
        return 1
    fi
}

main() {
    if [[ $# -ne 3 ]]; then
        printf "Usage: %s <package_name> <candidate_version> <download_url>\n" "$(basename "$0")" >&2
        exit 1
    fi

    local package_name="$1"
    local latest_version="$2"
    local download_url="$3"
    local installed_version

    installed_version=$(get_installed_version "$package_name")

    if [[ "$installed_version" != "$latest_version" ]]; then
        printf "Update required: Installed version '%s', latest version '%s'.\n" "$installed_version" "$latest_version"
        install_binary "$package_name" "$download_url" || exit 1
    fi
}

main "$@"
