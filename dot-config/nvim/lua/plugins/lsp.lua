---@module 'lazy'
---@type LazySpec
return {
  'neovim/nvim-lspconfig',
  dependencies = {
    {
      'mason-org/mason.nvim',
      ---@module 'mason.settings'
      ---@type MasonSettings
      ---@diagnostic disable-next-line: missing-fields
      opts = {},
    },
    'mason-org/mason-lspconfig.nvim',
    'WhoIsSethDaniel/mason-tool-installer.nvim',
    { 'j-hui/fidget.nvim', opts = {} },
  },
  -- Populated by language modules (lua/langs/*.lua) via opts fragments:
  -- servers is a name -> vim.lsp.Config map, tools a list of Mason packages.
  -- project_servers is like servers, but their binaries come from the project
  -- (node_modules), so Mason doesn't install them.
  opts = { servers = {}, project_servers = {}, tools = {} },
  config = function(_, opts)
    vim.api.nvim_create_autocmd('LspAttach', {
      group = vim.api.nvim_create_augroup('kickstart-lsp-attach', { clear = true }),
      callback = function(event)
        local map = function(keys, func, desc, mode)
          mode = mode or 'n'
          vim.keymap.set(mode, keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
        end

        map('grn', vim.lsp.buf.rename, '[R]e[n]ame')
        map('gra', vim.lsp.buf.code_action, '[G]oto Code [A]ction', { 'n', 'x' })
        -- WARN: grD = Declaration (e.g. C header), not Definition
        map('grD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')
        -- `only` matches by prefix, so this also picks source.fixAll.oxc / .eslint
        map('grf', function() vim.lsp.buf.code_action { context = { only = { 'source.fixAll' } }, apply = true } end, '[F]ix all')

        local client = vim.lsp.get_client_by_id(event.data.client_id)
        if client and client:supports_method('textDocument/documentHighlight', event.buf) then
          local highlight_augroup = vim.api.nvim_create_augroup('kickstart-lsp-highlight', { clear = false })
          vim.api.nvim_create_autocmd({ 'CursorHold', 'CursorHoldI' }, {
            buffer = event.buf,
            group = highlight_augroup,
            callback = vim.lsp.buf.document_highlight,
          })

          vim.api.nvim_create_autocmd({ 'CursorMoved', 'CursorMovedI' }, {
            buffer = event.buf,
            group = highlight_augroup,
            callback = vim.lsp.buf.clear_references,
          })

          vim.api.nvim_create_autocmd('LspDetach', {
            group = vim.api.nvim_create_augroup('kickstart-lsp-detach', { clear = true }),
            callback = function(event2)
              vim.lsp.buf.clear_references()
              vim.api.nvim_clear_autocmds { group = 'kickstart-lsp-highlight', buffer = event2.buf }
            end,
          })
        end

        if client and client:supports_method('textDocument/inlayHint', event.buf) then
          map('<leader>th', function() vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled { bufnr = event.buf }) end, '[T]oggle Inlay [H]ints')
        end
      end,
    })

    local ensure_installed = vim.tbl_keys(opts.servers)
    vim.list_extend(ensure_installed, opts.tools)
    require('mason-tool-installer').setup { ensure_installed = ensure_installed }

    for name, server in pairs(vim.tbl_extend('error', opts.servers, opts.project_servers)) do
      vim.lsp.config(name, server)
      vim.lsp.enable(name)
    end
  end,
}
