#!/usr/bin/env bash
set -euo pipefail

install_packages() {
    if ! sudo apt-get update -qq; then
        printf "Error updating package lists.\n" >&2
        return 1
    fi

    for package in "$@"; do
        if ! sudo apt-get install -qq "$package"; then
            printf "Error installing %s.\n" "$package" >&2
            return 1
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
