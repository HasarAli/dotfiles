-- Vite+ projects format through the vp_fmt language server (lua/langs/typescript.lua);
-- other projects use prettier, but only where they configure it.
local function uses_vite_plus(bufnr) return #vim.lsp.get_clients { bufnr = bufnr, name = 'vp_fmt' } > 0 end

-- Other attached servers (tsc, jsonls, cssls, ...) can format too; only oxfmt
-- matches what `vp check` expects.
local function lsp_filter(bufnr)
  return function(client) return client.name == 'vp_fmt' or not uses_vite_plus(bufnr) end
end

-- The formatter, then fixers that run after it, as the projects' pre-commit hooks do.
local function web(...)
  local fixers = { ... }
  return function(bufnr)
    if uses_vite_plus(bufnr) then return vim.list_extend({ lsp_format = 'first' }, fixers) end
    return vim.list_extend({ 'prettier' }, fixers)
  end
end

---@module 'lazy'
---@type LazySpec
return {
  'stevearc/conform.nvim',
  event = { 'BufWritePre' },
  cmd = { 'ConformInfo' },
  keys = {
    {
      '<leader>f',
      function()
        local bufnr = vim.api.nvim_get_current_buf()
        require('conform').format { async = true, filter = lsp_filter(bufnr) }
      end,
      mode = '',
      desc = '[F]ormat buffer',
    },
  },
  ---@module 'conform'
  ---@type conform.setupOpts
  opts = function()
    local util = require 'conform.util'
    return {
      notify_on_error = false,
      -- Defaults only fill what formatters_by_ft leaves unset, so a filetype's
      -- lsp_format = 'first' still wins; passing lsp_format to format() would not.
      default_format_opts = { lsp_format = 'fallback' },
      format_on_save = function(bufnr)
        -- Skip format-on-save for filetypes lacking a standardized style
        local disable_filetypes = { c = true, cpp = true }
        if disable_filetypes[vim.bo[bufnr].filetype] then
          return nil
        else
          return {
            timeout_ms = 3000,
            filter = lsp_filter(bufnr),
          }
        end
      end,
      -- No formatter args here: ruff/prettier/stylua read project config from the
      -- file's tree, falling back to user-level config (~/.config/ruff/ruff.toml)
      -- for one-off scripts. Editor flags would override project settings.
      -- The node tools come from the project's node_modules and only run where
      -- the project has their config (require_cwd).
      formatters = {
        prettier = { require_cwd = true },
        -- Run from the config's directory: configs can hold paths relative to it
        stylelint = {
          cwd = util.root_file {
            '.stylelintrc',
            '.stylelintrc.json',
            '.stylelintrc.yaml',
            '.stylelintrc.yml',
            '.stylelintrc.js',
            '.stylelintrc.cjs',
            '.stylelintrc.mjs',
            'stylelint.config.js',
            'stylelint.config.cjs',
            'stylelint.config.mjs',
          },
          require_cwd = true,
        },
        ['markdownlint-cli2'] = {
          command = util.from_node_modules 'markdownlint-cli2',
          -- Without --no-globs, globs in the project's config make it fix every file they match
          args = { '--no-globs', '--fix', '$FILENAME' },
          cwd = util.root_file {
            '.markdownlint-cli2.jsonc',
            '.markdownlint-cli2.yaml',
            '.markdownlint-cli2.cjs',
            '.markdownlint-cli2.mjs',
            '.markdownlint.jsonc',
            '.markdownlint.json',
            '.markdownlint.yaml',
            '.markdownlint.yml',
            '.markdownlint.cjs',
            '.markdownlint.mjs',
          },
          require_cwd = true,
        },
      },
      formatters_by_ft = {
        lua = { 'stylua' },
        python = { 'ruff_format' },
        javascript = web(),
        javascriptreact = web(),
        typescript = web(),
        typescriptreact = web(),
        json = web(),
        jsonc = web(),
        yaml = web(),
        html = web(),
        css = web 'stylelint',
        markdown = web 'markdownlint-cli2',
      },
    }
  end,
}
