---@module 'lazy'
---@type LazySpec
return {
  'stevearc/conform.nvim',
  event = { 'BufWritePre' },
  cmd = { 'ConformInfo' },
  keys = {
    {
      '<leader>f',
      function() require('conform').format { async = true, lsp_format = 'fallback' } end,
      mode = '',
      desc = '[F]ormat buffer',
    },
  },
  ---@module 'conform'
  ---@type conform.setupOpts
  opts = {
    notify_on_error = false,
    format_on_save = function(bufnr)
      -- Skip format-on-save for filetypes lacking a standardized style
      local disable_filetypes = { c = true, cpp = true }
      if disable_filetypes[vim.bo[bufnr].filetype] then
        return nil
      else
        return {
          timeout_ms = 500,
          lsp_format = 'fallback',
        }
      end
    end,
    -- No formatter args here: ruff/prettier/stylua read project config from the
    -- file's tree, falling back to user-level config (~/.config/ruff/ruff.toml)
    -- for one-off scripts. Editor flags would override project settings.
    formatters = {
      -- Only run biome in projects that adopted it (biome.json[c] up the tree);
      -- everything else falls through to prettier. The binary comes from the
      -- project's node_modules, so no Mason install is needed.
      biome = { require_cwd = true },
    },
    formatters_by_ft = {
      lua = { 'stylua' },
      python = { 'ruff_format' },
      javascript = { 'biome', 'prettier', stop_after_first = true },
      javascriptreact = { 'biome', 'prettier', stop_after_first = true },
      typescript = { 'biome', 'prettier', stop_after_first = true },
      typescriptreact = { 'biome', 'prettier', stop_after_first = true },
      json = { 'biome', 'prettier', stop_after_first = true },
      jsonc = { 'biome', 'prettier', stop_after_first = true },
      yaml = { 'prettier' },
      css = { 'biome', 'prettier', stop_after_first = true },
      html = { 'prettier' },
      markdown = { 'prettier' },
    },
  },
}
