#!/usr/bin/env node

import { createRequire } from 'module';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { commitCommand } from './commands/commit.js';
import { reviewCommand } from './commands/review.js';
import { statusCommand } from './commands/status.js';
import { startCommand } from './commands/start.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string; description: string };

const program = new Command();

program
  .name('junflow')
  .description(pkg.description)
  .version(pkg.version);

program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(commitCommand);
program.addCommand(reviewCommand);
program.addCommand(statusCommand);
program.addCommand(startCommand);

program.parse(process.argv);
