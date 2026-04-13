import chalk from 'chalk';

function isVerbose(): boolean {
  return process.env['JUNFLOW_VERBOSE'] === '1' || process.argv.includes('--verbose');
}

export const logger = {
  success(msg: string): void {
    console.log(`${chalk.green('✔')} ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`${chalk.yellow('⚠')} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${chalk.red('✖')} ${msg}`);
  },
  info(msg: string): void {
    console.log(`${chalk.blue('ℹ')} ${msg}`);
  },
  debug(msg: string): void {
    if (isVerbose()) {
      console.log(chalk.dim(`  ${msg}`));
    }
  },
};
