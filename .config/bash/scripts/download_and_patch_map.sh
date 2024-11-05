#!/usr/bin/env bash
set -euo pipefail 

# Global variable for the URL pattern
URL_PATTERN='(https?|ftp|file)://[-[:alnum:]\+&@#/%?=~_|!:,.;]*[-[:alnum:]\+&@#/%=~_|]'

download_and_patch() {
    local filename="$1"
    local url="$2"

    if [[ ! $url =~ $URL_PATTERN ]]; then
        >&2 printf "Error: Invalid URL: %s\n" "$url"
        return 1
    fi
    
    if ! wget -q -O "$filename" "$url"; then
        >&2 printf "Error: Failed to download %s\n" "$url"
        return 1
    fi

    # Look for corresponding .diff file in diffs directory
    diff_file="$diffs_directory/${filename}.diff"

    if [ ! -f "$diff_file" ]; then
        >&2 printf "Warning: No .diff file found for %s\n" "$filename"
        return 0
    fi

    if ! patch --quiet "$filename" < "$diff_file"; then
        >&2 printf "Error: Failed to apply patch %s to %s\n" "$diff_file" "$filename"
        return 1
    fi

    echo "Patched $filename"
}

main() {
    # Check if two parameters are provided
    if [ "$#" -ne 2 ]; then
        printf "Usage: %s <filename_to_url_map_file> <diffs_directory>" "$0" >&2
        return 1
    fi

    filename_to_url_map_file="$1"
    diffs_directory="$2"

    # Check if diffs directory exists
    if [ ! -d "$diffs_directory" ]; then
        printf "Warning: Diffs directory %s does not exist.\n" "$diffs_directory" >&2
        return 1
    fi

    # Check if map file exists and readable
    if [ ! -r "$filename_to_url_map_file" ]; then
        printf "Warning: Filename to URL map file %s not found.\n" "$filename_to_url_map_file" >&2
        return 1
    fi

    # Read mappings from file and process each one
    line_count=0
    while read -r filename url; do
        if [[ -z "$filename" && -z "$url" ]]; then
            >&2 printf "Warning: Line %d is empty\n" "$line_count"
            continue
        fi

        if [[ -z "$filename" || -z "$url" ]]; then
            >&2 printf "Warning: Line %d is invalid: %s %s\n" "$line_count" "$filename" "$url"
            continue
        fi

        # Skip if file already exists
        [ -e "$filename" ] && continue

        if ! download_and_patch "$filename" "$url"; then
            >&2 printf "Something went wrong at line %d\n" "$line_count"
        fi

        ((++line_count))
    done < "$filename_to_url_map_file"
}

main "$@"
