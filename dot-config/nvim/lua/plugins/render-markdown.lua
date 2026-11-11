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
    local function draw(src, width)
      local key = width .. '\0' .. src
      if not cache[key] then
        -- --max-width only tightens node spacing; a graph that still doesn't fit renders anyway.
        local cmd = { 'mermaid-ascii', '--max-width', tostring(width), '-f', '-' }
        local out = vim.system(cmd, { stdin = src, text = true }):wait()
        if out.code == 0 then
          cache[key] = vim.tbl_map(function(l) return { { l, 'RenderMarkdownCode' } } end, vim.split(out.stdout, '\n', { trimempty = true }))
        else
          local msg = out.stderr:match 'msg="(.-)"' or vim.trim(out.stderr)
          cache[key] = { { { 'mermaid-ascii: ' .. msg, 'DiagnosticWarn' } } }
        end
      end
      return cache[key]
    end

    -- First column of win's colorcolumn, which may be empty, a list ("80,120") or relative to textwidth ("+1").
    ---@return integer?
    local function colorcolumn(win)
      local first = vim.wo[win].colorcolumn:match '^[^,]+'
      if not first then return nil end
      if first:match '^[+-]' then
        local tw = vim.bo[vim.api.nvim_win_get_buf(win)].textwidth
        return tw > 0 and tw + tonumber(first) or nil
      end
      return tonumber(first)
    end

    -- Draws each mermaid block as text below its closing fence; images would need mmdc and Chromium.
    ---@param ctx render.md.handler.Context
    ---@return render.md.Mark[]
    local function mermaid(ctx)
      if vim.fn.executable 'mermaid-ascii' == 0 then return {} end
      local win = vim.fn.bufwinid(ctx.buf)
      local info = vim.fn.getwininfo(win)[1]
      local width = info and info.width - info.textoff or vim.o.columns
      -- Stops short of the colorcolumn, like prose does.
      local cc = info and colorcolumn(win)
      if cc then width = math.min(width, cc - 1) end
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
          opts = { virt_lines = draw(vim.treesitter.get_node_text(nodes.content, ctx.buf), width) },
        }
      end
      return marks
    end

    require('render-markdown').setup {
      -- Stay rendered while editing and selecting; anti-conceal still shows the cursor line raw.
      render_modes = true,
      custom_handlers = { markdown = { extends = true, parse = mermaid } },
    }
  end,
  keys = {
    -- Global so every markdown buffer, including ones opened later, follows the same state.
    { '<leader>mr', '<cmd>RenderMarkdown toggle<cr>', desc = '[R]aw/render toggle' },
    { '<leader>ms', '<cmd>RenderMarkdown preview<cr>', desc = '[S]ide-by-side source and render' },
  },
}
