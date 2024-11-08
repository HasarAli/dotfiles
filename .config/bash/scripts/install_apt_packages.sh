#!/usr/bin/env bash
set -euo pipefail

check_is_installed() {
    dpkg -l | grep -q "^ii  $1\s"
}

install_packages() {
    for package in "$@"
    do
        if ! check_is_installed "$package"; then
            printf "%s is not installed. Installing...\n" "$package"
            if sudo apt-get install -y "$package"; then
                printf "%s installed successfully.\n" "$package"
            else
                >&2 printf "Error installing %s.\n" "$package"
            fi
        fi
    done
}

main() {
    if [ $# -eq 0 ]; then
        >&2 printf "No packages specified.\n"
        exit 1
    fi

    if ! sudo apt-get update; then
        >&2 printf "Failed to update package list.\n"
        exit 1
    fi

    install_packages "$@"
}

main "$@"
