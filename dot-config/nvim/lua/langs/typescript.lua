---@module 'lazy'
---@type LazySpec
return {
  {
    'neovim/nvim-lspconfig',
    opts = function(_, opts)
      opts.servers.ts_ls = {}
      -- Lint only; prettier (via conform) owns formatting, so don't let eslint
      -- advertise a formatter that could fight it. For diagnostic-level conflicts,
      -- the project should pull in eslint-config-prettier.
      opts.servers.eslint = { settings = { format = false } }
      vim.list_extend(opts.tools, {
        'prettier', -- js/ts/json/yaml/css/md formatter
        'js-debug-adapter', -- js/ts/react (browser) debugger
      })
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
