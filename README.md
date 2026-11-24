# JunFlow

[![npm version](https://img.shields.io/npm/v/junflow)](https://www.npmjs.com/package/junflow)

A CLI that handles the repetitive parts of working on an issue: reading the ticket, naming the branch, writing the commit message, and getting a first-pass code review. It talks to Claude, OpenAI, or Gemini, and pulls issues from Notion, GitHub Issues, or Jira.

```bash
npm install -g junflow
junflow init                 # pick an AI provider, tracker, and git conventions
junflow start PROJ-42        # read the issue, suggest branch names, create one
junflow commit               # commit message from the staged diff
junflow review               # review the current branch against main
```

`junflow autopilot --issue PROJ-42` chains the same steps (analyze → branch → commit → review → verify). If the review step fails, the rest still runs.

## Commands

### `start <issue-id>`

Fetches the issue, has the model classify it, and offers three branch names. The chosen branch is created and the issue context is saved to `.junflow/current-issue.json` so later commands can use it.

```bash
junflow start PROJ-42 --dry-run    # show the suggestions, don't create a branch
junflow start PROJ-42 --decompose  # split the issue into sub-tasks
junflow start PROJ-42 --full       # analyze → branch → review
```

### `commit`

Writes three commit message candidates from the staged diff. Conventional Commits by default; gitmoji is also supported.

```bash
junflow commit --auto        # take the first candidate
junflow commit --all         # stage everything first
junflow commit --consensus   # ask every configured provider, then merge
junflow commit --verify      # check the message and retry if it's weak
```

### `review`

```bash
junflow review --staged
junflow review --base develop
junflow review --focus security performance
junflow review --workflow    # security / performance / readability reviewers in parallel
junflow review --deep        # same review from each provider, merged into one
```

Findings are grouped by severity (critical, warning, suggestion, praise) with file and line.

### `review-doc <file>`

Reviews a markdown spec or RFC. `--deep` searches the web (Tavily) to check claims in the document.

### `status`

Shows the current branch, linked issue, and session. `--cost` breaks down token usage and cost per agent and model; `--history` adds recent sessions.

### Others

| Command | What it does |
|---|---|
| `config show` / `config set <key> <value>` | Read or change `~/.junflow/config.yaml` |
| `session list` / `session end` | Manage sessions |
| `team <preset>` | Run a preset: `full-dev`, `quick-commit`, `deep-review`, `autopilot` |
| `hooks` | List configured hooks |
| `init --hooks` | Register keyword hooks for Claude Code (see below) |

## Using it in CI

With `--ci`, there are no prompts and output goes to stdout. CI mode also turns on by itself when `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `JENKINS_URL`, `CIRCLECI`, or `TRAVIS` is set.

```bash
junflow review --ci --output json > review.json
junflow review --ci --format github-pr > review.md   # or gitlab-mr
```

GitHub Actions example:

```yaml
name: AI Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g junflow
      - env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ github.token }}
        run: |
          junflow review --ci --format github-pr > review.md
          gh pr comment ${{ github.event.pull_request.number }} --body-file review.md
```

## Multiple providers

If more than one API key is set, a few extra things open up:

- **Per-agent models.** Send heavy work to a bigger model and commit messages to a cheap one (see config below).
- **Fallback.** When a provider fails or hits a rate limit, the request moves to the next one.
- **Consensus.** `--consensus` and `--deep` run the same task on every provider and merge the results, along with an agreement score.

If Codex CLI or Gemini CLI is installed, JunFlow can also hand tasks to them as separate workers. With a single key, everything runs on that one provider.

## Configuration

`~/.junflow/config.yaml`:

```yaml
ai:
  provider: claude            # claude | openai | gemini
  model: claude-sonnet-4-20250514
  maxTokens: 2048
  agentRouting:               # optional
    codeReviewer:
      provider: openai
      model: gpt-4o
      timeout: 90

tracker:
  type: notion                # notion | github | jira | mock
  notion:
    databaseId: abc123...

git:
  branchConvention: '{type}/{issueId}-{description}'
  commitConvention: conventional   # conventional | gitmoji
  commitLanguage: ko               # ko | en

hooks:
  - event: post-commit
    command: npm run lint
```

API keys come from environment variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `NOTION_API_KEY`, `GITHUB_TOKEN`, `JIRA_API_TOKEN`.

## Claude Code

`junflow init --hooks` registers a hook in Claude Code that maps phrases to JunFlow skills, e.g. "커밋 메시지 만들어" → `junflow-commit`, "코드 리뷰해줘" → `junflow-review`, "심층 리뷰 해줘" → `junflow-deep-review`. Rules have priorities, so "deep review" goes to the deep skill rather than the basic one. There's also an MCP server (`junflow-mcp`).

JunFlow doesn't need Claude Code; `npx junflow` works anywhere Node.js 20+ runs.

## How it's built

TypeScript (ESM) on Node.js 20+, Commander.js for the CLI, Zod for config and for checking model responses (a response that fails the check is retried).

Every agent implements `Agent<TInput, TOutput>` and returns an `AgentResult<T>`. Logging and token counting live in `BaseAgent`. Multi-step runs are a DAG: topologically sorted, then each level runs in parallel with `Promise.all`.

```
src/
├── cli/           commands, CI options, output formatters
├── agents/        issue analysis, branch naming, commit, review, verify, ...
├── ai/            provider clients, fallback, consensus, retry
├── dag/ teams/    DAG runner and team presets
├── orchestrator/  Codex / Gemini CLI workers
├── trackers/      Notion, GitHub, Jira
├── session/       sessions and cost
├── hooks/  mcp/  search/  git/  config/
```

## Development

```bash
git clone https://github.com/pbjuni1007-cmyk/junflow.git
cd junflow
npm install
npm link        # use the local build as the global `junflow`
npm test        # Vitest
npm run build   # tsup
```

## License

MIT
