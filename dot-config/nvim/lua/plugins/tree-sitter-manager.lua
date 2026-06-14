---@module 'lazy'
---@type LazySpec
return {
  'romus204/tree-sitter-manager.nvim',
  lazy = false,
  config = function()
    -- No standalone jsonc parser; the json parser handles it
    vim.treesitter.language.register('json', 'jsonc')

    require('tree-sitter-manager').setup {
      -- Installed at startup; missing ones are also pulled in on demand via auto_install
      ensure_installed = {
        'bash',
        'c',
        'diff',
        'html',
        'lua',
        'luadoc',
        'markdown',
        'markdown_inline',
        'query',
        'vim',
        'vimdoc',
        'python',
        'typescript',
        'tsx',
        'javascript',
        'json',
        'yaml',
        'css',
      },
      auto_install = true, -- install a parser the first time its filetype is opened
      highlight = true, -- enable treesitter highlighting (vim.treesitter.start)
    }
  end,
}
