import chalk from 'chalk';
import { logger } from './logger.js';

export interface AgentLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug: (msg: string) => void;
}

export function makeAgentLogger(verbose: boolean): AgentLogger {
  return {
    info: (msg: string) => { if (verbose) console.log(chalk.gray(msg)); },
    warn: (msg: string) => console.warn(`${chalk.yellow('⚠')} ${msg}`),
    error: (msg: string) => console.error(`${chalk.red('✖')} ${msg}`),
    debug: (msg: string) => { if (verbose) console.log(chalk.dim(msg)); },
  };
}

export function makeCommitAgentLogger(): AgentLogger {
  return {
    info: (msg: string) => logger.debug(msg),
    warn: (msg: string) => logger.warn(msg),
    error: (msg: string) => logger.error(msg),
    debug: (msg: string) => logger.debug(msg),
  };
}
