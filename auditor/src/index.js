#!/usr/bin/env node

/**
 * PatternFly MCP Auditor - Main Entry Point
 *
 * Containerized consistency auditor for PatternFly MCP server.
 * Runs consistency tests using an embedded model (node-llama-cpp).
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runAudit } from './auditor.js';
import { generateReports } from './reporter.js';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    configPath: null,
    mcpUrl: null,
    runs: null,
    outputDir: null,
    formats: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--config' && args[i + 1]) {
      config.configPath = args[++i];
    } else if (arg === '--mcp-url' && args[i + 1]) {
      config.mcpUrl = args[++i];
    } else if (arg === '--runs' && args[i + 1]) {
      config.runs = parseInt(args[++i], 10);
    } else if (arg === '--output' && args[i + 1]) {
      config.outputDir = args[++i];
    } else if (arg === '--format' && args[i + 1]) {
      config.formats = args[++i].split(',').map(f => f.trim());
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return config;
}

/**
 * Print help message
 */
function printHelp() {
  console.warn(`
PatternFly MCP Auditor

Usage:
  node src/index.js [options]

Options:
  --config <path>      Path to audit configuration YAML (default: config/audit-config.yaml)
  --mcp-url <url>      MCP server URL (overrides config)
  --runs <number>      Number of audit runs (overrides config)
  --output <dir>       Output directory for reports (overrides config)
  --format <formats>   Comma-separated formats: markdown,table,json,yaml (overrides config)
  --help, -h           Show this help message

Examples:
  node src/index.js
  node src/index.js --config ./config/custom-config.yaml
  node src/index.js --mcp-url http://localhost:3000 --runs 100
  node src/index.js --format markdown,json --output ./my-reports
`);
}

/**
 * Load configuration from YAML file
 */
function loadConfig(configPath) {
  const defaultPath = join(ROOT_DIR, 'config', 'audit-config.yaml');
  const path = configPath || defaultPath;

  try {
    const fileContents = readFileSync(path, 'utf8');
    const config = yaml.load(fileContents);
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Configuration file not found: ${path}`);
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Merge CLI args into config
 */
function mergeConfig(config, cliArgs) {
  if (cliArgs.mcpUrl) {
    config.mcp.url = cliArgs.mcpUrl;
  } else if (process.env.MCP_URL) {
    // Allow MCP URL to be set via environment variable (useful for containers)
    config.mcp = config.mcp || {};
    config.mcp.url = process.env.MCP_URL;
  }
  if (cliArgs.runs) {
    config.audit.runs = cliArgs.runs;
  }
  if (cliArgs.outputDir) {
    config.reporting.outputDir = cliArgs.outputDir;
  }
  if (cliArgs.formats) {
    config.reporting.formats = cliArgs.formats;
  }
  return config;
}

/**
 * Main execution
 */
async function main() {
  console.warn('🔍 PatternFly MCP Auditor\n');

  // Set up signal handlers for graceful shutdown
  let isShuttingDown = false;
  let auditResults = null;
  let abortController = new AbortController();

  const handleShutdown = async (signal) => {
    if (isShuttingDown) {
      console.warn('\n⚠️  Force shutdown...');
      process.exit(130);
    }
    isShuttingDown = true;
    console.warn(`\n\n⚠️  Received ${signal}. Shutting down gracefully...`);

    // Signal the audit to stop
    abortController.abort();

    if (auditResults) {
      console.warn('💾 Saving partial results...');
      try {
        await generateReports(auditResults, auditResults.config);
        console.warn('✅ Partial results saved');
      } catch (err) {
        console.error('❌ Failed to save partial results:', err.message);
      }
    }

    process.exit(130); // 128 + 2 (SIGINT)
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Parse CLI arguments
  const cliArgs = parseArgs();

  // Load configuration
  console.warn('📋 Loading configuration...');
  let config = loadConfig(cliArgs.configPath);
  config = mergeConfig(config, cliArgs);

  // Validate configuration
  if (!config.mcp?.url) {
    console.error('❌ MCP server URL not configured');
    process.exit(1);
  }

  console.warn(`   MCP Server: ${config.mcp.url}`);
  console.warn(`   Runs: ${config.audit.runs}`);
  console.warn(`   Baseline Questions: ${config.questions?.baseline?.length || 0}`);
  console.warn(`   PF-MCP Questions: ${config.questions?.['pf-mcp']?.length || 0}\n`);

  try {
    // Run audit
    console.warn('🚀 Starting audit...\n');
    let results;
    try {
      results = await runAudit(config, abortController.signal);
      auditResults = results; // Store for potential shutdown

      // Check if we were interrupted
      if (abortController.signal.aborted) {
        console.warn('\n⚠️  Audit was interrupted. Partial results saved above.');
        process.exit(130);
      }
    } catch (error) {
      // Handle critical health check failures
      if (error.message.includes('Critical health check')) {
        console.error(`\n${error.message}`);
        process.exit(1);
      }
      // Handle abort errors
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        console.warn('\n⚠️  Audit was interrupted.');
        if (auditResults) {
          console.warn('💾 Saving partial results...');
          try {
            await generateReports(auditResults, auditResults.config);
            console.warn('✅ Partial results saved');
          } catch (err) {
            console.error('❌ Failed to save partial results:', err.message);
          }
        }
        process.exit(130);
      }
      throw error;
    }

    // Generate reports
    console.warn('\n📊 Generating reports...');
    const reportFiles = await generateReports(results, config);

    // Print summary
    console.warn('\n✅ Audit complete!');
    const pfMcpScore = (results.analysis.pfMcp?.consistencyScore * 100 || 0).toFixed(1);
    const overallScore = (results.analysis.overall.consistencyScore * 100).toFixed(1);
    const baselineScore = (results.analysis.baseline?.consistencyScore * 100 || 0).toFixed(1);

    console.warn(`\n📊 Consistency Scores:`);
    console.warn(`   🎯 PF-MCP (Primary): ${pfMcpScore}%`);
    console.warn(`   📊 Overall (All): ${overallScore}%`);
    console.warn(`   📈 Baseline: ${baselineScore}%`);
    console.warn(`   Consistent Runs: ${results.analysis.overall.consistentRuns}/${config.audit.runs}`);
    console.warn(`   Reports generated:`);
    reportFiles.forEach(file => {
      console.warn(`     - ${file}`);
    });

    // Clear shutdown handlers since we're done
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');

    // Exit with error code if inconsistencies found
    if (results.analysis.overall.inconsistentRuns > 0) {
      console.warn('\n⚠️  Inconsistencies detected!');
      process.exit(1);
    } else {
      console.warn('\n✅ All tests consistent!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Error during audit:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { main, loadConfig, parseArgs };

