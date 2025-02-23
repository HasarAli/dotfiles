#!/usr/bin/env bash
set -euo pipefail 

prompt_user_for_permission() {
    local file="$1"

	while true; do
        printf "Add executable permission to %s? (y/n): " "$file"
        local response
        read -r response
        case "$response" in
            y | Y) 
                chmod +x "$file"
                printf "Permission added to %s\n" "$file"
                break
                ;;
            n | N)
                printf "Skipped %s\n" "$file"
                break
                ;;
            *)
                printf "Invalid input. Please enter 'y' or 'n'.\n"
                ;;
        esac
    done
}

main() {
    if [ $# -ne 1 ]; then
        >&2 printf "Usage: %s <file_path>\n" "$(basename "$0")"
        exit 1
    fi

    local file="$1"
    if [ ! -f "$file" ]; then 
        >&2 printf "%s does not exist\n" "$file"
        exit 1
    fi
    
    if [ "$file" -x ]; then
        printf "%s already has exectuable permission\n" "$file"
        exit 0
    fi

    prompt_user_for_permission "$file"
}