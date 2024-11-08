#!/usr/bin/env bash
set -euo pipefail

# Function to download a file
download_file() {
    url=$1
    filename=$(basename "$url")
    curl -O "$url"
    printf "%s\n" "$filename"
}

# Function to extract a file
extract_file() {
    filename=$1
    case "$filename" in
        *.tar.gz) tar -xzvf "$filename" ;;
        *.tar.bz2) tar -xjvf "$filename" ;;
        *.tar.xz) tar -xJvf "$filename" ;;
        *.zip) unzip "$filename" ;;
        *) >&2 printf "Unknown file type: %s\n" "$filename"; exit 1 ;;
    esac
}

# Function to check if a package is already installed and its version
check_version() {
    package_name=$1
    if dpkg -l | grep -q "^ii  $package_name\s"; then
        installed_version=$(dpkg -l | grep "^ii  $package_name\s" | awk '{print $3}')
        printf "Package %s is already installed, version %s.\n" "$package_name" "$installed_version"
        return 1
    else
        return 0
    fi
}

# Function to install a package
install_package() {
    package_dir=$1
    cd "$package_dir"
    if [ -f "configure" ]; then
        ./configure
        make
        sudo make install
    elif [ -f "Makefile" ]; then
        make
        sudo make install
    else
        >&2 printf "No recognizable install method found in %s.\n" "$package_dir"
        return 1
    fi
    cd ..
}

main() {
    if [ $# -eq 0 ]; then
        >&2 printf "No URLs specified.\n"
        exit 1
    fi

    for url in "$@"; do
        printf "Processing URL: %s\n" "$url"
        filename=$(download_file "$url")
        extract_file "$filename"
        package_name=$(basename "$filename" .tar.gz) # Adjust this to match the actual package directory name if needed.
        
        if ! check_version "$package_name"; then
            printf "Installing package %s\n" "$package_name"
            install_package "$package_name"
        fi
        
        printf "Cleaning up %s\n" "$filename"
        rm -f "$filename"
    done
}

main "$@"
