---@module 'lazy'
---@type LazySpec
return {
  'delphinus/md-render.nvim',
  version = '*',
  ft = { 'markdown' },
  keys = {
    { '<leader>mp', '<Plug>(md-render-preview)', desc = 'Markdown Preview (split)' },
    { '<leader>mt', '<Plug>(md-render-preview-tab)', desc = 'Markdown Preview (tab)' },
  },
}
