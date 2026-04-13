#!/usr/bin/env node

import { createRequire } from 'module';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { statusCommand } from './commands/status.js';
import { sessionCommand } from './commands/session.js';
import { hooksCommand } from './commands/hooks.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string; description: string };

const program = new Command();

program
  .name('git-pilot')
  .description('Git workflow automation with issue tracker integration')
  .version(pkg.version);

program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(statusCommand);
program.addCommand(sessionCommand);
program.addCommand(hooksCommand);

program.addHelpText('after', `
Commands:
  Setup:
    init              설정 위저드 (트래커, git 컨벤션)
    config            설정 관리 (show, set, reset, path)

  Status:
    status            현재 작업 상태 표시
    session           세션 관리 (list, show, end, resume)
    hooks             등록된 훅 목록 표시

  Claude Code Skills (MCP 도구 기반):
    /git-pilot-start    이슈 기반 개발 시작
    /git-pilot-commit   AI 커밋 메시지 생성
    /git-pilot-status   현재 작업 상태 표시

  MCP 서버:
    git-pilot-mcp     Claude Code에서 사용하는 MCP 서버
`);

program.parse(process.argv);
