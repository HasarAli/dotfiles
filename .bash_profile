# added for tmux
export XDG_CONFIG_HOME="$HOME/.config"

# added for Node version manager
export NVM_DIR="$HOME/.nvm"

# if running bash
if [ -n "$BASH_VERSION" ] && [ -f "$HOME/.bashrc" ]; then
	# patch bash configs and utilities
    patches_dir="$HOME/.config/bash/patches"
    scripts_dir="$HOME/.config/bash/scripts"
    filename_to_url_map="$patches_dir/filename_to_url_map"
    download_script="$scripts_dir/download_and_patch_map.sh"
    prompt_user_for_permission="$scripts_dir/prompt_user_for_permission.sh"
    if [ -r "$filename_to_url_map" ] && [ -f "$download_script" ]; then 
        (
            if [ ! -x "$prompt_user_for_permission" ]; then
                chmod +x "$prompt_user_for_permission"
            fi

            if [ ! -x download_script ]; then 
                "$prompt_user_for_permission" "$download_script" 
            fi;

            mkdir -p $HOME/.config/bash/patched && cd "$_" 
            # do nothing if fails
            "$download_script" "$filename_to_url_map" "$patches_dir" || true 
        )
    else
        >&2 printf "Warning: Could not find bash configs to patch" 
    fi

    # include .bashrc if it exists
    . "$HOME/.bashrc"
fi

# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/bin" ]; then
    PATH="$HOME/bin:$PATH"
fi

# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/.local/bin" ]; then
    PATH="$HOME/.local/bin:$PATH"
fi
