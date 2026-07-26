#!/usr/bin/env bash

set -euo pipefail

readonly CACHE_DIR="/var/cache/dotfiles-setup"
readonly TMP_DIR="/tmp/dotfiles-setup"
readonly DOTFILES_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Escalation is per-command: the system packages need root, the stow tree and
# the agent config under $HOME must not have it.
SUDO=""

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

# Root is a legitimate main user (dev containers); being root *via sudo* is not,
# because the dotfiles would land in root's home instead of the invoker's.
configure_privilege() {
    if [[ "$(id -u)" -eq 0 ]]; then
        if [[ -n "${SUDO_USER:-}" ]]; then
            printf 'Error: Do not run this under sudo; run it as %s and let it escalate per command.\n' \
                "$SUDO_USER" >&2
            return 1
        fi

        SUDO=""
        return 0
    fi

    if ! command -v sudo >/dev/null 2>&1; then
        printf 'Error: sudo not found; it is needed to install system packages.\n' >&2
        return 1
    fi

    SUDO="sudo"
}

detect_os() {
    case "$(uname -s)" in
        Darwin) printf 'macos\n' ;;
        Linux)
            if [[ -f /etc/debian_version ]]; then
                printf 'debian\n'
            else
                printf 'Error: Unsupported Linux distribution. Only Debian/Ubuntu supported.\n' >&2
                return 1
            fi
            ;;
        *)
            printf 'Error: Unsupported OS: %s\n' "$(uname -s)" >&2
            return 1
            ;;
    esac
}

prepare_directories() {
    $SUDO mkdir -p "$CACHE_DIR"
    $SUDO chown "$(id -u):$(id -g)" "$CACHE_DIR"
    mkdir -p "$TMP_DIR"
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

    $SUDO ln -sf -- "$source" "$target"
}

install_herdr() {
    local arch
    local version="0.7.5"
    local filename
    local url
    local cached

    if command -v herdr >/dev/null 2>&1; then
        printf 'herdr already installed: %s\n' "$(herdr --version 2>&1)"
        return 0
    fi

    arch=$(get_arch) || return 1

    case "$arch" in
        x86_64)  filename="herdr-linux-x86_64" ;;
        aarch64) filename="herdr-linux-aarch64" ;;
    esac

    url="https://github.com/ogulcancelik/herdr/releases/download/v${version}/${filename}"
    cached="${CACHE_DIR}/herdr-${version}-${arch}"

    if [[ ! -x "$cached" ]]; then
        printf 'Downloading herdr %s...\n' "$version"

        if ! curl --fail --location --silent --show-error \
            --output "$cached" \
            "$url"; then
            printf 'Error: Failed to download herdr.\n' >&2
            rm -f -- "$cached"
            return 1
        fi

        chmod +x "$cached"
    fi

    create_symlink "$cached" "/usr/local/bin/herdr"

    printf 'Installed herdr: %s\n' "$(herdr --version 2>&1)"
}

# Debian does not package sops, so it comes from the upstream release.
install_sops() {
    local arch
    local version="3.13.3"
    local arch_name
    local filename
    local url
    local cached
    local sha256

    if command -v sops >/dev/null 2>&1; then
        printf 'sops already installed: %s\n' "$(sops --version 2>&1 | head -n1)"
        return 0
    fi

    arch=$(get_arch) || return 1

    case "$arch" in
        x86_64)
            arch_name="amd64"
            sha256="e5bec3346a873ae91d871550f3e698c1aad962aff462a080e40f25fde17fef6b"
            ;;
        aarch64)
            arch_name="arm64"
            sha256="53b0abacd38ef1b12a66d6c100956691b9cefce018d91f81e73ddf7438b94d77"
            ;;
    esac

    filename="sops-v${version}.linux.${arch_name}"
    url="https://github.com/getsops/sops/releases/download/v${version}/${filename}"
    cached="${CACHE_DIR}/sops-${version}-${arch}"

    if [[ ! -x "$cached" ]]; then
        download_file "$filename" "$url" "$sha256"
        mv -- "${TMP_DIR}/${filename}" "$cached"
        chmod +x "$cached"
    fi

    create_symlink "$cached" "/usr/local/bin/sops"

    printf 'Installed sops: %s\n' "$(sops --version 2>&1 | head -n1)"
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

install_macos() {
    if ! command -v brew >/dev/null 2>&1; then
        printf 'Error: Homebrew not found. Install from https://brew.sh\n' >&2
        return 1
    fi

    printf 'Installing packages via Homebrew...\n'
    brew install age bash-completion git herdr jq neovim pi-coding-agent sops stow
}

install_debian() {
    prepare_directories

    printf 'Installing packages via apt...\n'
    $SUDO apt-get update -qq
    $SUDO apt-get install -qq -y age bash-completion curl git jq stow

    # pi needs node; install it at the OS level even without --lang-servers
    if ! command -v node >/dev/null 2>&1; then
        $SUDO apt-get install -qq -y nodejs npm
    fi
    if ! command -v pi >/dev/null 2>&1; then
        $SUDO npm install -g @earendil-works/pi-coding-agent
    fi

    install_herdr
    install_sops
    install_neovim
}

# Everything below runs unprivileged: it writes to the stow tree and $HOME.
link_dotfiles() {
    printf 'Stowing dotfiles into %s...\n' "$HOME"
    stow -R --dotfiles -t "$HOME" -d "$DOTFILES_DIR" .
}

install_agent_deps() {
    printf 'Installing pi extension dependencies...\n'
    npm install --prefix "${DOTFILES_DIR}/dot-pi/agent/npm" --silent

    printf 'Installing herdr plugins...\n'
    herdr plugin install
}

main() {
    local with_lang_servers=0

    if [[ $# -gt 0 ]]; then
        if [[ $# -eq 1 && "$1" == "--lang-servers" ]]; then
            with_lang_servers=1
        else
            printf 'Error: Unknown argument: %s\n' "$1" >&2
            printf 'Usage: %s [--lang-servers]\n' "$0" >&2
            return 1
        fi
    fi

    validate_not_sourced
    configure_privilege

    local os
    os=$(detect_os) || return 1

    case "$os" in
        macos) install_macos ;;
        debian) install_debian ;;
    esac

    if [[ "$with_lang_servers" -eq 1 ]]; then
        case "$os" in
            macos)
                brew install node python3
                ;;
            debian)
                $SUDO apt-get install -qq -y nodejs npm python3-venv
                ;;
        esac
    fi

    # Hound MCP — keyless web search + stealth fetch/crawl/PDF (the web-search engine)
    if ! command -v hound &>/dev/null && [[ ! -x "$HOME/.local/bin/hound" ]]; then
        command -v pipx &>/dev/null || python3 -m pip install --user -q pipx
        python3 -m pipx install 'hound-mcp[all]'
    fi
    # Stealth browser Hound escalates to when a page blocks plain HTTP (idempotent)
    hvenv="$(python3 -m pipx environment --value PIPX_LOCAL_VENVS 2>/dev/null)/hound-mcp/bin"
    "$hvenv/patchright" install chromium 2>/dev/null \
        || "$hvenv/playwright" install chromium 2>/dev/null || true

    link_dotfiles
    install_agent_deps

    printf '\nAll dependencies installed.\n'
    printf 'Remaining manual step: copy the age identity to ~/.config/age/keys.txt\n'
}

main "$@"
