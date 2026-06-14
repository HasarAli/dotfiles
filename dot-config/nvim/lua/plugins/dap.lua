---@module 'lazy'
---@type LazySpec
return {
  {
    'mfussenegger/nvim-dap',
    dependencies = { 'igorlfs/nvim-dap-view' },
    keys = {
      { '<F5>', function() require('dap').continue() end, desc = 'Debug: Continue' },
      { '<F10>', function() require('dap').step_over() end, desc = 'Debug: Step Over' },
      { '<F11>', function() require('dap').step_into() end, desc = 'Debug: Step Into' },
      { '<F12>', function() require('dap').step_out() end, desc = 'Debug: Step Out' },
      { '<leader>db', function() require('dap').toggle_breakpoint() end, desc = '[D]ebug: Toggle [B]reakpoint' },
      { '<leader>dB', function() require('dap').set_breakpoint(vim.fn.input 'Breakpoint condition: ') end, desc = '[D]ebug: Conditional [B]reakpoint' },
      { '<leader>dc', function() require('dap').run_to_cursor() end, desc = '[D]ebug: Run to [C]ursor' },
      { '<leader>dr', function() require('dap').repl.open() end, desc = '[D]ebug: Open [R]EPL' },
      { '<leader>dv', function() require('dap-view').toggle() end, desc = '[D]ebug: Toggle [V]iew' },
    },
    config = function()
      local dap = require 'dap'
      local dapview = require 'dap-view'

      dapview.setup()

      dap.listeners.after.event_initialized['dap-view'] = function() dapview.open() end
      dap.listeners.before.event_terminated['dap-view'] = function() dapview.close() end
      dap.listeners.before.event_exited['dap-view'] = function() dapview.close() end

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
