/**
 * PatternFly MCP Auditor - Report Generator
 * 
 * Generates audit reports in multiple formats: markdown, markdown table, JSON, YAML.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

/**
 * Generate reports in requested formats
 */
export async function generateReports(auditResults, config) {
  const outputDir = config.reporting?.outputDir || './reports';
  const formats = config.reporting?.formats || ['markdown', 'json'];
  const filename = (config.reporting?.filename || 'audit-{timestamp}')
    .replace('{timestamp}', new Date().toISOString().replace(/[:.]/g, '-'));

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  const reportFiles = [];

  for (const format of formats) {
    let content;
    let extension;

    switch (format.toLowerCase()) {
      case 'markdown':
        content = generateMarkdownReport(auditResults, config);
        extension = 'md';
        break;
      case 'table':
        content = generateMarkdownTable(auditResults, config);
        extension = 'md';
        break;
      case 'json':
        content = JSON.stringify(auditResults, null, 2);
        extension = 'json';
        break;
      case 'yaml':
        content = yaml.dump(auditResults, { indent: 2 });
        extension = 'yaml';
        break;
      default:
        console.warn(`⚠️  Unknown format: ${format}, skipping`);
        continue;
    }

    const filepath = join(outputDir, `${filename}.${extension}`);
    writeFileSync(filepath, content, 'utf8');
    reportFiles.push(filepath);
  }

  return reportFiles;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(auditResults, config) {
  const { healthChecks, questions, results, analysis, timestamp } = auditResults;
  const consistencyScore = (analysis.overall.consistencyScore * 100).toFixed(1);
  const consistentRuns = analysis.overall.consistentRuns;
  const inconsistentRuns = analysis.overall.inconsistentRuns;
  const totalRuns = config.audit.runs;

  let report = `# PatternFly MCP Audit Report\n\n`;
  report += `**Date**: ${new Date(timestamp).toLocaleString()}\n`;
  report += `**Runs**: ${totalRuns}\n`;
  report += `**Total Questions**: ${questions.length} (${questions.filter(q => q.category === 'tooling').length} PF-MCP, ${questions.filter(q => q.category !== 'tooling').length} baseline)\n\n`;

  // Health Checks
  report += `## Health Checks\n\n`;
  if (healthChecks.length === 0) {
    report += `No health checks configured.\n\n`;
  } else {
    for (const check of healthChecks) {
      const icon = check.status === 'pass' ? '✅' : '❌';
      report += `${icon} **${check.name}**: ${check.message}\n`;
    }
    report += `\n`;
  }

  // Overall Results
  report += `## Overall Results\n\n`;
  report += `- **Consistency Score**: ${consistencyScore}%\n`;
  report += `- **Consistent Runs**: ${consistentRuns}/${totalRuns}\n`;
  report += `- **Inconsistent Runs**: ${inconsistentRuns}/${totalRuns}\n\n`;

  // Consistency Analysis
  report += `## Consistency Analysis\n\n`;

  if (Object.keys(analysis.questions).length === 0) {
    report += `No questions analyzed.\n\n`;
  } else {
    // Summary table
    report += `### Summary\n\n`;
    report += `| Question ID | Category | Consistency | Status |\n`;
    report += `|------------|----------|-------------|--------|\n`;

    for (const [questionId, questionAnalysis] of Object.entries(analysis.questions)) {
      const question = questions.find(q => q.id === questionId);
      const category = question?.category || 'unknown';
      const consistency = (questionAnalysis.overallConsistency * 100).toFixed(1);
      const status = questionAnalysis.overallConsistency >= 0.8 ? '✅ Consistent' : '❌ Inconsistent';
      report += `| ${questionId} | ${category} | ${consistency}% | ${status} |\n`;
    }
    report += `\n`;

    // Detailed analysis
    report += `### Detailed Analysis\n\n`;
    for (const [questionId, questionAnalysis] of Object.entries(analysis.questions)) {
      const question = questions.find(q => q.id === questionId);
      report += `#### ${questionId}: ${question?.prompt || 'Unknown'}\n\n`;
      report += `- **Overall Consistency**: ${(questionAnalysis.overallConsistency * 100).toFixed(1)}%\n`;
      report += `- **Tool Consistency**: ${(questionAnalysis.toolConsistency.consistency * 100).toFixed(1)}% ${questionAnalysis.toolConsistency.isConsistent ? '✅' : '❌'}\n`;
      report += `- **Answer Consistency**: ${(questionAnalysis.answerConsistency.consistency * 100).toFixed(1)}% ${questionAnalysis.answerConsistency.isConsistent ? '✅' : '❌'}\n`;
      report += `- **Timing Consistency**: ${(questionAnalysis.timingConsistency.consistency * 100).toFixed(1)}% ${questionAnalysis.timingConsistency.isConsistent ? '✅' : '❌'}\n`;

      if (questionAnalysis.toolConsistency.toolCalls.length > 0) {
        report += `- **Tool Calls**: ${questionAnalysis.toolConsistency.toolCalls.join(', ')}\n`;
      }

      if (questionAnalysis.timingConsistency.avgDuration) {
        report += `- **Average Duration**: ${questionAnalysis.timingConsistency.avgDuration.toFixed(0)}ms\n`;
      }

      report += `\n`;
    }
  }

  // Recommendations
  report += `## Recommendations\n\n`;
  if (inconsistentRuns === 0) {
    report += `✅ All tests passed with consistent results. No action required.\n\n`;
  } else {
    report += `⚠️  Inconsistencies detected. Consider:\n\n`;
    report += `1. Review inconsistent questions for patterns\n`;
    report += `2. Check MCP server stability and performance\n`;
    report += `3. Verify model configuration (temperature, maxTokens)\n`;
    report += `4. Review tool call patterns for reliability issues\n\n`;
  }

  // Configuration
  report += `## Configuration\n\n`;
  report += `\`\`\`yaml\n`;
  report += yaml.dump({
    runs: config.audit.runs,
    mcp: { url: config.mcp.url },
    model: {
      temperature: config.model?.temperature,
      maxTokens: config.model?.maxTokens
    },
    interjection: config.interjection?.strategy
  }, { indent: 2 });
  report += `\`\`\`\n`;

  return report;
}

/**
 * Generate markdown table report
 */
function generateMarkdownTable(auditResults, config) {
  const { questions, results, analysis } = auditResults;
  const consistencyScore = (analysis.overall.consistencyScore * 100).toFixed(1);

  let report = `# PatternFly MCP Audit Report - Table View\n\n`;
  report += `**Consistency Score**: ${consistencyScore}%\n\n`;

  // Main results table
  report += `## Question Results\n\n`;
  report += `| Question ID | Category | Prompt | Consistency | Tool Calls | Avg Duration | Status |\n`;
  report += `|------------|----------|--------|-------------|------------|--------------|--------|\n`;

  for (const [questionId, questionAnalysis] of Object.entries(analysis.questions)) {
    const question = questions.find(q => q.id === questionId);
    const category = question?.category || 'unknown';
    const prompt = (question?.prompt || '').substring(0, 50) + '...';
    const consistency = (questionAnalysis.overallConsistency * 100).toFixed(1);
    const toolCalls = questionAnalysis.toolConsistency.toolCalls.length > 0
      ? questionAnalysis.toolConsistency.toolCalls[0]
      : 'none';
    const avgDuration = questionAnalysis.timingConsistency.avgDuration
      ? `${questionAnalysis.timingConsistency.avgDuration.toFixed(0)}ms`
      : 'N/A';
    const status = questionAnalysis.overallConsistency >= 0.8 ? '✅' : '❌';

    report += `| ${questionId} | ${category} | ${prompt} | ${consistency}% | ${toolCalls} | ${avgDuration} | ${status} |\n`;
  }

  report += `\n`;

  // Run-by-run breakdown
  report += `## Run-by-Run Breakdown\n\n`;
  report += `| Run | Question ID | Success | Duration | Tool Calls |\n`;
  report += `|-----|------------|---------|----------|------------|\n`;

  for (const result of results) {
    const success = result.success ? '✅' : '❌';
    const duration = `${result.duration}ms`;
    const toolCalls = result.toolCalls.length > 0
      ? result.toolCalls.map(tc => tc.tool).join(', ')
      : 'none';

    report += `| ${result.runNumber} | ${result.questionId} | ${success} | ${duration} | ${toolCalls} |\n`;
  }

  return report;
}

