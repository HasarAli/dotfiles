#!/usr/bin/env bash
set -euo pipefail

install_packages() {
    for package in "$@"
    do
        if !sudo apt-get install -yq "$package"; then
            >&2 printf "Error installing %s.\n" "$package"
        fi
    done
}

main() {
    if [ $# -eq 0 ]; then
        >&2 printf "No packages specified.\n"
        exit 1
    fi

    if ! sudo apt-get update -qq; then
        >&2 printf "Failed to update package list.\n"
        exit 1
    fi

    install_packages "$@"
}

main "$@"
