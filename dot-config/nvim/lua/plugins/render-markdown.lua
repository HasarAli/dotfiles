---@module 'lazy'
---@type LazySpec
return {
  'MeanderingProgrammer/render-markdown.nvim',
  version = '*',
  ft = { 'markdown' },
  dependencies = { 'nvim-mini/mini.nvim' },
  config = function()
    local query = vim.treesitter.query.parse(
      'markdown',
      '(fenced_code_block (info_string (language) @lang) (code_fence_content) @content (#eq? @lang "mermaid"))'
    )
    local cache = {} ---@type table<string, render.md.mark.Line[]>

    ---@return render.md.mark.Line[]
    local function draw(src)
      if not cache[src] then
        local out = vim.system({ 'mermaid-ascii', '-f', '-' }, { stdin = src, text = true }):wait()
        if out.code == 0 then
          cache[src] = vim.tbl_map(function(l) return { { l, 'RenderMarkdownCode' } } end, vim.split(out.stdout, '\n', { trimempty = true }))
        else
          local msg = out.stderr:match 'msg="(.-)"' or vim.trim(out.stderr)
          cache[src] = { { { 'mermaid-ascii: ' .. msg, 'DiagnosticWarn' } } }
        end
      end
      return cache[src]
    end

    -- Draws each mermaid block as text below its closing fence; images would need mmdc and Chromium.
    ---@param ctx render.md.handler.Context
    ---@return render.md.Mark[]
    local function mermaid(ctx)
      if vim.fn.executable 'mermaid-ascii' == 0 then return {} end
      local marks = {} ---@type render.md.Mark[]
      for _, match in query:iter_matches(ctx.root, ctx.buf) do
        local nodes = {}
        for id, captured in pairs(match) do
          nodes[query.captures[id]] = captured[1]
        end
        -- Anchored to the last source line: the closing fence is concealed, and its virt_lines with it.
        local _, _, end_row, end_col = nodes.content:range()
        local last_row = end_col == 0 and end_row - 1 or end_row
        marks[#marks + 1] = {
          conceal = false,
          start_row = last_row,
          start_col = 0,
          opts = { virt_lines = draw(vim.treesitter.get_node_text(nodes.content, ctx.buf)) },
        }
      end
      return marks
    end

    require('render-markdown').setup {
      custom_handlers = { markdown = { extends = true, parse = mermaid } },
    }
  end,
  keys = {
    -- Global so every markdown buffer, including ones opened later, follows the same state.
    { '<leader>mr', '<cmd>RenderMarkdown toggle<cr>', desc = '[R]aw/render toggle' },
    { '<leader>ms', '<cmd>RenderMarkdown preview<cr>', desc = '[S]ide-by-side source and render' },
  },
}
