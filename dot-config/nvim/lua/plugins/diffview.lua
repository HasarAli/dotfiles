---@module 'lazy'
---@type LazySpec
return {
  'sindrets/diffview.nvim',
  cmd = { 'DiffviewOpen', 'DiffviewFileHistory' },
  keys = {
    { '<leader>gd', '<cmd>DiffviewOpen<cr>', desc = 'git [d]iff view' },
    { '<leader>gh', '<cmd>DiffviewFileHistory %<cr>', desc = 'git file [h]istory' },
    { '<leader>gH', '<cmd>DiffviewFileHistory<cr>', desc = 'git repo [H]istory' },
  },
  opts = {},
}
