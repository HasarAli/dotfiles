---@module 'lazy'
---@type LazySpec
return {
  {
    'neovim/nvim-lspconfig',
    opts = function(_, opts)
      -- basedpyright (pip-distributed pyright fork) owns types/completion/hover;
      -- ruff's built-in LSP server provides lint diagnostics and code actions.
      -- Both are pip/binary installs — this module needs no node.
      opts.servers.basedpyright = {}
      opts.servers.ruff = {}
      vim.list_extend(opts.tools, {
        'debugpy', -- debugger
      })
    end,
  },
  {
    'mfussenegger/nvim-dap',
    -- Runs as an opts fragment right before the base dap config; registers
    -- the adapter as a side effect and leaves opts untouched.
    opts = function()
      local dap = require 'dap'

      -- Python adapter (debugpy installed via Mason)
      dap.adapters.python = {
        type = 'executable',
        command = vim.fn.stdpath 'data' .. '/mason/packages/debugpy/venv/bin/python',
        args = { '-m', 'debugpy.adapter' },
      }

      dap.configurations.python = {
        {
          type = 'python',
          request = 'launch',
          name = 'Launch file',
          program = '${file}',
          pythonPath = function()
            local venv = os.getenv 'VIRTUAL_ENV'
            if venv then return venv .. '/bin/python' end
            -- exepath returns '' (not nil) when not found, so 'or' won't fall back
            local py = vim.fn.exepath 'python3'
            return py ~= '' and py or 'python3'
          end,
        },
      }
    end,
  },
}
