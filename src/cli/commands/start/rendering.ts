import chalk from 'chalk';
import type { TaskDecompositionResult } from '../../../agents/task-decomposer.js';

export function renderAnalysisBox(
  analysis: {
    title: string;
    type: string;
    complexity: string;
    keyRequirements: string[];
    suggestedApproach: string;
  },
  branchCandidates: string[],
): string {
  const typeColor = {
    feature: chalk.green,
    bugfix: chalk.red,
    refactor: chalk.blue,
    chore: chalk.gray,
    docs: chalk.cyan,
  }[analysis.type] ?? chalk.white;

  const complexityColor = {
    low: chalk.green,
    medium: chalk.yellow,
    high: chalk.red,
  }[analysis.complexity] ?? chalk.white;

  const lines: string[] = [];
  lines.push(chalk.bold('Issue Analysis'));
  lines.push(`${chalk.dim('Title:')} ${analysis.title}`);
  lines.push(`${chalk.dim('Type:')} ${typeColor(analysis.type)}  ${chalk.dim('Complexity:')} ${complexityColor(analysis.complexity)}`);

  if (analysis.keyRequirements.length > 0) {
    lines.push(`${chalk.dim('Requirements:')}`);
    for (const req of analysis.keyRequirements) {
      lines.push(`  ${chalk.dim('-')} ${req}`);
    }
  }

  if (analysis.suggestedApproach) {
    lines.push(`${chalk.dim('Suggested Approach:')}`);
    lines.push(`  ${analysis.suggestedApproach}`);
  }

  lines.push('');
  lines.push(chalk.bold('Branch'));
  if (branchCandidates.length > 0) {
    lines.push(`  ${chalk.cyan('>')} ${chalk.bold(branchCandidates[0] ?? '')}`);
    for (let i = 1; i < branchCandidates.length; i++) {
      lines.push(`    ${branchCandidates[i] ?? ''}`);
    }
  }

  return lines.join('\n');
}

export function renderDecompositionBox(result: TaskDecompositionResult): string {
  const complexityColor = (c: string) =>
    ({ low: chalk.green, medium: chalk.yellow, high: chalk.red }[c] ?? chalk.white)(c);

  const lines: string[] = [];
  lines.push(chalk.bold(`Task Decomposition (${result.graphType.toUpperCase()}) | Total: ${result.totalEstimate}`));
  lines.push('');

  for (let lvl = 0; lvl < result.executionLevels.length; lvl++) {
    const levelIds = result.executionLevels[lvl]!;
    const label = lvl === 0 && levelIds.length > 1 ? `Level ${lvl} ${chalk.dim('(병렬)')}:` : `Level ${lvl}:`;
    lines.push(chalk.bold(label));
    for (const id of levelIds) {
      const task = result.subtasks.find((t) => t.id === id);
      if (!task) continue;
      const deps = task.dependsOn.length > 0 ? chalk.dim(` → ${task.dependsOn.join(', ')}`) : '';
      lines.push(`  ${chalk.cyan(`[${task.id}]`)} ${task.title} ${chalk.dim(`(${complexityColor(task.estimatedComplexity)})`)}${deps}`);
    }
    if (lvl < result.executionLevels.length - 1) lines.push('');
  }

  return lines.join('\n');
}
