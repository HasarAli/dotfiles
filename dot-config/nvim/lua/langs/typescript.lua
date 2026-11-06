-- Prefers the project's own tooling from node_modules: tsgo (Effect-patched
-- when the project has @effect/tsgo) and Vite+'s oxlint/oxfmt servers.
-- Projects on TypeScript < 7 get ts_ls instead; eslint attaches only where
-- the project has an eslint config.
local js_filetypes = { 'javascript', 'javascriptreact', 'typescript', 'typescriptreact' }

local function project_root(buf)
  local lockfiles = { 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock' }
  return vim.fs.root(buf, { lockfiles, { '.git' } })
end

local function project_bin(root, name)
  local path = vim.fs.joinpath(root, 'node_modules/.bin', name)
  return vim.fn.executable(path) == 1 and path or nil
end

---@return string[]? cmd nil when the project's TypeScript predates the native (Go) compiler
local function tsgo_cmd(root)
  local effect = project_bin(root, 'effect-tsgo')
  if effect then return { effect, 'tsc', '--lsp', '--stdio' } end
  local tsgo = project_bin(root, 'tsgo')
  if tsgo then return { tsgo, '--lsp', '--stdio' } end
  local ok, lines = pcall(vim.fn.readfile, vim.fs.joinpath(root, 'node_modules/typescript/package.json'))
  local version = ok and vim.json.decode(table.concat(lines, '\n')).version or ''
  if (tonumber(version:match '^(%d+)') or 0) >= 7 then return { project_bin(root, 'tsc'), '--lsp', '--stdio' } end
end

---@param subcommand 'lint'|'fmt'
---@return vim.lsp.Config
local function vite_plus_server(subcommand, filetypes)
  return {
    filetypes = filetypes,
    root_dir = function(buf, on_dir)
      local root = project_root(buf)
      if root and project_bin(root, 'vp') then on_dir(root) end
    end,
    cmd = function(dispatchers, config)
      return vim.lsp.rpc.start({ project_bin(config.root_dir, 'vp'), subcommand, '--lsp' }, dispatchers, { cwd = config.root_dir })
    end,
  }
end

---@module 'lazy'
---@type LazySpec
return {
  {
    'neovim/nvim-lspconfig',
    opts = function(_, opts)
      opts.project_servers.tsc = {
        filetypes = js_filetypes,
        root_dir = function(buf, on_dir)
          local root = project_root(buf)
          if root and tsgo_cmd(root) then on_dir(root) end
        end,
        cmd = function(dispatchers, config) return vim.lsp.rpc.start(tsgo_cmd(config.root_dir), dispatchers, { cwd = config.root_dir }) end,
        -- vp_lint/vp_fmt use UTF-16; one encoding per buffer keeps their edits in line
        capabilities = { general = { positionEncodings = { 'utf-16' } } },
      }
      opts.servers.ts_ls = {
        root_dir = function(buf, on_dir)
          local root = project_root(buf) or vim.fn.getcwd()
          if not tsgo_cmd(root) then on_dir(root) end
        end,
      }
      opts.project_servers.vp_lint = vite_plus_server('lint', js_filetypes)
      opts.project_servers.vp_fmt = vite_plus_server('fmt', {
        'javascript',
        'javascriptreact',
        'typescript',
        'typescriptreact',
        'json',
        'jsonc',
        'yaml',
        'toml',
        'markdown',
        'css',
        'html',
      })
      -- Lint only; prettier (via conform) owns formatting where a project uses it
      opts.servers.eslint = { settings = { format = false } }
      vim.list_extend(opts.tools, {
        'js-debug-adapter', -- js/ts/react (browser) debugger
      })
    end,
  },
  {
    'nvim-neotest/neotest',
    dependencies = { 'nvim-neotest/nvim-nio', 'nvim-lua/plenary.nvim', 'marilari88/neotest-vitest' },
    keys = {
      { '<leader>Tt', function() require('neotest').run.run() end, desc = '[T]est nearest' },
      { '<leader>Tf', function() require('neotest').run.run(vim.fn.expand '%') end, desc = '[T]est [F]ile' },
      { '<leader>Tl', function() require('neotest').run.run_last() end, desc = '[T]est [L]ast' },
      { '<leader>Tw', function() require('neotest').watch.toggle(vim.fn.expand '%') end, desc = '[T]est [W]atch file' },
      { '<leader>Tx', function() require('neotest').run.stop() end, desc = '[T]est stop' },
      { '<leader>Ts', function() require('neotest').summary.toggle() end, desc = '[T]est [S]ummary' },
      { '<leader>To', function() require('neotest').output.open { enter = true } end, desc = '[T]est [O]utput' },
    },
    opts = function()
      local function bin(path, name)
        local root = project_root(path)
        return root and project_bin(root, name)
      end
      local vitest = require 'neotest-vitest' {
        -- Vite+ bundles vitest without a bin of its own
        vitestCommand = function(path)
          local vp = bin(path, 'vp')
          return vp and vp .. ' test' or bin(path, 'vitest') or 'vitest'
        end,
      }
      -- The adapter only claims files where package.json lists vitest, which a
      -- Vite+ project doesn't
      vitest.is_test_file = function(path)
        local name = vim.fs.basename(path)
        local is_test = name:match '%.test%.[cm]?[jt]sx?$' or name:match '%.spec%.[cm]?[jt]sx?$' or path:match '/__tests__/'
        return is_test ~= nil and (bin(path, 'vp') or bin(path, 'vitest')) ~= nil
      end
      -- neotest parses test files in a child nvim started with -u NONE, which
      -- lacks the typescriptreact -> tsx parser mapping; parse in this one,
      -- as neotest itself does when the child fails
      local treesitter = require('neotest.lib').treesitter
      treesitter.parse_positions = treesitter._parse_positions
      return { adapters = { vitest } }
    end,
  },
  {
    'mfussenegger/nvim-dap',
    -- Runs as an opts fragment right before the base dap config; registers
    -- the adapter as a side effect and leaves opts untouched.
    opts = function()
      local dap = require 'dap'

      -- Browser/React adapter (js-debug-adapter installed via Mason).
      -- The single js-debug server backs every pwa-* session type.
      dap.adapters['pwa-chrome'] = {
        type = 'server',
        host = 'localhost',
        port = '${port}',
        executable = {
          command = vim.fn.stdpath 'data' .. '/mason/bin/js-debug-adapter',
          args = { '${port}' },
        },
      }

      for _, ft in ipairs { 'javascript', 'javascriptreact', 'typescript', 'typescriptreact' } do
        dap.configurations[ft] = {
          {
            type = 'pwa-chrome',
            request = 'launch',
            name = 'Launch Chrome against dev server',
            -- Prompt for the URL; default covers CRA/Next (3000). Vite is 5173.
            url = function() return vim.fn.input('Dev server URL: ', 'http://localhost:3000') end,
            webRoot = '${workspaceFolder}',
            sourceMaps = true,
          },
          {
            type = 'pwa-chrome',
            request = 'attach',
            name = 'Attach to Chrome (--remote-debugging-port=9222)',
            port = 9222,
            webRoot = '${workspaceFolder}',
            sourceMaps = true,
          },
        }
      end
    end,
  },
}
