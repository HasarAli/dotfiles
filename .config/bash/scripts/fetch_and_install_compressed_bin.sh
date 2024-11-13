#!/usr/bin/env bash
set -euo pipefail

# Define global variables for paths
INSTALL_ROOT="/opt/app"
BIN_PATH="/usr/local/bin"

# Function to determine file type and extract accordingly
# Accepts a target directory as a parameter where the extracted content will be moved
extract_downloaded_file() {
    local archive_name="$1"
    local target_dir="$2"
    local extracted_dir
    # Create a temporary directory for extraction
    local temp_dir; temp_dir=$(mktemp -d)

    # Determine file type and extract into the temp directory
    local file_type; file_type=$(file -b --mime-type "$archive_name")

    case "$file_type" in
        application/x-gzip)    tar -xzvf "$archive_name" -C "$temp_dir" ;;
        application/x-bzip2)   tar -xjvf "$archive_name" -C "$temp_dir" ;;
        application/x-xz)      tar -xJvf "$archive_name" -C "$temp_dir" ;;
        application/zip)       unzip "$archive_name" -d "$temp_dir" ;;
        *)
            >&2 printf "Error: Unsupported file type '%s' for %s\n" "$file_type" "$archive_name"
            return 1
            ;;
    esac

    # Check that only one directory was extracted into the temporary directory
    dirs=$(find "$temp_dir" -maxdepth 1 -mindepth 1 -type d)
    files=$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type f)

    if [[ "$(echo "$dirs" | wc -l)" -lt 1]]; then
        >&2 printf "Error: No directory found after extraction."
        rm -rf "$temp_dir"
        return 1
    fi

    # Ensure there is only one directory
    if [[ "$(echo "$dirs" | wc -l)" -ne 1 ]] && \
       [[ "$(echo "$files" | wc -l)" -eq 0 ]]; then
            >&2 printf "Error: Expected only one root directory, but found more."
            rm -rf "$temp_dir"
            return 1
    fi

    # Strip trailing slash from the directory name
    extracted_dir="${extracted_dir%/}"

    # Move the extracted directory to the target path
    sudo mv "$extracted_dir" "$target_dir"
    sudo rm -f "$archive_name"

    # Clean up the temporary directory
    rm -rf "$temp_dir"

    printf "$extracted_dir"
}

# Get the installed binary version if available
get_installed_version() {
    local package_name="$1"
    
    if ! command -v "$BIN_PATH/$package_name" >/dev/null; then
        printf "none" # Return a placeholder if binary is not installed
    else
        "$BIN_PATH/$package_name" --version | awk 'NR==1{print $2}'
    fi
}

# Download and install the binary
install_binary() {
    local package_name="$1"
    local download_url="$2"

    # Download the latest release archive
    local archive_name; archive_name=$(basename "$download_url")
    if ! curl -LO "$download_url"; then
        printf "Error: Failed to download archive from %s.\n" "$download_url" >&2
        return 1
    fi

    # Extract to installation directory
    local extracted_pacakge; extracted_package=$(extract_file "$archive_name" "$target_path")
    if ! extracted_package; then
        printf "Error: Failed to extract archive.\n" >&2
        return 1
    fi

    # Check if extracted directory contains bin directory, return 1 otherwise

    # Prepare installation path
    local install_path="$INSTALL_ROOT/$extracted_package"
    sudo rm -rf "$install_path"
    sudo mkdir -p "$install_path"
    sudo chmod a+rX "$install_path"

    # Move extracted contents to the install path
    sudo mv "$extracted_package" "$install_path"

    # Update the symlink in /usr/local/bin
    local package_bin_path="$install_path/bin/$package_name"
    if [[ -x "$package_bin_path" ]]; then
        sudo ln -sf "$package_bin_path" "$BIN_PATH/$package_name"
        printf "Installation completed successfully.\n"
    else
        printf "Error: Expected binary not found at '%s'.\n" "$bin_path" >&2
        return 1
    fi
}

main() {
    if [[ $# -ne 3 ]]; then
        >&2 printf "Usage: %s <package_name> <candidate_version> <download_url>\n" "$(basename "$0")"
        exit 1
    fi

    # Retrieve input arguments
    local package_name=$1
    local latest_version=$2
    local download_url=$3
    local installed_version; installed_version=$(get_installed_version "$package_name")

    # Check version and install/update if necessary
    if [[ "$installed_version" != "$latest_version" ]]; then
        printf "Update required: Installed version '%s', latest version '%s'.\n" "$installed_version" "$latest_version"
        install_binary "$package_name" "$download_url" || exit 1
    fi
}

main "$@"
