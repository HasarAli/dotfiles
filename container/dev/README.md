# Project devpod template

Copy these files into a new project, keeping this layout:

```text
PROJECT/
  .devcontainer/.devcontainer.json
  container/dev/
    Containerfile
    entrypoint.sh
    compose.yaml
    .containerignore
    .dockerignore
    .gitignore
    .env.example
    README.md
  ...project source...
```

## Start with rootless Podman (Debian 13)

1. Install the host packages yourself:

   ```sh
   sudo apt-get update
   sudo apt-get install podman podman-compose uidmap slirp4netns fuse-overlayfs
   podman info
   ```

   The host user needs subordinate UID/GID ranges in `/etc/subuid` and
   `/etc/subgid`. `podman info` must work without sudo before proceeding.

2. From `PROJECT/container/dev`, optionally configure the template:

   ```sh
   cp .env.example .env
   # Edit .env: DEV_UID/DEV_GID must match id -u / id -g on the host.
   # Pick unique COMPOSE_PROJECT_NAME and DEV_IMAGE values for this project.
   mkdir -p "$HOME/.ssh"
   ```

   No `.env` is required with the defaults (UID/GID 1000). The included
   `.gitignore` excludes the local `.env`; copy it with the template.
   Set a unique `COMPOSE_PROJECT_NAME` when running multiple copies: otherwise
   Compose names each stack after its `dev` directory.
   `PROJECT_DIR` defaults to that project's root, not the tooling repository.
   `DEV_PORT` changes the host port; the application listens on container port
   3000 and must bind `0.0.0.0`. Host access stays on `127.0.0.1`.

3. Build, start, and enter the non-root shell:

   ```sh
   export PODMAN_COMPOSE_PROVIDER=podman-compose
   podman compose build
   podman compose up -d
   podman compose exec --user dev dev bash
   ```

   Compose needs a provider supporting optional `env_file` entries
   (`required: false`), such as podman-compose 1.3.0 or newer.
   Upgrade the provider if it rejects that field.

4. Verify tools before working:

   ```sh
   id                         # dev, not root
   node --version
   python3 --version
   nvim --version
   pi --version
   herdr --version
   pnpm --version
   pnpm config get global-bin-dir
   command -v hound pdftotext
   touch node_modules/.permissions-check && rm node_modules/.permissions-check
   ```

   Use `pnpm` for project dependencies; npm/npx remain available for bootstrap
   and tools. Put project runtime versions in `PROJECT/mise.toml`, then run
   `mise trust` and `mise install` inside the container.

## Image and persistent data

The build context is only `container/dev`. The image copies only
`entrypoint.sh`, clones `DOTFILES_REPO`, and runs that repository's full
`install_deps.sh` as dev. System-package escalation exists only during the
build; runtime dev has no sudo. Mise supplies the dotfiles tool manifest,
including pi and herdr; the bootstrap also installs Hound and extension/plugin
dependencies. Chromium and PDF utilities support browser/web-fetch tooling.
The build downloads external packages and can take a while.

`DOTFILES_REPO` is a **build argument**, not a runtime clone override.
`DOTFILES_DIR` is fixed at `/home/dev/dotfiles`; it is not configurable.
Only use a repository you trust: its bootstrap runs during image construction.
The cloned remote revision is used, not uncommitted local dotfiles edits.

Project source is a bind mount at `/home/dev/app`, never copied into the image.
Rootless Podman's `keep-id` mapping preserves source/SSH ownership; the
entrypoint repairs only named-volume permissions before dropping to dev.
Dotfiles, project `node_modules`, and the pnpm store persist in named volumes.
Other home-directory changes are lost when the container is recreated.

To refresh the remote bootstrap and all persisted tooling, use:

```sh
podman compose down -v  # Deletes dotfiles edits, node_modules, and pnpm cache.
podman compose build --no-cache
podman compose up -d
```

## Secrets and editor access

The build excludes local `.env`, credentials, and histories. Optional API keys
in `.env` are runtime environment variables; do not commit them. The host SSH
directory is mounted read-only but container processes can still read its keys.
An age identity is not bundled; provide it separately if using encrypted secrets.
Do not store credentials in the cloned dotfiles repository.

The companion `.devcontainer/.devcontainer.json` uses the same Compose service
and workspace, with VS Code connecting as dev. Point VS Code's
`dev.containers.dockerPath` setting at `podman`; its Compose provider must support
this configuration. The `keep-id` configuration targets rootless Podman, not
Docker's user-namespace modes.

This is a Compose-based development pod, not a configuration for the separate
DevPod CLI. No host Podman installation or image build is performed by copying
this template.
