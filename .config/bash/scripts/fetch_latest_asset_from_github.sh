#!/usr/bin/env bash
set -euo pipefail

# Usage: ./get_latest_download_url.sh <github_user> <repository> <asset_name>

print_usage() {
    printf "Usage: %s <github_user> <repository> <asset_name>\n" "$(basename "$0")" >&2
    exit 1
}

# Fetch the latest release's download URL from GitHub assets
get_latest_download_url() {
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
        printf "Error: Asset '%s' not found or unable to fetch.\n" "$asset_name" >&2
        exit 1
    fi

    local version version=$(curl -s "$github_api" | jq -r '.tag_name') 
    if [[ -z "$version" ]]; then 
        >&2 printf "Error: Unable to fetch latest version tag.\n" 
        exit 1 
    fi 
    
    printf "Version: %s\nDownload URL: %s\n" "$version" "$download_url"
}

# Main function to process input arguments and call the appropriate function
main() {
    if [[ $# -ne 3 ]]; then
        printf "Error: Missing required arguments.\n" >&2
        print_usage
    fi

    local github_user="$1"
    local repo="$2"
    local asset_name="$3"

    get_latest_download_url "$github_user" "$repo" "$asset_name"
}

main "$@"
