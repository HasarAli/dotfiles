-- JSON/YAML/Markdown servers plus prettier for the config-file formats (json/yaml/md/css).
---@module 'lazy'
---@type LazySpec
return {
  {
    'neovim/nvim-lspconfig',
    opts = function(_, opts)
      opts.servers.jsonls = {}
      -- Drop lspconfig's extra yaml.docker-compose/gitlab/helm-values filetypes;
      -- nothing sets them, and they trip checkhealth's unknown-filetype warning
      opts.servers.yamlls = { filetypes = { 'yaml' } }
      -- Markdown: cross-file link completion, references, rename. Standalone binary.
      opts.servers.marksman = {}
      vim.list_extend(opts.tools, {
        'prettier', -- js/ts/json/yaml/css/md formatter
      })
    end,
  },
}
