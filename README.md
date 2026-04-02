# JunFlow

AI-powered developer workflow CLI — from issue to deploy, in one command.

[![npm version](https://img.shields.io/npm/v/junflow)](https://www.npmjs.com/package/junflow)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-648%20passed-brightgreen)]()

> Automates the full development loop: issue analysis, branch creation, AI commit messages, code review, and verification — with multi-model orchestration, CI/CD integration, and cost tracking built in.

```
junflow autopilot --issue PROJ-42
# Analyzes issue → creates branch → writes commit → reviews code → verifies quality
```

---

## Why JunFlow?

Most AI dev tools do one thing. JunFlow connects the entire workflow:

| Without JunFlow | With JunFlow |
|-----------------|--------------|
| Copy issue details manually | `junflow start PROJ-42` analyzes and creates a branch |
| Write commit messages by hand | `junflow commit` generates Conventional Commits from diff |
| Paste code into ChatGPT for review | `junflow review` reviews with structured findings |
| Run each step separately | `junflow autopilot` runs the full pipeline |
| Single model, no fallback | Multi-model consensus with auto-failover |
| No CI integration | `junflow review --ci --format github-pr` |

---

## Quick Start

### Install

```bash
npm install -g junflow
```

### Setup

```bash
junflow init
```

Interactive wizard configures:
- AI provider (Claude / OpenAI / Gemini)
- API key
- Issue tracker (Notion / GitHub Issues / Jira)
- Git conventions (branch naming, commit style)

### First Workflow

```bash
# 1. Start working on an issue
junflow start PROJ-42

# 2. Write code, then commit with AI
git add src/feature.ts
junflow commit

# 3. Review your changes
junflow review

# 4. Check session status and cost
junflow status --cost
```

Or run everything at once:

```bash
junflow autopilot --issue PROJ-42
```

---

## Commands

### `junflow start <issue-id>`

Analyzes an issue and creates a development branch.

```bash
junflow start PROJ-42              # Analyze + create branch
junflow start PROJ-42 --full       # Full workflow (analyze → branch → review)
junflow start PROJ-42 --decompose  # Break into sub-tasks (DAG)
junflow start PROJ-42 --dry-run    # Preview without creating branch
```

**What it does:**
1. Fetches issue from your tracker (Notion/GitHub/Jira)
2. AI analyzes type, complexity, requirements, and approach
3. Suggests 3 branch names — you pick one
4. Creates the branch and saves context to `.junflow/current-issue.json`

### `junflow commit`

Generates AI commit messages from staged changes.

```bash
junflow commit                     # Interactive: pick from 3 suggestions
junflow commit --auto              # Auto-select first suggestion
junflow commit --all               # Stage everything, then commit
junflow commit --consensus         # Multi-model consensus message
junflow commit --verify            # Auto-verify quality, retry if needed
junflow commit --workflow          # Commit + auto-review pipeline
junflow commit --ci --output json  # CI mode: no prompts, JSON output
```

### `junflow review`

AI code review with structured findings.

```bash
junflow review                              # Current branch vs main
junflow review --staged                     # Review staged changes only
junflow review --base develop               # Compare against develop
junflow review --focus security performance # Focus on specific areas
junflow review --deep                       # Multi-model consensus deep review
junflow review --workflow                   # Parallel review (security + performance + readability)
junflow review --verify                     # Auto-verify loop
junflow review --ci --output json           # JSON output for CI
junflow review --ci --format github-pr      # GitHub PR comment format
junflow review --ci --format gitlab-mr      # GitLab MR comment format
```

**Output example:**
```
┌─ Code Review (Score: 7/10) ──────────────────────────────┐
│ Clean implementation with minor security concerns         │
│                                                           │
│ CRITICAL (1)                                              │
│   src/auth.ts:42                                          │
│   SQL injection risk in user query                        │
│   -> Use parameterized queries                            │
│                                                           │
│ WARNING (2)                                               │
│   src/api.ts:15                                           │
│   Missing rate limiting on public endpoint                │
│                                                           │
│ PRAISE (1)                                                │
│   src/utils.ts                                            │
│   Excellent error handling pattern                        │
└──────────────────────────────────────────────────────────┘
```

### `junflow review-doc <file>`

Reviews technical documents (markdown, specs, RFCs).

```bash
junflow review-doc docs/RFC-001.md              # Basic review
junflow review-doc docs/RFC-001.md --deep       # Deep research (web search + claim verification)
junflow review-doc docs/RFC-001.md --consensus  # Multi-model consensus
junflow review-doc docs/RFC-001.md --ci --format github-pr
```

### `junflow autopilot`

Runs the full development cycle as a single DAG workflow.

```bash
junflow autopilot --issue PROJ-42
```

Pipeline: `analyze → branch → commit → review → verify`

Each step passes its output to the next. Optional steps (review) are skipped on failure without blocking the pipeline.

### `junflow status`

Dashboard showing current work state and AI usage.

```bash
junflow status              # Branch, issue, git changes, session info
junflow status --cost       # Cost breakdown by agent and model
junflow status --cost --history  # Cost trend across recent sessions
```

**Cost dashboard example:**
```
┌─ Session Cost Report ────────────────────────────┐
│ Agent              Tokens      Cost         Model │
│─────────────────────────────────────────────────  │
│ CodeReviewer       12,340    $0.096  claude-sonnet│
│ CommitWriter        3,210    $0.003  claude-haiku │
│ Verifier            1,520    $0.001  claude-haiku │
│─────────────────────────────────────────────────  │
│ Total              17,070    $0.100               │
└──────────────────────────────────────────────────┘
```

### Other Commands

| Command | Description |
|---------|-------------|
| `junflow config show` | Display current configuration |
| `junflow config set ai.provider openai` | Update a config value |
| `junflow session list` | List recent sessions |
| `junflow session end` | End current session |
| `junflow team <preset>` | Run an agent team workflow |
| `junflow hooks` | List configured hooks |
| `junflow init --hooks` | Register keyword detection hooks for Claude Code |

---

## CI/CD Integration

JunFlow runs natively in CI pipelines — no interactive prompts, structured output.

### GitHub Actions

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
      - name: Run AI Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          junflow review --ci --format github-pr > review.md
          gh pr comment ${{ github.event.pull_request.number }} --body-file review.md
```

### GitLab CI

```yaml
ai-review:
  stage: review
  script:
    - npm install -g junflow
    - junflow review --ci --format gitlab-mr > review.md
    - |
      curl --request POST "$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/notes" \
        --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
        --header "Content-Type: application/json" \
        --data "{\"body\": $(cat review.md | jq -Rs .)}"
```

### JSON Output (Any CI)

```bash
junflow review --ci --output json > review.json
junflow commit --ci --auto --output json > commit.json
junflow review-doc spec.md --ci --output json > doc-review.json
```

**CI environment auto-detection:** When `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`, `JENKINS_URL`, `CIRCLECI`, or `TRAVIS` is set, JunFlow automatically enables CI mode (no interactive prompts).

---

## Execution Modes

| Mode | Description | Usage |
|------|-------------|-------|
| **Single** | One agent, one task (default) | `junflow review` |
| **Workflow** | DAG preset with parallel execution | `junflow review --workflow` |
| **Autopilot** | Full cycle: analyze → branch → commit → review → verify | `junflow autopilot` |

### Deep Skills

Deep skills use multi-model consensus for higher-quality results:

```bash
junflow review --deep       # DeepCodeReviewer: multi-provider parallel review → consensus
junflow commit --consensus  # ConsensusRunner: generate with all available models → synthesize
```

When multiple AI providers are configured (e.g., Claude + OpenAI + Gemini), deep skills run all providers in parallel and synthesize the results. With a single provider, they gracefully fall back to standard mode.

---

## Multi-Model Orchestration

### Provider Routing

Configure different AI models per agent for optimal cost/quality:

```yaml
# ~/.junflow/config.yaml
ai:
  provider: claude
  agentRouting:
    issueAnalyzer:
      provider: claude
      model: claude-opus-4-20250805    # Complex analysis → Opus
    codeReviewer:
      provider: openai
      model: gpt-4o                    # Review → GPT-4o
    commitWriter:
      provider: claude
      model: claude-haiku-4-20250514   # Simple task → Haiku (cheap)
```

### Automatic Failover

Rate-limited? JunFlow auto-switches to the next available provider:

```
Claude (rate limited) → OpenAI (ok) → result
```

### Consensus Mode

Run all available providers in parallel, then synthesize:

```bash
junflow review --consensus
# Claude review + OpenAI review + Gemini review → merged consensus
# Agreement score: 87%
```

### Tier System

JunFlow detects your environment and adapts:

| Tier | Condition | Capability |
|------|-----------|------------|
| **Full** | Codex/Gemini CLI installed | CLI worker spawning + parallel execution |
| **Partial** | 2+ API keys configured | API-based multi-model |
| **Minimal** | Single API key | Standard single-provider |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLI Layer                                │
│  start | commit | review | review-doc | status | autopilot       │
│  CI Mode (--ci, --output json, --format github-pr/gitlab-mr)    │
└──────┬───────────────────────────────────────────────┬───────────┘
       │                                               │
       ▼                                               ▼
┌────────────────────────────┐          ┌──────────────────────────┐
│    Orchestration Layer     │          │   Session & Cost         │
│  WorkflowRunner (DAG)     │          │   SessionManager         │
│  CliRunner (Codex/Gemini) │          │   CostCalculator         │
│  TierManager (env detect) │          │   HookRunner             │
│  ConsensusRunner           │          │   TokenTracker           │
│  onProgress / AbortCtrl   │          │                          │
└──────┬─────────────────────┘          └──────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Agent Layer                                │
│  IssueAnalyzer | BranchNamer | CommitWriter | CodeReviewer       │
│  DocumentReviewer | DeepResearcher | TaskDecomposer | Verifier   │
│  DeepCodeReviewer | DeepCommitWriter | PlanAgent (Deep skills)   │
└──────┬───────────────────────────────────────────────┬───────────┘
       │                                               │
       ▼                                               ▼
┌────────────────────────────┐          ┌──────────────────────────┐
│   AI Provider Layer        │          │   Tracker Layer          │
│  Claude / OpenAI / Gemini  │          │   Notion / GitHub / Jira │
│  Provider Routing Table    │          │   Error Classification   │
│  Fallback Chain (auto)     │          │   Auto Recovery          │
└────────────────────────────┘          └──────────────────────────┘
```

### Key Design Decisions

- **Monolithic CLI + functional agents** — no microservices, no message bus
- **`Agent<TInput, TOutput>`** interface with `AgentResult<T>` discriminated union
- **DAG execution** — topological sort → level-based parallel execution (`Promise.all`)
- **Template method** in `BaseAgent` for cross-cutting concerns (logging, token tracking)
- **Zod validation** for all AI responses — parse + validate + retry on failure
- **Works without Claude Code** — `npx junflow` runs standalone in any environment

---

## Configuration

`~/.junflow/config.yaml`:

```yaml
ai:
  provider: claude           # claude, openai, gemini
  model: claude-sonnet-4-20250514
  maxTokens: 2048

  # Per-agent routing (optional)
  agentRouting:
    codeReviewer:
      provider: openai
      model: gpt-4o
      timeout: 90
    commitWriter:
      provider: claude
      model: claude-haiku-4-20250514

tracker:
  type: notion               # notion, github, jira, mock
  notion:
    databaseId: abc123...

git:
  branchConvention: '{type}/{issueId}-{description}'
  commitConvention: conventional   # conventional, gitmoji
  commitLanguage: ko               # ko, en

hooks:
  pre-start:
    - command: "echo 'Starting...'"
  post-commit:
    - command: "npm run lint"

output:
  color: true
  verbose: false
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For Claude | Claude API key |
| `OPENAI_API_KEY` | For OpenAI | OpenAI API key |
| `GEMINI_API_KEY` | For Gemini | Gemini API key |
| `NOTION_API_KEY` | For Notion tracker | Notion integration token |
| `GITHUB_TOKEN` | For GitHub tracker | GitHub personal access token |
| `JIRA_API_TOKEN` | For Jira tracker | Jira API token |

---

## Claude Code Integration

JunFlow includes Claude Code skills for seamless in-editor usage:

```bash
junflow init --hooks   # Register keyword detection hooks
```

Once registered, natural language triggers skill routing:

| You type in Claude Code | JunFlow skill activated |
|------------------------|------------------------|
| "커밋 메시지 만들어" | `junflow-commit` |
| "코드 리뷰해줘" | `junflow-review` |
| "심층 리뷰 해줘" | `junflow-deep-review` |
| "계획 세워줘" | `junflow-plan` |
| "autopilot 시작" | `junflow-autopilot` |

Priority-based matching ensures "deep review" routes to the deep skill, not the basic one.

---

## Development

```bash
git clone https://github.com/pbjuni1007-cmyk/junflow.git
cd junflow
npm install
npm link             # Global CLI for local testing

npm test             # 648 tests, 58 files
npm run build        # tsup (esbuild)
npm run dev          # Watch mode
npm run test:cov     # Coverage report
npm run lint         # ESLint
npm run format       # Prettier
```

### Project Structure

```
src/
├── cli/
│   ├── commands/        # CLI commands (start, commit, review, autopilot, ...)
│   ├── options/         # Shared options (ci-mode)
│   ├── formatters/      # Output formatters (json, markdown, gitlab)
│   └── utils/           # Error handler, logger, token tracker, workflow renderer
├── agents/              # 12 agents (including Deep variants)
├── ai/                  # Provider factory, routing, consensus, retry, fallback
├── orchestrator/        # CLI worker spawning, tier detection
├── modes/               # Execution modes (single, workflow, autopilot)
├── teams/               # DAG runner, presets, agent factory
├── session/             # Session manager, cost calculator
├── hooks/               # Hook runner, keyword detector
├── trackers/            # Notion, GitHub, Jira adapters
├── dag/                 # Topological sort, cycle detection
├── mcp/                 # Claude Code MCP server
├── git/                 # Git operations
├── search/              # Web search (Tavily)
└── config/              # Zod schema, loader, defaults
```

### Tech Stack

| Category | Technology |
|----------|-----------|
| Runtime | Node.js 20+ / TypeScript (ESM) |
| CLI | Commander.js |
| AI | @anthropic-ai/sdk, openai, @google/generative-ai |
| Trackers | @notionhq/client, @octokit/rest, jira.js |
| MCP | @modelcontextprotocol/sdk |
| Git | simple-git |
| Config | js-yaml + Zod |
| UI | chalk, ora, inquirer, boxen |
| Test | Vitest |
| Bundle | tsup (esbuild) |

---

## License

MIT

## Author

Made by [Jun](https://github.com/pbjuni1007-cmyk)
