---@module 'lazy'
---@type LazySpec
return {
  'delphinus/md-render.nvim',
  version = '*',
  ft = { 'markdown' },
  init = function()
    vim.api.nvim_create_autocmd('BufWinEnter', {
      callback = function(args)
        if vim.bo[args.buf].filetype ~= 'markdown' then return end
        -- Swapping to the render view inside the event is undone by the rest of the file load.
        vim.schedule(function()
          if vim.api.nvim_get_current_buf() ~= args.buf then return end
          local state = vim.w.md_render_state
          -- The window already tracks this file: md-render itself swapped back to source (Insert mode).
          if state and state.source_buf == args.buf then return end
          -- A different file's state left behind by :edit makes md-render act on that file instead.
          vim.w.md_render_state = nil
          vim.cmd(vim.b[args.buf].md_render_auto and 'silent! MdRender toggle' or 'silent! MdRender auto on')
        end)
      end,
    })
  end,
  keys = {
    { '<leader>mp', '<Plug>(md-render-preview)', desc = 'Markdown Preview (split)' },
    { '<leader>mt', '<Plug>(md-render-preview-tab)', desc = 'Markdown Preview (tab)' },
  },
}
