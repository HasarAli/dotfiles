#!/usr/bin/env bash

set -euo pipefail

readonly DOTFILES_DIR="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MISE_BIN=""

# Escalation is per-command: the system packages need root, the stow tree, mise,
# and the agent config under $HOME must not have it.
SUDO=""

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

# An install this script just made is not on PATH yet; brew's own shellenv
# reports the prefix, which differs between Apple silicon and Intel.
activate_homebrew() {
    local candidate

    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
        if [[ -x "$candidate" ]]; then
            eval "$("$candidate" shellenv)"
            return 0
        fi
    done

    return 1
}

install_homebrew() {
    if command -v brew >/dev/null 2>&1 || activate_homebrew; then
        return 0
    fi

    # Homebrew refuses to run as root and would scatter an admin-owned prefix.
    if [[ "$(id -u)" -eq 0 ]]; then
        printf 'Error: Homebrew cannot be installed as root. Run this as an admin user.\n' >&2
        return 1
    fi

    printf 'Homebrew not found. Installing it...\n'
    printf 'It will prompt for your password to create /opt/homebrew.\n'

    NONINTERACTIVE=1 /bin/bash -c \
        "$(curl --fail --location --silent --show-error \
            https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    if ! activate_homebrew; then
        printf 'Error: Homebrew install finished but brew is still not on PATH.\n' >&2
        return 1
    fi
}

# Only what mise cannot supply: the C-library-level tools and herdr, which
# publishes no Darwin release asset.
install_macos() {
    install_homebrew

    printf 'Installing system packages via Homebrew...\n'
    # bash-completion@2 is the Bash 4+ series; the unversioned formula targets
    # Bash 3.2 and conflicts with it. .bashrc sources the @2 profile.d script.
    brew install age bash-completion@2 git herdr jq stow
}

install_debian() {
    printf 'Installing system packages via apt...\n'
    $SUDO apt-get update -qq
    $SUDO apt-get install -qq -y age bash-completion curl git jq stow
}

link_dotfiles() {
    printf 'Stowing dotfiles into %s...\n' "$HOME"
    stow -R --dotfiles -t "$HOME" -d "$DOTFILES_DIR" .
}

# Runs after stowing, so mise reads the global config this repo just linked into
# ~/.config/mise/config.toml.
install_runtimes() {
    MISE_BIN=$(command -v mise || true)

    if [[ -z "$MISE_BIN" ]]; then
        if [[ ! -x "$HOME/.local/bin/mise" ]]; then
            printf 'Installing mise...\n'
            curl --fail --location --silent --show-error https://mise.run | sh
        fi
        MISE_BIN="$HOME/.local/bin/mise"
    fi

    printf 'Installing runtimes and tools via mise...\n'
    "$MISE_BIN" install

    # This script is not the interactive shell, so pick up the shims by hand for
    # the hound, npm, and herdr steps below.
    export PATH="$("$MISE_BIN" bin-paths | tr '\n' ':')$PATH"
}

# Hound MCP — keyless web search + stealth fetch/crawl/PDF (the web-search
# engine). Stays outside mise for the [all] extra and the browser download.
install_hound() {
    # mise's python carries no pipx, so prefer one already on PATH and only fall
    # back to bootstrapping it into the interpreter's user site.
    local pipx
    pipx=$(command -v pipx || true)

    if [[ -z "$pipx" ]]; then
        printf 'Installing pipx...\n'
        python3 -m pip install --user -q --upgrade pipx
        pipx="$(python3 -m site --user-base)/bin/pipx"
    fi

    if ! command -v hound >/dev/null 2>&1; then
        printf 'Installing hound-mcp...\n'
        "$pipx" install 'hound-mcp[all]'
    fi

    # Stealth browser Hound escalates to when a page blocks plain HTTP (idempotent)
    local hvenv
    hvenv="$("$pipx" environment --value PIPX_LOCAL_VENVS 2>/dev/null || true)/hound-mcp/bin"
    "$hvenv/patchright" install chromium 2>/dev/null \
        || "$hvenv/playwright" install chromium 2>/dev/null || true
}

install_agent_deps() {
    printf 'Installing pi extension dependencies...\n'
    npm install --prefix "${DOTFILES_DIR}/dot-pi/agent/npm" --silent

    install_herdr_plugins
}

# herdr resolves plugins to absolute paths at install time, so the registry it
# writes (plugins.json) is per-machine. plugins.list is the portable half.
install_herdr_plugins() {
    local list="${DOTFILES_DIR}/dot-config/herdr/plugins.list"
    local repo id root

    printf 'Installing herdr plugins...\n'

    # An entry carried over from another machine points at a path that does not
    # exist here. herdr keeps it registered but cannot load it, so drop it and
    # let the install below re-resolve against this filesystem.
    while IFS=$'\t' read -r id root; do
        [[ -z "$id" || -d "$root" ]] && continue
        printf 'Dropping stale plugin registration: %s\n' "$id"
        herdr plugin uninstall "$id" >/dev/null 2>&1 || true
    done < <(herdr plugin list --json 2>/dev/null |
        jq -r '.result.plugins[] | "\(.plugin_id)\t\(.plugin_root)"' 2>/dev/null || true)

    while read -r repo; do
        [[ -z "$repo" || "$repo" == \#* ]] && continue
        herdr plugin install "$repo" --yes
    done <"$list"
}

main() {
    if [[ $# -gt 0 ]]; then
        printf 'Error: Unknown argument: %s\n' "$1" >&2
        printf 'Usage: %s\n' "$0" >&2
        return 1
    fi

    validate_not_sourced
    configure_privilege

    local os
    os=$(detect_os) || return 1

    case "$os" in
        macos) install_macos ;;
        debian) install_debian ;;
    esac

    link_dotfiles
    install_runtimes
    install_hound
    install_agent_deps

    printf '\nAll dependencies installed.\n'
    printf 'Remaining manual step: copy the age identity to ~/.config/age/keys.txt\n'
}

main "$@"
