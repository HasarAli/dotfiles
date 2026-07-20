#!/usr/bin/env bash

set -euo pipefail

readonly CACHE_DIR="/var/cache/dotfiles-setup"
readonly TMP_DIR="/tmp/dotfiles-setup"

cleanup() {
    rm -rf -- "${TMP_DIR:?}"/*
}

handle_signal() {
    local signal="$1"
    local exit_code=130

    if [[ "$signal" == "TERM" ]]; then
        exit_code=143
    fi

    printf 'Error: Received signal %s.\n' "$signal" >&2
    cleanup
    exit "$exit_code"
}

trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM
trap cleanup EXIT

validate_not_sourced() {
    if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
        printf 'Error: This script must be executed, not sourced.\n' >&2
        return 1
    fi
}

validate_root() {
    if [[ "$(id -u)" -ne 0 ]]; then
        printf 'Error: This script must be run as root (e.g. sudo).\n' >&2
        return 1
    fi
}

validate_debian() {
    if [[ ! -f /etc/debian_version ]]; then
        printf 'Error: This script supports Debian/Ubuntu only.\n' >&2
        return 1
    fi
}

prepare_directories() {
    mkdir -p "$CACHE_DIR"
    mkdir -p "$TMP_DIR"
}

ensure_installed() {
    local missing=()
    local pkg

    for pkg in "$@"; do
        if ! dpkg -s "$pkg" >/dev/null 2>&1; then
            missing+=("$pkg")
        fi
    done

    if [[ ${#missing[@]} -eq 0 ]]; then
        return 0
    fi

    printf 'Installing packages: %s\n' "${missing[*]}"

    if ! apt-get update -qq; then
        printf 'Error: apt-get update failed.\n' >&2
        return 1
    fi

    if ! apt-get install -qq -y "${missing[@]}"; then
        printf 'Error: Failed to install packages: %s\n' "${missing[*]}" >&2
        return 1
    fi
}

verify_sha256() {
    local file="$1"
    local expected="$2"
    local actual

    if [[ ! -f "$file" ]]; then
        printf 'Error: File not found for checksum verification: %s\n' "$file" >&2
        return 1
    fi

    actual=$(sha256sum "$file" | awk '{print $1}')

    if [[ "$actual" != "$expected" ]]; then
        printf 'Error: Checksum mismatch for %s\n' "$file" >&2
        printf '  expected: %s\n' "$expected" >&2
        printf '  actual:   %s\n' "$actual" >&2
        return 1
    fi
}

download_file() {
    local filename="$1"
    local url="$2"
    local expected_sha256="$3"
    local destination="$TMP_DIR/$filename"
    local partial="${destination}.part"

    if [[ -f "$destination" ]] && verify_sha256 "$destination" "$expected_sha256"; then
        return 0
    fi

    rm -f -- "$destination" "$partial"

    printf 'Downloading %s...\n' "$filename"

    if ! curl --fail --location --silent --show-error \
        --output "$partial" \
        "$url"; then
        printf 'Error: Failed to download: %s\n' "$url" >&2
        rm -f -- "$partial"
        return 1
    fi

    if [[ ! -s "$partial" ]]; then
        printf 'Error: Downloaded file is empty: %s\n' "$partial" >&2
        rm -f -- "$partial"
        return 1
    fi

    if ! verify_sha256 "$partial" "$expected_sha256"; then
        rm -f -- "$partial"
        return 1
    fi

    mv -- "$partial" "$destination"
}

extract_tarball() {
    local tarball="$1"
    local destination="$2"

    if [[ ! -f "$tarball" ]]; then
        printf 'Error: Tarball not found: %s\n' "$tarball" >&2
        return 1
    fi

    mkdir -p "$destination"

    if ! tar -C "$destination" -xzf "$tarball"; then
        printf 'Error: Failed to extract tarball: %s\n' "$tarball" >&2
        return 1
    fi
}

create_symlink() {
    local source="$1"
    local target="$2"

    if [[ ! -x "$source" ]]; then
        printf 'Error: Source binary is not executable: %s\n' "$source" >&2
        return 1
    fi

    ln -sf -- "$source" "$target"
}

get_arch() {
    case "$(uname -m)" in
        x86_64)  printf 'x86_64\n' ;;
        aarch64) printf 'aarch64\n' ;;
        *)
            printf 'Error: Unsupported architecture: %s\n' "$(uname -m)" >&2
            return 1
            ;;
    esac
}

install_ripgrep() {
    local arch
    local target
    local version="15.1.0"
    local dir
    local tarball
    local url
    local cached
    local sha256

    ensure_installed curl

    if command -v rg >/dev/null 2>&1; then
        printf 'ripgrep already installed: %s\n' "$(rg --version | head -n1)"
        return 0
    fi

    arch=$(get_arch) || return 1

    case "$arch" in
        x86_64)
            target="x86_64-unknown-linux-musl"
            sha256="1c9297be4a084eea7ecaedf93eb03d058d6faae29bbc57ecdaf5063921491599"
            ;;
        aarch64)
            target="aarch64-unknown-linux-gnu"
            sha256="2b661c6ef508e902f388e9098d9c4c5aca72c87b55922d94abdba830b4dc885e"
            ;;
    esac

    dir="ripgrep-${version}-${target}"
    tarball="${dir}.tar.gz"
    url="https://github.com/BurntSushi/ripgrep/releases/download/${version}/${tarball}"
    cached="${CACHE_DIR}/${dir}"

    if [[ ! -x "${cached}/rg" ]]; then
        download_file "$tarball" "$url" "$sha256"
        extract_tarball "${TMP_DIR}/${tarball}" "$CACHE_DIR"
    fi

    create_symlink "${cached}/rg" "/usr/local/bin/rg"

    printf 'Installed ripgrep: %s\n' "$(rg --version | head -n1)"
}

install_fd() {
    local arch
    local version="v10.4.2"
    local dir
    local tarball
    local url
    local cached
    local sha256

    ensure_installed curl

    if command -v fd >/dev/null 2>&1; then
        printf 'fd already installed: %s\n' "$(fd --version)"
        return 0
    fi

    arch=$(get_arch) || return 1

    case "$arch" in
        x86_64)
            sha256="def59805cd14b5651b68990855f426ad087f3b96881296d963910431ba3143c8"
            ;;
        aarch64)
            sha256="6c51f7c5446b3338b1e401ff15dc194c590bb2fa64fd43ff3278300f073adec5"
            ;;
    esac

    dir="fd-${version}-${arch}-unknown-linux-gnu"
    tarball="${dir}.tar.gz"
    url="https://github.com/sharkdp/fd/releases/download/${version}/${tarball}"
    cached="${CACHE_DIR}/${dir}"

    if [[ ! -x "${cached}/fd" ]]; then
        download_file "$tarball" "$url" "$sha256"
        extract_tarball "${TMP_DIR}/${tarball}" "$CACHE_DIR"
    fi

    create_symlink "${cached}/fd" "/usr/local/bin/fd"

    printf 'Installed fd: %s\n' "$(fd --version)"
}

install_tree_sitter() {
    local arch
    local arch_name
    local version="v0.25.10"
    local filename
    local url
    local cached
    local sha256
    local tmp

    ensure_installed curl gzip

    if command -v tree-sitter >/dev/null 2>&1; then
        printf 'tree-sitter already installed: %s\n' "$(tree-sitter --version | head -n1)"
        return 0
    fi

    arch=$(get_arch) || return 1

    case "$arch" in
        x86_64)
            arch_name="x64"
            sha256="8283ddba69253c698f6e987ba0e2f9285e079c8db4d36ebe1394b5bb3a0ebdfd"
            ;;
        aarch64)
            arch_name="arm64"
            sha256="07fbff8ae0eeb0d3e496e14fc1a30dcc730cc2c97d70e601e5357f2e51958af5"
            ;;
    esac

    filename="tree-sitter-linux-${arch_name}.gz"
    url="https://github.com/tree-sitter/tree-sitter/releases/download/${version}/${filename}"
    cached="${CACHE_DIR}/tree-sitter-${version}-${arch_name}"

    if [[ ! -x "$cached" ]]; then
        download_file "$filename" "$url" "$sha256"

        tmp="${cached}.tmp"
        rm -f -- "$tmp"

        if ! gunzip -c "${TMP_DIR}/${filename}" > "$tmp"; then
            printf 'Error: Failed to extract tree-sitter binary.\n' >&2
            rm -f -- "$tmp"
            return 1
        fi

        chmod +x "$tmp"
        mv -- "$tmp" "$cached"
    fi

    create_symlink "$cached" "/usr/local/bin/tree-sitter"

    printf 'Installed tree-sitter: %s\n' "$(tree-sitter --version | head -n1)"
}

install_neovim() {
    local arch
    local arch_name
    local version="v0.12.2"
    local dir
    local tarball
    local url
    local cached
    local sha256

    ensure_installed git make gcc curl unzip

    install_ripgrep
    install_fd
    install_tree_sitter

    if command -v nvim >/dev/null 2>&1; then
        printf 'neovim already installed: %s\n' "$(nvim --version | head -n1)"
        return 0
    fi

    arch=$(get_arch) || return 1

    case "$arch" in
        x86_64)
            arch_name="x86_64"
            sha256="31cf85945cb600d96cdf69f88bc68bec814acbff50863c5546adef3a1bcef260"
            ;;
        aarch64)
            arch_name="arm64"
            sha256="f697d4e4582b6e4b5c3c26e76e06ce26efa08ba1768e03fd2733fcc422bb0490"
            ;;
    esac

    dir="nvim-linux-${arch_name}"
    tarball="${dir}.tar.gz"
    url="https://github.com/neovim/neovim/releases/download/${version}/${tarball}"
    cached="${CACHE_DIR}/neovim-${version}/${dir}"

    if [[ ! -x "${cached}/bin/nvim" ]]; then
        download_file "$tarball" "$url" "$sha256"
        mkdir -p "${CACHE_DIR}/neovim-${version}"
        extract_tarball "${TMP_DIR}/${tarball}" "${CACHE_DIR}/neovim-${version}"
    fi

    create_symlink "${cached}/bin/nvim" "/usr/local/bin/nvim"

    printf 'Installed neovim: %s\n' "$(nvim --version | head -n1)"
}

install_stow() {
    local version=""
    local required_version="2.4.1"
    local dir="stow-${required_version}"
    local tarball="${dir}.tar.gz"
    local url="https://ftp.gnu.org/gnu/stow/${tarball}"
    local cached="${CACHE_DIR}/${dir}"
    local sha256="2a671e75fc207303bfe86a9a7223169c7669df0a8108ebdf1a7fe8cd2b88780b"

    if command -v stow >/dev/null 2>&1; then
        if ! version=$(stow --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -n1); then
            version=""
        fi

        if [[ -n "${version// }" ]] && dpkg --compare-versions "$version" ge "$required_version"; then
            printf 'stow already installed: %s\n' "$(stow --version | head -n1)"
            return 0
        fi
    fi

    ensure_installed curl make perl

    if [[ ! -f "${cached}/configure" ]]; then
        download_file "$tarball" "$url" "$sha256"
        extract_tarball "${TMP_DIR}/${tarball}" "$CACHE_DIR"
    fi

    if [[ -f "${cached}/.install-complete" ]]; then
        printf 'stow already built: %s\n' "$(stow --version | head -n1)"
        return 0
    fi

    (
        cd "$cached" || return 1

        if ! ./configure --prefix=/usr/local; then
            printf 'Error: stow configure failed.\n' >&2
            return 1
        fi

        if ! make -j"$(nproc)"; then
            printf 'Error: stow build failed.\n' >&2
            return 1
        fi

        if ! make install; then
            printf 'Error: stow installation failed.\n' >&2
            return 1
        fi

        touch "${cached}/.install-complete"
    )

    printf 'Installed stow: %s\n' "$(stow --version | head -n1)"
}

main() {
    local with_lang_servers=0

    if [[ $# -gt 0 ]]; then
        if [[ $# -eq 1 && "$1" == "--lang-servers" ]]; then
            with_lang_servers=1
        else
            printf 'Error: Unknown argument: %s\n' "$1" >&2
            printf 'Usage: sudo %s [--lang-servers]\n' "$0" >&2
            return 1
        fi
    fi

    validate_not_sourced
    validate_root
    validate_debian
    prepare_directories

    ensure_installed bash-completion git tmux jq
    install_stow
    install_neovim

    # Only needed when nvim language modules are enabled (see ~/.config/nvim-langs):
    # Mason installs python tools via pip in a venv (python3-venv) and the
    # typescript/bash/data servers via npm.
    if [[ "$with_lang_servers" -eq 1 ]]; then
        ensure_installed nodejs npm python3-venv
    fi
}

main "$@"
