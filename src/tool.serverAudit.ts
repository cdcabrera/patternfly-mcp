import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { type McpTool } from './server';
import { getOptions } from './options.context';

/**
 * Expected core tools that should always be registered
 */
const EXPECTED_CORE_TOOLS = [
  'usePatternFlyDocs',
  'fetchDocs',
  'componentSchemas',
  'serverAudit'
];

/**
 * serverAudit tool function (tuple pattern)
 *
 * Provides basic diagnostic information about the MCP server including:
 * - Server information (name, version)
 * - Configuration validation
 * - Expected tools list
 * - Context state
 * - Basic health checks
 *
 * @param options - Optional configuration options (defaults to getOptions())
 * @returns {McpTool} MCP tool tuple [name, schema, callback]
 */
const serverAuditTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { includeDetails = false } = args;

    // Use the options passed to the tool creator (captured in closure)
    // This allows the tool to work with specific options in tests
    const opts = options;

    const audit: {
      timestamp: string;
      server: {
        name: string;
        version: string;
        status: 'healthy' | 'degraded' | 'error';
      };
      tools: {
        expected: string[];
        note: string;
      };
      configuration: {
        valid: boolean;
        docsHost: boolean;
        paths: {
          docsPath: string;
          llmsFilesPath: string;
          contextPath: string;
        };
        validation: Array<{ check: string; status: 'pass' | 'fail' | 'warning'; message?: string }>;
      };
      context: {
        hasContext: boolean;
        optionsFrozen: boolean;
      };
      health: {
        checks: Array<{ name: string; status: 'pass' | 'fail' | 'warning'; message?: string }>;
      };
    } = {
      timestamp: new Date().toISOString(),
      server: {
        name: opts.name || 'unknown',
        version: opts.version || 'unknown',
        status: 'healthy'
      },
      tools: {
        expected: [...EXPECTED_CORE_TOOLS],
        note: 'These are the expected core tools. Actual registered tools are managed by the MCP server.'
      },
      configuration: {
        valid: true,
        docsHost: Boolean(opts.docsHost),
        paths: {
          docsPath: opts.docsPath || 'not configured',
          llmsFilesPath: opts.llmsFilesPath || 'not configured',
          contextPath: opts.contextPath || 'not configured'
        },
        validation: []
      },
      context: {
        hasContext: true,
        optionsFrozen: false
      },
      health: {
        checks: []
      }
    };

    // Validate configuration
    const configChecks: Array<{ check: string; status: 'pass' | 'fail' | 'warning'; message?: string }> = [];

    // Check required options
    if (!opts.name) {
      configChecks.push({ check: 'Server name', status: 'fail', message: 'Server name is missing' });
      audit.server.status = 'error';
    } else {
      configChecks.push({ check: 'Server name', status: 'pass' });
    }

    if (!opts.version) {
      configChecks.push({ check: 'Server version', status: 'fail', message: 'Server version is missing' });
      audit.server.status = 'error';
    } else {
      configChecks.push({ check: 'Server version', status: 'pass' });
    }

    // Check paths exist (if not in local/test mode)
    if (opts.docsPath && opts.docsPath !== '/documentation') {
      try {
        const docsExists = existsSync(opts.docsPath);

        configChecks.push({
          check: 'Documentation path',
          status: docsExists ? 'pass' : 'warning',
          ...(docsExists ? {} : { message: `Path does not exist: ${opts.docsPath}` })
        });
        if (!docsExists) {
          audit.server.status = audit.server.status === 'error' ? 'error' : 'degraded';
        }
      } catch {
        configChecks.push({
          check: 'Documentation path',
          status: 'warning',
          message: 'Could not verify path existence'
        });
      }
    }

    if (opts.llmsFilesPath && opts.llmsFilesPath !== '/llms-files') {
      try {
        const llmsExists = existsSync(opts.llmsFilesPath);

        configChecks.push({
          check: 'LLMs files path',
          status: llmsExists ? 'pass' : 'warning',
          ...(llmsExists ? {} : { message: `Path does not exist: ${opts.llmsFilesPath}` })
        });
        if (!llmsExists) {
          audit.server.status = audit.server.status === 'error' ? 'error' : 'degraded';
        }
      } catch {
        configChecks.push({
          check: 'LLMs files path',
          status: 'warning',
          message: 'Could not verify path existence'
        });
      }
    }

    // Check context state
    try {
      audit.context.optionsFrozen = Object.isFrozen(opts);
    } catch {
      audit.context.optionsFrozen = false;
    }

    // Health checks
    const healthChecks: Array<{ name: string; status: 'pass' | 'fail' | 'warning'; message?: string }> = [];

    // Check if options object is valid
    if (opts && typeof opts === 'object') {
      healthChecks.push({ name: 'Options object valid', status: 'pass' });
    } else {
      healthChecks.push({ name: 'Options object valid', status: 'fail', message: 'Options object is invalid' });
      audit.server.status = 'error';
    }

    // Check if required memo options exist
    if (opts.resourceMemoOptions && opts.toolMemoOptions) {
      healthChecks.push({ name: 'Memoization options', status: 'pass' });
    } else {
      healthChecks.push({
        name: 'Memoization options',
        status: 'warning',
        message: 'Memoization options may be missing'
      });
      if (audit.server.status === 'healthy') {
        audit.server.status = 'degraded';
      }
    }

    // Check URL regex
    if (opts.urlRegex && opts.urlRegex instanceof RegExp) {
      healthChecks.push({ name: 'URL regex pattern', status: 'pass' });
    } else {
      healthChecks.push({ name: 'URL regex pattern', status: 'fail', message: 'URL regex is invalid' });
      audit.server.status = 'error';
    }

    // Check separator
    if (opts.separator && typeof opts.separator === 'string') {
      healthChecks.push({ name: 'Content separator', status: 'pass' });
    } else {
      healthChecks.push({ name: 'Content separator', status: 'fail', message: 'Separator is missing or invalid' });
      audit.server.status = 'error';
    }

    // If includeDetails is true, add additional information
    if (includeDetails) {
      // Test file read capability (if docs path exists)
      if (opts.docsPath && opts.docsPath !== '/documentation') {
        try {
          const testFile = join(opts.docsPath, 'README.md');

          if (existsSync(testFile)) {
            await readFile(testFile, 'utf-8');
            healthChecks.push({ name: 'File read capability', status: 'pass' });
          } else {
            healthChecks.push({
              name: 'File read capability',
              status: 'warning',
              message: 'Test file not found, cannot verify file read'
            });
          }
        } catch (error) {
          healthChecks.push({
            name: 'File read capability',
            status: 'fail',
            message: `File read test failed: ${error}`
          });
          if (audit.server.status === 'healthy') {
            audit.server.status = 'degraded';
          }
        }
      }
    }

    audit.configuration.validation = configChecks;
    audit.health.checks = healthChecks;

    // Format output
    const output = [
      '# PatternFly MCP Server Audit Report',
      '',
      `**Timestamp:** ${audit.timestamp}`,
      `**Server Status:** ${audit.server.status.toUpperCase()}`,
      '',
      '## Server Information',
      `- **Name:** ${audit.server.name}`,
      `- **Version:** ${audit.server.version}`,
      `- **Status:** ${audit.server.status}`,
      '',
      '## Expected Tools',
      audit.tools.expected.map(tool => `- ${tool}`).join('\n'),
      `\n*${audit.tools.note}*`,
      '',
      '## Configuration',
      `- **Docs Host Mode:** ${audit.configuration.docsHost ? 'Enabled' : 'Disabled'}`,
      `- **Documentation Path:** ${audit.configuration.paths.docsPath}`,
      `- **LLMs Files Path:** ${audit.configuration.paths.llmsFilesPath}`,
      `- **Context Path:** ${audit.configuration.paths.contextPath}`,
      '',
      '### Configuration Validation',
      audit.configuration.validation
        .map(check => {
          const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';

          return `${icon} **${check.check}:** ${check.status}${check.message ? ` - ${check.message}` : ''}`;
        })
        .join('\n'),
      '',
      '## Context State',
      `- **Has Context:** ${audit.context.hasContext ? 'Yes' : 'No'}`,
      `- **Options Frozen:** ${audit.context.optionsFrozen ? 'Yes' : 'No'}`,
      '',
      '## Health Checks',
      audit.health.checks
        .map(check => {
          const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';

          return `${icon} **${check.name}:** ${check.status}${check.message ? ` - ${check.message}` : ''}`;
        })
        .join('\n')
    ].join('\n');

    return {
      content: [
        {
          type: 'text',
          text: output
        }
      ]
    };
  };

  return [
    'serverAudit',
    {
      description: 'Perform a basic diagnostic audit of the PatternFly MCP server. Returns server information, configuration validation, expected tools, context state, and health checks. Use this to verify the server is running correctly and diagnose issues.',
      inputSchema: {
        includeDetails: z
          .boolean()
          .optional()
          .describe('If true, includes additional detailed checks such as file read capability tests')
      }
    },
    callback
  ];
};

export { serverAuditTool };

