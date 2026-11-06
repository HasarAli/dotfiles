---@module 'lazy'
---@type LazySpec
return {
  'romus204/tree-sitter-manager.nvim',
  lazy = false,
  config = function()
    -- No standalone jsonc parser; the json parser handles it
    vim.treesitter.language.register('json', 'jsonc')

    require('tree-sitter-manager').setup {
      -- Installed at startup: core parsers, TypeScript and Dockerfile (so a first
      -- open doesn't stall on a build), and parsers other files inject (jsdoc,
      -- css/html/sql in template strings), which auto_install never fetches.
      -- Other languages install on demand via auto_install.
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
        'typescript',
        'tsx',
        'jsdoc',
        'css',
        'html',
        'sql',
        'dockerfile',
      },
      auto_install = true, -- install a parser the first time its filetype is opened
      highlight = true, -- enable treesitter highlighting (vim.treesitter.start)
    }
  end,
}
