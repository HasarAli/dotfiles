scripts_dir="$HOME/.config/bash/scripts"

# make sure scripts are executable
prompt_user_for_permission="$scripts_dir/prompt_user_for_permission.sh"
if [ -d "$scripts_dir" ]; then
    if [! -x "$prompt_user_for_permission"]; then
        chmod +x "$prompt_user_for_permission"
    fi
	local script
    for script in "$scripts_dir"/*; do
        if [ -f "$script" ] && [ ! -x "$script" ]; then
			prompt_user_for_permission "$script"
        fi
    done
fi

# install Jetbrains Mono Nerdfont for nvim (if missing)
font_script="$scripts_dir/install_nerdfont.sh"
if [ -f "$font_script" ]; then "$font_script"; fi


# install tmux, nvim and its dependencies
"$scripts_dir/install_apt_packages.sh"  tmux make gcc ripgrep unzip git
"$scripts_dir/install_github_package.sh" nvim neovim neovim nvim-linux64.tar.gz
