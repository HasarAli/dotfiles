---@module 'lazy'
---@type LazySpec
return {
  'nvim-mini/mini.nvim',
  config = function()
    -- va) yinq ci'
    require('mini.ai').setup { n_lines = 500 }
    -- saiw) sd' sr)'
    require('mini.surround').setup()
    require('mini.pairs').setup()

    require('mini.files').setup()
    vim.keymap.set('n', '\\', function()
      if MiniFiles.close() then return end
      local file = vim.api.nvim_buf_get_name(0)
      MiniFiles.open(vim.uv.fs_stat(file) and file or nil)
    end, { desc = 'File explorer' })

    local statusline = require 'mini.statusline'
    statusline.setup { use_icons = vim.g.have_nerd_font }
    ---@diagnostic disable-next-line: duplicate-set-field
    statusline.section_location = function() return '%2l:%-2v' end
  end,
}
