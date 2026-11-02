local function git(dir, args)
  local result = vim.system(vim.list_extend({ 'git', '-C', dir }, args), { text = true }):wait()
  if result.code ~= 0 then return nil end
  return vim.trim(result.stdout)
end

-- Same lookup order as diffview: the current file's repo, then the cwd's.
local function find_toplevel()
  local dirs = {}
  local file = vim.api.nvim_buf_get_name(0)
  if vim.bo.buftype == '' and file ~= '' then table.insert(dirs, vim.fs.dirname(file)) end
  table.insert(dirs, vim.fn.getcwd())
  for _, dir in ipairs(dirs) do
    if vim.fn.isdirectory(dir) == 1 then
      local toplevel = git(dir, { 'rev-parse', '--show-toplevel' })
      if toplevel then return toplevel end
    end
  end
end

local function find_default_branch(toplevel)
  local refs = {}
  local origin_head = git(toplevel, { 'symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD' })
  if origin_head then table.insert(refs, origin_head) end
  vim.list_extend(refs, { 'refs/remotes/origin/main', 'refs/remotes/origin/master', 'refs/heads/main', 'refs/heads/master' })
  for _, ref in ipairs(refs) do
    if git(toplevel, { 'rev-parse', '--verify', '--quiet', ref .. '^{commit}' }) then return (ref:gsub('^refs/remotes/', ''):gsub('^refs/heads/', '')) end
  end
end

local function with_branch_base(open)
  local toplevel = find_toplevel()
  if not toplevel then return vim.notify('Not in a git repo', vim.log.levels.WARN) end
  local base = find_default_branch(toplevel)
  if not base then return vim.notify('No origin/HEAD, main or master branch found', vim.log.levels.WARN) end
  open(toplevel, base)
end

---@module 'lazy'
---@type LazySpec
return {
  'sindrets/diffview.nvim',
  cmd = { 'DiffviewOpen', 'DiffviewFileHistory' },
  keys = {
    { '<leader>gd', '<cmd>DiffviewOpen<cr>', desc = 'git [d]iff view' },
    { '<leader>gh', '<cmd>DiffviewFileHistory %<cr>', desc = 'git file [h]istory' },
    { '<leader>gH', '<cmd>DiffviewFileHistory<cr>', desc = 'git repo [H]istory' },
    {
      '<leader>gr',
      function()
        with_branch_base(function(toplevel, base) require('diffview').open { base .. '...HEAD', '-C' .. toplevel } end)
      end,
      desc = 'git [r]eview branch',
    },
    {
      '<leader>gR',
      function()
        with_branch_base(function(toplevel, base)
          -- Two dots: `...` in git log would also list default-branch commits made since the fork.
          require('diffview').file_history(nil, { '--range=' .. base .. '..HEAD', '-C' .. toplevel })
        end)
      end,
      desc = 'git [R]eview branch commits',
    },
  },
  opts = {},
}
