---@module 'lazy'
---@type LazySpec
return {
  'romus204/tree-sitter-manager.nvim',
  lazy = false,
  config = function()
    -- No standalone jsonc parser; the json parser handles it
    vim.treesitter.language.register('json', 'jsonc')

    require('tree-sitter-manager').setup {
      -- Core parsers installed at startup; language parsers (python, typescript,
      -- html, css, ...) are pulled in on demand via auto_install instead.
      ensure_installed = {
        'bash',
        'c',
        'diff',
        'lua',
        'luadoc',
        'markdown',
        'markdown_inline',
        'query',
        'vim',
        'vimdoc',
        'json',
        'yaml',
      },
      auto_install = true, -- install a parser the first time its filetype is opened
      highlight = true, -- enable treesitter highlighting (vim.treesitter.start)
    }
  end,
}
