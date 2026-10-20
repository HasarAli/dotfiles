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
    brew install age bash-completion@2 git herdr jq poppler stow
}

# build-essential compiles Neovim's tree-sitter parsers and telescope-fzf-native,
# unzip unpacks Mason's downloads, poppler-utils gives pi's web-fetch pdftotext,
# and less is the PAGER.
install_debian() {
    printf 'Installing system packages via apt...\n'
    $SUDO apt-get update -qq
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
        age bash-completion build-essential curl git jq less poppler-utils stow unzip
}

# launchd owns the herdr server so it lives in the Aqua login session and keeps
# login-keychain access; see the plist for what breaks otherwise. Runs after
# stowing, which links the plist into ~/.config/herdr.
install_herdr_agent() {
    local target=$HOME/Library/LaunchAgents/local.herdr-server.plist
    local template=$DOTFILES_DIR/macos/herdr-server.plist.in
    local herdr shell_bin path

    # macos/ is gitignored, so a fresh clone has no template.
    if [[ ! -f "$template" ]]; then
        printf 'Skipping the herdr LaunchAgent: %s is missing.\n' "$template" >&2
        return 0
    fi

    herdr=$(command -v herdr) || {
        printf 'Skipping the herdr LaunchAgent: herdr is not on PATH.\n' >&2
        return 0
    }
    shell_bin=$(command -v bash)
    path="$HOME/.local/share/mise/shims:$HOME/.local/bin:$(dirname "$herdr"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

    printf 'Registering the herdr server LaunchAgent...\n'
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.config/herdr"
    sed -e "s|@HOME@|$HOME|g" \
        -e "s|@HERDR@|$herdr|g" \
        -e "s|@SHELL@|$shell_bin|g" \
        -e "s|@PATH@|$path|g" \
        "$template" >"$target"

    launchctl bootout "gui/$UID/local.herdr-server" 2>/dev/null || true
    launchctl bootstrap "gui/$UID" "$target"
}

# Stow refuses to replace a plain file, such as the .bashrc a new account gets
# from /etc/skel, so each one it would conflict with moves aside first. Stow 2.3
# and 2.4 word the conflict differently.
move_conflicts_aside() {
    local target backup

    while read -r target; do
        [[ -z "$target" ]] && continue
        backup="$HOME/$target.pre-dotfiles"
        [[ -e "$backup" ]] && backup="$backup.$(date +%s)"
        printf 'Moving ~/%s aside to %s\n' "$target" "$backup"
        mv "$HOME/$target" "$backup"
    done < <(stow -n -R --dotfiles -t "$HOME" -d "$DOTFILES_DIR" . 2>&1 |
        sed -n \
            -e 's/.*over existing target \(.*\) since neither a link nor a directory.*/\1/p' \
            -e 's/.*existing target is neither a link nor a directory: \(.*\)$/\1/p')
}

link_dotfiles() {
    # A real ~/.claude makes stow link its contents one by one; otherwise stow
    # links the whole folder and Claude Code writes its credentials and history
    # into this repo.
    mkdir -p "$HOME/.claude"
    move_conflicts_aside

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

    # Same rule as .bash_env, which a fresh machine has not loaded yet: a Node
    # already on PATH means mise installs none.
    if type -ap node 2>/dev/null | grep -qv '/mise/'; then
        printf 'Using the Node already on PATH; mise skips Node.\n'
        case ",${MISE_DISABLE_TOOLS:-}," in
            *,node,*) ;;
            *) export MISE_DISABLE_TOOLS="${MISE_DISABLE_TOOLS:+$MISE_DISABLE_TOOLS,}node" ;;
        esac
        export MISE_IDIOMATIC_VERSION_FILE_ENABLE_TOOLS=
    fi

    printf 'Installing runtimes and tools via mise...\n'
    "$MISE_BIN" install

    # This script is not the interactive shell, so pick up the shims by hand for
    # the npm and herdr steps below.
    export PATH="$("$MISE_BIN" bin-paths | tr '\n' ':')$PATH"
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

    if [[ $os == macos ]]; then
        install_herdr_agent
    fi

    install_runtimes
    install_agent_deps

    printf '\nAll dependencies installed.\n'
    printf 'Remaining manual step: copy the age identity to ~/.config/age/keys.txt\n'
}

main "$@"
