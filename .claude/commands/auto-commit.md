# Auto Commit

Automatically analyze code changes and create a git commit following the project's commit message style.

## Instructions

You are tasked with automatically committing staged and unstaged changes to the git repository. Follow these steps:

1. **Analyze the repository state** by running these commands in parallel:
   - Run `git status` to see all untracked and modified files
   - Run `git diff` to see unstaged changes
   - Run `git diff --staged` to see staged changes
   - Run `git log --oneline -10` to understand the commit message style used in this repository

2. **Review all changes** thoroughly:
   - Examine both staged and unstaged changes
   - Identify the nature of changes (new feature, bug fix, refactor, docs, etc.)
   - Determine which files should be committed together
   - Exclude files that should not be committed (like .env, credentials, etc.)

3. **Generate a commit message** that:
   - Follows the repository's commit style (check git log output)
   - Uses the format: `<type>(<scope>): <subject>` based on the project's git commit guidelines
   - Types: feat, fix, docs, style, refactor, test, chore, perf, ci
   - Focuses on the "why" rather than just the "what"
   - Is concise (1-2 sentences) but accurately describes the purpose
   - Must end with the Claude Code attribution:
     ```

     🤖 Generated with [Claude Code](https://claude.com/claude-code)

     Co-Authored-By: Claude <noreply@anthropic.com>
     ```

4. **Create the commit** by:
   - Adding relevant files to staging area with `git add <files>`
   - Creating the commit using a HEREDOC format:
     ```bash
     git commit -m "$(cat <<'EOF'
     <commit message here>

     🤖 Generated with [Claude Code](https://claude.com/claude-code)

     Co-Authored-By: Claude <noreply@anthropic.com>
     EOF
     )"
     ```
   - Running `git status` after commit to verify success

5. **Handle special cases**:
   - If there are no changes to commit, inform the user
   - If pre-commit hooks modify files, check if it's safe to amend
   - Warn the user about any files that look like they contain secrets
   - Do not skip hooks or use --no-verify
   - Do not force push or run destructive git commands

## Important Notes

- NEVER commit files that likely contain secrets (.env, credentials.json, etc.)
- DO NOT push to remote unless explicitly asked
- DO NOT use `git commit --amend` unless pre-commit hooks made changes
- Always preserve the exact commit message format used in the repository
- Run commands sequentially when they depend on each other (use &&)
- Run independent commands in parallel for efficiency

## Git Safety

- NEVER update git config
- NEVER run destructive operations (force push, hard reset, etc.)
- NEVER skip hooks (--no-verify, --no-gpg-sign) unless explicitly requested
- Only commit when changes are ready and tested
