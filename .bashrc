# if not running interactively, don't do anything
case $- in
*i*) ;;
*) return ;;
esac

# source patched configs
for patched_bash_config in "$HOME/.config/bash/patched"/*; do
	if [[ -f "$patched_bash_config" ]]; then
		source "$patched_bash_config"
	fi
done

# make less more friendly for non-text input files, see lesspipe(1)
[ -x /usr/bin/lesspipe ] && eval "$(SHELL=/bin/sh lesspipe)"

# set variable identifying the chroot you work in (used in the prompt below)
if [ -z "${debian_chroot:-}" ] && [ -r /etc/debian_chroot ]; then
	debian_chroot=$(cat /etc/debian_chroot)
fi

# enable color prompt if terminal supports it
if [ -x /usr/bin/tput ] && tput setaf 1 >&/dev/null; then
	PS1='${debian_chroot:+($debian_chroot)}\[\033[01;34m\]\w\[\033[33m\]$(__git_ps1 " (%s)")\[\033[00m\]\$ '
else
	PS1='\w$(__git_ps1 " (%s)")\$ '
fi

# if this is an xterm set the title to user@host
case "$TERM" in
xterm* | rxvt*)
	PS1="\[\e]0;${debian_chroot:+($debian_chroot)}\u@\h\a\]$PS1"
	;;
*) ;;
esac

# alias definitions
if [ -f ~/.bash_aliases ]; then
	. ~/.bash_aliases
fi

# enable programmable completion features
if ! shopt -oq posix; then
	if [ -f /usr/share/bash-completion/bash_completion ]; then
		. /usr/share/bash-completion/bash_completion
	elif [ -f /etc/bash_completion ]; then
		. /etc/bash_completion
	fi
fi

# setup node version manager
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && source "$NVM_DIR/bash_completion"

# open tmux if not already in a tmux session
if command -v tmux &> /dev/null &&  
	[[ ! "$TERM" =~ screen ]] && 
	[[ ! "$TERM" =~ tmux ]] && 
	[ -z "$TMUX" ] 
then
  exec tmux
fi
