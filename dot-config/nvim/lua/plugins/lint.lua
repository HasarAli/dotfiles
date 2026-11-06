---@module 'lazy'
---@type LazySpec
return {
  'mfussenegger/nvim-lint',
  event = { 'BufReadPre', 'BufNewFile' },
  -- Populated by language modules (lua/langs/*.lua) via opts fragments.
  -- linters maps a linter name to overrides of its nvim-lint definition, plus:
  --   condition = fun(bufnr): boolean  -- lint only where this holds (e.g. the project has a config)
  --   cwd = fun(bufnr): string?        -- directory to run the linter from
  opts = { linters_by_ft = {}, linters = {} },
  config = function(_, opts)
    local lint = require 'lint'
    lint.linters_by_ft = opts.linters_by_ft

    for name, spec in pairs(opts.linters) do
      local overrides = vim.deepcopy(spec)
      overrides.condition, overrides.cwd = nil, nil
      local base = lint.linters[name]
      lint.linters[name] = type(base) == 'function' and function() return vim.tbl_extend('force', base(), overrides) end
        or vim.tbl_extend('force', base, overrides)
    end

    local lint_augroup = vim.api.nvim_create_augroup('lint', { clear = true })
    vim.api.nvim_create_autocmd({ 'BufEnter', 'BufWritePost', 'InsertLeave' }, {
      group = lint_augroup,
      callback = function(event)
        if not vim.bo[event.buf].modifiable then return end
        for _, name in ipairs(lint.linters_by_ft[vim.bo[event.buf].filetype] or {}) do
          local spec = opts.linters[name] or {}
          if not spec.condition or spec.condition(event.buf) then lint.try_lint(name, { cwd = spec.cwd and spec.cwd(event.buf) }) end
        end
      end,
    })
  end,
}
