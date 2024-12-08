#!/usr/bin/env bash
set -euo pipefail

SCRIPTS="$HOME/.config/bash/scripts"

get_installed_version() {
    local command_name="$1"

    if ! command -v "$command_name" >/dev/null; then
        printf "none"
    else
}

validate_asset_data() {
    local asset_data="$1"

    if ! jq -e '.asset, .version, .url' >/dev/null <<< "$asset_data"; then
        printf "Error: Invalid asset data received.\n" >&2
        return 1
    fi
}

main() {
    if [[ $# -ne 4 ]]; then
        printf "Usage: %s <command_name> <github_user> <repository> <package_regex>\n" "$(basename "$0")" >&2
        exit 1
    fi

    local command_name="$1"
    local github_user="$2"
    local repository="$3"
    local package_regex="$4"

    local asset_data
    if ! asset_data=$("$SCRIPTS/fetch_latest_asset_data_from_github.sh" "$github_user" "$repository" "$package_regex"); then
        printf "Error: Failed to fetch asset data for '%s/%s'.\n" "$github_user" "$repository" >&2
        exit 1
    fi

    if ! validate_asset_data "$asset_data"; then
        printf "Error: Invalid asset data for '%s/%s'.\n" "$github_user" "$repository" >&2
        exit 1
    fi

    local package_name latest_version url
    package_name=$(jq -r '.asset' <<< "$asset_data")
    latest_version=$(jq -r '.version' <<< "$asset_data")
    url=$(jq -r '.url' <<< "$asset_data")

    local installed_version
    installed_version=$(get_installed_version "$command_name")

    if [[ "$installed_version" != "$latest_version" ]]; then
        printf "Update required for '%s': Installed version '%s', latest version '%s'.\n" "$command_name" "$installed_version" "$latest_version"
        "$SCRIPTS/fetch_and_install_package.sh" "$command_name" "$url" || exit 1
    fi
}

main "$@"