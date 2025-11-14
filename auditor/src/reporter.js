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
  const pfMcpScore = (analysis.pfMcp?.consistencyScore * 100 || 0).toFixed(1);
  const overallScore = (analysis.overall.consistencyScore * 100).toFixed(1);
  const baselineScore = (analysis.baseline?.consistencyScore * 100 || 0).toFixed(1);
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

  // Consistency Scores (PF-MCP is primary focus)
  report += `## Consistency Scores\n\n`;
  report += `### 🎯 PF-MCP Consistency (Primary Focus)\n\n`;
  report += `- **Score**: ${pfMcpScore}%\n`;
  report += `- **Questions**: ${analysis.pfMcp?.totalQuestions || 0} PF-MCP questions\n`;
  report += `- **Status**: ${parseFloat(pfMcpScore) >= 80 ? '✅ Consistent' : '❌ Needs Attention'}\n\n`;
  
  report += `### 📊 Overall Consistency (All Questions)\n\n`;
  report += `- **Score**: ${overallScore}%\n`;
  report += `- **Questions**: ${analysis.overall.totalQuestions} total questions\n`;
  report += `- **Consistent Runs**: ${consistentRuns}/${totalRuns}\n`;
  report += `- **Inconsistent Runs**: ${inconsistentRuns}/${totalRuns}\n\n`;
  
  report += `### 📈 Baseline Consistency (Non-PF-MCP Questions)\n\n`;
  report += `- **Score**: ${baselineScore}%\n`;
  report += `- **Questions**: ${analysis.baseline?.totalQuestions || 0} baseline questions\n\n`;

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
      let status = questionAnalysis.overallConsistency >= 0.8 ? '✅ Consistent' : '❌ Inconsistent';
      
      // Add confusion warning if high confusion detected
      if (questionAnalysis.answerConsistency.confusion && 
          questionAnalysis.answerConsistency.confusion.confusionScore > 0.5) {
        status += ' ⚠️ Confused';
      }
      
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
      if (questionAnalysis.answerConsistency.pfMcpAlignment !== undefined) {
        report += `  - PF-MCP Alignment: ${(questionAnalysis.answerConsistency.pfMcpAlignment * 100).toFixed(1)}% (Tool mentions: ${(questionAnalysis.answerConsistency.toolMentionScore * 100).toFixed(1)}%, Description match: ${(questionAnalysis.answerConsistency.descriptionAlignmentScore * 100).toFixed(1)}%)\n`;
      }
      if (questionAnalysis.answerConsistency.majorityConsistency !== undefined) {
        report += `  - Majority Consistency: ${(questionAnalysis.answerConsistency.majorityConsistency * 100).toFixed(1)}% (${questionAnalysis.answerConsistency.majoritySize || 0}/${questionAnalysis.answerConsistency.totalRuns || 0} runs)\n`;
      }
      if (questionAnalysis.answerConsistency.confusion && questionAnalysis.answerConsistency.confusion.confusionScore > 0) {
        const confusion = questionAnalysis.answerConsistency.confusion;
        const confusionPercent = (confusion.confusionScore * 100).toFixed(1);
        const confusionIcon = confusion.confusionScore > 0.5 ? '⚠️' : 'ℹ️';
        report += `  - ${confusionIcon} **Confusion Score**: ${confusionPercent}%\n`;
        if (confusion.incorrectPatterns && confusion.incorrectPatterns.length > 0) {
          report += `    - Incorrect Patterns Detected:\n`;
          for (const pattern of confusion.incorrectPatterns) {
            report += `      - ${pattern}\n`;
          }
        }
        if (confusion.parameterConfusion > 0) {
          report += `    - Parameter Confusion: ${(confusion.parameterConfusion * 100).toFixed(1)}%\n`;
        }
        if (confusion.workflowConfusion > 0) {
          report += `    - Workflow Confusion: ${(confusion.workflowConfusion * 100).toFixed(1)}%\n`;
        }
      }
      report += `- **Timing Consistency**: ${(questionAnalysis.timingConsistency.consistency * 100).toFixed(1)}% ${questionAnalysis.timingConsistency.isConsistent ? '✅' : '❌'}\n`;

      if (questionAnalysis.toolConsistency.toolCalls.length > 0) {
        report += `- **Tool Calls**: ${questionAnalysis.toolConsistency.toolCalls.join(', ')}\n`;
      }

      if (questionAnalysis.timingConsistency.avgDuration) {
        report += `- **Average Duration**: ${questionAnalysis.timingConsistency.avgDuration.toFixed(0)}ms\n`;
      }

      report += `\n`;
    }

    // Raw Answers Section
    report += `### Raw Model Answers\n\n`;
    report += `This section shows the actual model responses for each question across all runs.\n\n`;

    // Group results by question ID
    const resultsByQuestion = {};
    for (const result of results) {
      if (!resultsByQuestion[result.questionId]) {
        resultsByQuestion[result.questionId] = [];
      }
      resultsByQuestion[result.questionId].push(result);
    }

    for (const [questionId, questionResults] of Object.entries(resultsByQuestion)) {
      const question = questions.find(q => q.id === questionId);
      report += `#### ${questionId}: ${question?.prompt || 'Unknown'}\n\n`;

      // Sort by run number
      questionResults.sort((a, b) => a.runNumber - b.runNumber);

      for (const result of questionResults) {
        const statusIcon = result.success ? '✅' : '❌';
        report += `**Run ${result.runNumber}** ${statusIcon}\n\n`;
        
        if (result.success && result.answer) {
          // Escape any markdown code blocks in the answer to prevent formatting issues
          const escapedAnswer = result.answer.replace(/```/g, '\\`\\`\\`');
          report += `\`\`\`\n${escapedAnswer}\n\`\`\`\n\n`;
        } else if (result.error) {
          report += `*Error: ${result.error}*\n\n`;
        } else {
          report += `*No answer provided*\n\n`;
        }

        if (result.toolCalls && result.toolCalls.length > 0) {
          report += `*Tool calls: ${result.toolCalls.map(tc => tc.tool).join(', ')}*\n\n`;
        }

        report += `---\n\n`;
      }
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
  const pfMcpScore = (analysis.pfMcp?.consistencyScore * 100 || 0).toFixed(1);
  const overallScore = (analysis.overall.consistencyScore * 100).toFixed(1);
  const baselineScore = (analysis.baseline?.consistencyScore * 100 || 0).toFixed(1);

  let report = `# PatternFly MCP Audit Report - Table View\n\n`;
  report += `## Consistency Scores\n\n`;
  report += `| Category | Score | Questions | Status |\n`;
  report += `|----------|-------|-----------|--------|\n`;
  report += `| **🎯 PF-MCP (Primary)** | **${pfMcpScore}%** | ${analysis.pfMcp?.totalQuestions || 0} | ${parseFloat(pfMcpScore) >= 80 ? '✅' : '❌'} |\n`;
  report += `| 📊 Overall (All) | ${overallScore}% | ${analysis.overall.totalQuestions} | ${parseFloat(overallScore) >= 80 ? '✅' : '❌'} |\n`;
  report += `| 📈 Baseline | ${baselineScore}% | ${analysis.baseline?.totalQuestions || 0} | ${parseFloat(baselineScore) >= 80 ? '✅' : '❌'} |\n\n`;

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
    let status = questionAnalysis.overallConsistency >= 0.8 ? '✅' : '❌';
    
    // Add confusion warning if high confusion detected
    if (questionAnalysis.answerConsistency.confusion && 
        questionAnalysis.answerConsistency.confusion.confusionScore > 0.5) {
      status += ' ⚠️';
    }

    report += `| ${questionId} | ${category} | ${prompt} | ${consistency}% | ${toolCalls} | ${avgDuration} | ${status} |\n`;
  }

  report += `\n`;

  // Confusion Analysis Section (if any confusion detected)
  const confusedQuestions = Object.entries(analysis.questions)
    .filter(([_, qa]) => qa.answerConsistency.confusion && qa.answerConsistency.confusion.confusionScore > 0.3);
  
  if (confusedQuestions.length > 0) {
    report += `## ⚠️ Confusion Analysis\n\n`;
    report += `Questions with detected confusion/misinformation:\n\n`;
    report += `| Question ID | Confusion Score | Incorrect Patterns |\n`;
    report += `|------------|-----------------|-------------------|\n`;
    
    for (const [questionId, questionAnalysis] of confusedQuestions) {
      const confusion = questionAnalysis.answerConsistency.confusion;
      const confusionPercent = (confusion.confusionScore * 100).toFixed(1);
      const patterns = confusion.incorrectPatterns && confusion.incorrectPatterns.length > 0
        ? confusion.incorrectPatterns.join('; ')
        : 'None detected';
      
      report += `| ${questionId} | ${confusionPercent}% | ${patterns} |\n`;
    }
    report += `\n`;
  }

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

  report += `\n`;

  // Raw Answers Section
  report += `## Raw Model Answers\n\n`;
  report += `This section shows the actual model responses for each question across all runs.\n\n`;

  // Group results by question ID
  const resultsByQuestion = {};
  for (const result of results) {
    if (!resultsByQuestion[result.questionId]) {
      resultsByQuestion[result.questionId] = [];
    }
    resultsByQuestion[result.questionId].push(result);
  }

  for (const [questionId, questionResults] of Object.entries(resultsByQuestion)) {
    const question = questions.find(q => q.id === questionId);
    report += `### ${questionId}: ${question?.prompt || 'Unknown'}\n\n`;

    // Sort by run number
    questionResults.sort((a, b) => a.runNumber - b.runNumber);

    for (const result of questionResults) {
      const statusIcon = result.success ? '✅' : '❌';
      report += `**Run ${result.runNumber}** ${statusIcon}\n\n`;
      
      if (result.success && result.answer) {
        // Escape any markdown code blocks in the answer to prevent formatting issues
        const escapedAnswer = result.answer.replace(/```/g, '\\`\\`\\`');
        report += `\`\`\`\n${escapedAnswer}\n\`\`\`\n\n`;
      } else if (result.error) {
        report += `*Error: ${result.error}*\n\n`;
      } else {
        report += `*No answer provided*\n\n`;
      }

      if (result.toolCalls && result.toolCalls.length > 0) {
        report += `*Tool calls: ${result.toolCalls.map(tc => tc.tool).join(', ')}*\n\n`;
      }

      report += `---\n\n`;
    }
  }

  return report;
}

