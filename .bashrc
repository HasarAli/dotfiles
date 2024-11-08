# ~/.bashrc: executed by bash(1) for non-login shells.
# see /usr/share/doc/bash/examples/startup-files (in the package bash-doc)
# for examples

# If not running interactively, don't do anything
case $- in
*i*) ;;
*) return ;;
esac

add_exec_permission_if_missing() {
    local file="$1"
	if [ ! -x "$file" ]; then
		echo "Adding executable permission to $file"
		chmod +x "$file"
	fi
}

# Download (and patch) bash configs
PATCHES_DIR="$HOME/.config/bash/patches"
SCRIPTS_DIR="$HOME/.config/bash/scripts"
FILENAME_TO_URL_MAP="$PATCHES_DIR/filename_to_url_map"
DOWNLOAD_SCRIPT="$SCRIPTS_DIR/download_and_patch_map.sh"

if [ -r "$FILENAME_TO_URL_MAP" ] && [ -f "$DOWNLOAD_SCRIPT" ]; then 
	(
		add_exec_permission_if_missing "$DOWNLOAD_SCRIPT"
		mkdir -p $HOME/.config/bash/patched && cd "$_" 
		# Do nothing if fails
		"$DOWNLOAD_SCRIPT" "$FILENAME_TO_URL_MAP" "$PATCHES_DIR" || true 
	)
else
	>&2 printf "Warning: Could not find bash configs to patch" 
fi

for patched_bash_configs in "$HOME/.config/bash/patched"/*; do
	if [[ -f "$patched_bash_configs" ]]; then
		source "$patched_bash_configs"
	fi
done

# make less more friendly for non-text input files, see lesspipe(1)
[ -x /usr/bin/lesspipe ] && eval "$(SHELL=/bin/sh lesspipe)"

# set variable identifying the chroot you work in (used in the prompt below)
if [ -z "${debian_chroot:-}" ] && [ -r /etc/debian_chroot ]; then
	debian_chroot=$(cat /etc/debian_chroot)
fi

# set a fancy prompt (non-color, unless we know we "want" color)
case "$TERM" in
xterm-color | *-256color) color_prompt=yes ;;
esac

# uncomment for a colored prompt, if the terminal has the capability; turned
# off by default to not distract the user: the focus in a terminal window
# should be on the output of commands, not on the prompt
force_color_prompt=yes

if [ -n "$force_color_prompt" ]; then
	if [ -x /usr/bin/tput ] && tput setaf 1 >&/dev/null; then
		# We have color support; assume it's compliant with Ecma-48
		# (ISO/IEC-6429). (Lack of such support is extremely rare, and such
		# a case would tend to support setf rather than setaf.)
		color_prompt=yes
	else
		color_prompt=
	fi
fi

if [ "$color_prompt" = yes ]; then
	PS1='${debian_chroot:+($debian_chroot)}\[\033[01;34m\]\w\[\033[33m\]$(__git_ps1 " (%s)")\[\033[00m\]\$ '
else
	PS1='\w$(__git_ps1 " (%s)")\$ '
fi
unset color_prompt force_color_prompt

# If this is an xterm set the title to user@host:dir
case "$TERM" in
xterm* | rxvt*)
	PS1="\[\e]0;${debian_chroot:+($debian_chroot)}\u@\h: \w\a\]$PS1"
	;;
*) ;;
esac

# Alias definitions.
# You may want to put all your additions into a separate file like
# ~/.bash_aliases, instead of adding them here directly.
# See /usr/share/doc/bash-doc/examples in the bash-doc package.

if [ -f ~/.bash_aliases ]; then
	. ~/.bash_aliases
fi

# enable programmable completion features (you don't need to enable
# this, if it's already enabled in /etc/bash.bashrc and /etc/profile
# sources /etc/bash.bashrc).
if ! shopt -oq posix; then
	if [ -f /usr/share/bash-completion/bash_completion ]; then
		. /usr/share/bash-completion/bash_completion
	elif [ -f /etc/bash_completion ]; then
		. /etc/bash_completion
	fi
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"                   # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" # This loads nvm bash_completion

# tmux
export XDG_CONFIG_HOME="$HOME/.config"

# Install Jetbrains Mono Nerdfont for nvim (if missing)
FONT_SCRIPT="$SCRIPTS_DIR/install_nerdfont.sh"
if [ -f "$FONT_SCRIPT" ]; then
	add_exec_permission_if_missing "$FONT_SCRIPT"
	"$FONT_SCRIPT"
fi
