FROM debian:trixie

ARG DEV_UID=1000
ARG DEV_GID=1000
ARG TPM_REPO=https://github.com/tmux-plugins/tpm

ENV TERM=xterm-256color \
    COLORTERM=truecolor \
    TPM_REPO="${TPM_REPO}" \
    DOTFILES_DIR=/home/dev/dotfiles \
    DOTFILES_REPO=https://github.com/HasarAli/dotfiles.git \
    DOTFILES_REF=

# Podman/Docker VMs with skewed clocks can fail apt with "Release file is not valid yet".
RUN printf '%s\n' 'Acquire::Check-Valid-Until "false";' > /etc/apt/apt.conf.d/99no-check-valid-until

RUN set -eux; \
    groupadd -g "${DEV_GID}" dev; \
    useradd -m -u "${DEV_UID}" -g dev -s /bin/bash dev

RUN set -eux; \
    apt-get update -qq; \
    DEBIAN_FRONTEND=noninteractive apt-get install -qq -y --no-install-recommends \
        bash-completion \
        ca-certificates \
        fd-find \
        git \
        neovim \
        python3 \
        ripgrep \
        stow \
        tmux \
        tree-sitter-cli \
        unzip; \
    # fd is installed as fdfind on Debian — provide the expected alias
    ln -sf /usr/bin/fdfind /usr/local/bin/fd; \
    rm -rf /var/lib/apt/lists/*

COPY --chown=dev:dev --chmod=755 entrypoint.sh /usr/local/bin/devcontainer-entrypoint

USER dev

VOLUME /home/dev/dotfiles

WORKDIR /workspace

ENTRYPOINT ["devcontainer-entrypoint"]
CMD ["bash"]