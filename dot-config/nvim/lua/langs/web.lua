-- The CSS server, and the prose, spelling and Containerfile linters a project
-- configures. A linter runs only where the project has its config.

local function find_up(bufnr, names)
  local dir = vim.fs.dirname(vim.api.nvim_buf_get_name(bufnr))
  return vim.fs.find(names, { path = dir, upward = true, type = 'file', limit = 1 })[1]
end

local function node_bin(bufnr, name)
  for dir in vim.fs.parents(vim.api.nvim_buf_get_name(bufnr)) do
    local bin = vim.fs.joinpath(dir, 'node_modules/.bin', name)
    if vim.fn.executable(bin) == 1 then return bin end
  end
end

local markdownlint_configs = {
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
}

local stylelint_configs = {
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
}

local cspell_configs = {
  'cspell.json',
  'cspell.jsonc',
  'cspell.yaml',
  'cspell.yml',
  '.cspell.json',
  '.cspell.jsonc',
  'cspell.config.js',
  'cspell.config.cjs',
  'cspell.config.mjs',
  'cspell.config.json',
  'cspell.config.yaml',
  'cspell.config.yml',
}

-- Vale also reads comments in code, as projects' `[*.{ts,css}]` sections ask
local vale_filetypes = { 'markdown', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact', 'css' }

---@module 'lazy'
---@type LazySpec
return {
  {
    'neovim/nvim-lspconfig',
    opts = function(_, opts)
      opts.servers.cssls = {}
      -- Off by default: it flags every unknown word, which is noise while writing code
      table.insert(opts.tools, 'cspell-lsp')
      vim.lsp.config('cspell_ls', {
        root_dir = function(bufnr, on_dir)
          local root = vim.fs.root(bufnr, cspell_configs)
          if root then on_dir(root) end
        end,
      })
      vim.keymap.set('n', '<leader>ts', function()
        local enable = not vim.lsp.is_enabled 'cspell_ls'
        vim.lsp.enable('cspell_ls', enable)
        vim.notify('Spell check ' .. (enable and 'on' or 'off'))
      end, { desc = '[T]oggle [S]pell check' })
    end,
  },
  {
    'mfussenegger/nvim-lint',
    opts = function(_, opts)
      local function add(ft, name) opts.linters_by_ft[ft] = vim.list_extend(opts.linters_by_ft[ft] or {}, { name }) end

      add('markdown', 'markdownlint-cli2')
      opts.linters['markdownlint-cli2'] = {
        cmd = function() return node_bin(0, 'markdownlint-cli2') end,
        -- Relative links resolve against the cwd, so run from the file's
        -- directory and point at the config. Without --no-globs, globs in the
        -- config make it lint every file they match.
        args = { '--no-globs', '--config', function() return find_up(0, markdownlint_configs) end, '-' },
        condition = function(bufnr) return node_bin(bufnr, 'markdownlint-cli2') and find_up(bufnr, markdownlint_configs) ~= nil end,
        cwd = function(bufnr) return vim.fs.dirname(vim.api.nvim_buf_get_name(bufnr)) end,
      }

      add('css', 'stylelint')
      opts.linters.stylelint = {
        cmd = function() return node_bin(0, 'stylelint') end,
        condition = function(bufnr) return node_bin(bufnr, 'stylelint') and find_up(bufnr, stylelint_configs) ~= nil end,
        -- Run from the config's directory: configs can hold paths relative to
        -- it. stylelint-lsp can't; it runs from the nearest package.json.
        cwd = function(bufnr) return vim.fs.dirname(find_up(bufnr, stylelint_configs)) end,
      }

      for _, ft in ipairs(vale_filetypes) do
        add(ft, 'vale')
      end
      opts.linters.vale = {
        -- --path, relative to .vale.ini, picks the config's per-path sections
        args = { '--no-exit', '--output', 'JSON', '--path', function() return vim.fn.expand '%:.' end },
        -- Vale keys its output by --path; nvim-lint's parser expects stdin.<ext>
        parser = function(output, bufnr)
          if vim.trim(output) == '' then return {} end
          local _, alerts = next(vim.json.decode(output))
          local key = 'stdin.' .. vim.fn.fnamemodify(vim.api.nvim_buf_get_name(bufnr), ':e')
          return require('lint.linters.vale').parser(vim.json.encode { [key] = alerts or {} }, bufnr)
        end,
        condition = function(bufnr) return vim.fn.executable 'vale' == 1 and find_up(bufnr, { '.vale.ini' }) ~= nil end,
        cwd = function(bufnr) return vim.fs.dirname(find_up(bufnr, { '.vale.ini' })) end,
      }

      add('dockerfile', 'hadolint')
      opts.linters.hadolint = {
        condition = function() return vim.fn.executable 'hadolint' == 1 end,
        -- hadolint looks for .hadolint.yaml in the cwd
        cwd = function(bufnr)
          local config = find_up(bufnr, { '.hadolint.yaml', '.hadolint.yml' })
          return config and vim.fs.dirname(config)
        end,
      }
    end,
  },
}
