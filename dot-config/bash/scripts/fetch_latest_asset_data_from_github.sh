#!/usr/bin/env bash
set -euo pipefail

get_latest_asset_version_and_url() {
    local github_user="$1"
    local repo="$2"
    local asset_regex="$3"
    local github_api="https://api.github.com/repos/$github_user/$repo/releases/latest"

    local matching_assets
    matching_assets=$(
        curl -s "$github_api" | jq -r --arg regex "$asset_regex" \
        '.assets[] | select(.name | test($regex)) | .name'
    )

    if [[ -z "$matching_assets" ]]; then
        >&2 printf "Error: No assets matching regex '%s' found.\n" "$asset_regex"
        exit 1
    fi

    local selected_asset download_url
    selected_asset=$(printf "%s\n" "$matching_assets" | head -n 1) # Select the first match
    download_url=$(
        curl -s "$github_api" | jq -r --arg name "$selected_asset" \
        '.assets[] | select(.name == $name) | .browser_download_url'
    )

    if [[ -z "$download_url" ]]; then
        >&2 printf "Error: Unable to fetch download URL for asset '%s'.\n" "$selected_asset"
        exit 1
    fi

    local version
    version=$(curl -s "$github_api" | jq -r '.tag_name')
    if [[ -z "$version" ]]; then
        >&2 printf "Error: Unable to fetch latest version tag.\n"
        exit 1
    fi

    printf '{"version": "%s", "asset": "%s", "url": "%s"}\n' "$version" "$selected_asset" "$download_url"
}

main() {
    if [[ $# -ne 3 ]]; then
        >&2 printf "Usage: %s <github_user> <repository> <asset_regex>\n" "$(basename "$0")"
        exit 1
    fi

    local github_user="$1"
    local repo="$2"
    local asset_regex="$3"

    get_latest_asset_version_and_url "$github_user" "$repo" "$asset_regex"
}

main "$@"
