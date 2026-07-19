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
    end,
  },
}
