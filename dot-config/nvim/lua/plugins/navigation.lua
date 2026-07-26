-- herdr-splits.nvim — Neovim side
--
-- Seamless Ctrl+hjkl navigation and Alt+hjkl resizing between Neovim splits
-- and Herdr panes. Replaces vim-herdr-navigation.
--
-- Herdr side: herdr plugin install lmilojevicc/herdr-splits.nvim
-- Alacritty:   option_as_alt = "Both" in alacritty.toml

return {
  'lmilojevicc/herdr-splits.nvim',
  cond = vim.env.HERDR_ENV == '1',
  event = 'VeryLazy',
  config = function()
    require('herdr-splits').setup({
      nav_keys    = { left = '<C-h>', down = '<C-j>', up = '<C-k>', right = '<C-l>' },
      resize_keys = { left = '<M-h>', down = '<M-j>', up = '<M-k>', right = '<M-l>' },
    })
  end,
  keys = {
    { '<C-h>', function() require('herdr-splits').move_cursor_left() end,  desc = 'Navigate left' },
    { '<C-j>', function() require('herdr-splits').move_cursor_down() end,  desc = 'Navigate down' },
    { '<C-k>', function() require('herdr-splits').move_cursor_up() end,    desc = 'Navigate up' },
    { '<C-l>', function() require('herdr-splits').move_cursor_right() end, desc = 'Navigate right' },
    { '<M-h>', function() require('herdr-splits').resize_left() end,  desc = 'Resize left' },
    { '<M-j>', function() require('herdr-splits').resize_down() end,  desc = 'Resize down' },
    { '<M-k>', function() require('herdr-splits').resize_up() end,    desc = 'Resize up' },
    { '<M-l>', function() require('herdr-splits').resize_right() end, desc = 'Resize right' },
  },
}
