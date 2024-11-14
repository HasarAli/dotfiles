#!/usr/bin/env bash
set -euo pipefail

get_latest_assest_version_and_url() {
    local github_user="$1"
    local repo="$2"
    local asset_name="$3"
    local github_api="https://api.github.com/repos/$github_user/$repo/releases/latest"

    local download_url
    download_url=$(
        curl -s "$github_api" | jq -r --arg name "$asset_name" \
        '.assets[] | select(.name == $name) | .browser_download_url'
    )

    if [[ -z "$download_url" ]]; then
        >&2 printf "Error: Asset '%s' not found or unable to fetch.\n" "$asset_name"
        exit 1
    fi

    local version version=$(curl -s "$github_api" | jq -r '.tag_name') 
    if [[ -z "$version" ]]; then 
        >&2 printf "Error: Unable to fetch latest version tag.\n" 
        exit 1 
    fi 
    
    printf '{"version": "%s", "url": "%s"}\n' "$version" "$download_url"
}

main() {
    if [[ $# -ne 3 ]]; then
        >&2 printf "Usage: %s <github_user> <repository> <asset_name>\n" "$(basename "$0")"
        exit 1
    fi

    local github_user="$1"
    local repo="$2"
    local asset_name="$3"

    get_latest_assest_version_and_url "$github_user" "$repo" "$asset_name"
}

main "$@"
