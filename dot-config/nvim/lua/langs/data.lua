-- JSON/YAML/Markdown servers. Formatting comes from the project (conform.lua).
---@module 'lazy'
---@type LazySpec
return {
  {
    'neovim/nvim-lspconfig',
    dependencies = { 'b0o/SchemaStore.nvim' },
    opts = function(_, opts)
      local schemastore = require 'schemastore'
      opts.servers.jsonls = {
        settings = { json = { schemas = schemastore.json.schemas(), validate = { enable = true } } },
      }
      opts.servers.yamlls = {
        -- Drop lspconfig's extra yaml.docker-compose/gitlab/helm-values filetypes;
        -- nothing sets them, and they trip checkhealth's unknown-filetype warning
        filetypes = { 'yaml' },
        settings = {
          yaml = {
            -- SchemaStore.nvim's catalog replaces yamlls's own download of it
            schemaStore = { enable = false, url = '' },
            schemas = schemastore.yaml.schemas(),
          },
        },
      }
      -- Markdown: cross-file link completion, references, rename. Standalone binary.
      opts.servers.marksman = { filetypes = { 'markdown' } }
    end,
  },
}
