import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './mcpSdk';
import { processDocsFunction, type ProcessedDoc } from './server.getResources';
import { stringJoin } from './server.helpers';
import {
  assertInput,
  assertInputStringLength,
  assertInputStringArrayEntryLength,
  assertInputStringNumberEnumLike,
  assertInputUrlWhiteListed
} from './server.assertions';
import { getOptions } from './options.context';
import { getPatternFlyMcpResources, getPatternFlyComponentSchema, setCategoryDisplayLabel } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { resolvePatternFlyResources, resolvePatternFlyUrls } from './resource.helpers';

/**
 * usePatternFlyDocs tool function
 *
 * @param options
 * @returns MCP tool tuple [name, schema, callback]
 */
const usePatternFlyDocsTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { urlList, name, version } = args;
    const isUrlList = Array.isArray(urlList) && urlList.length > 0;
    const isName = typeof name === 'string';
    const isVersion = typeof version === 'string';

    assertInput(
      !((isUrlList && isName) || (!isUrlList && !isName)),
      `Provide either a string "name" OR an array of strings "urlList".`
    );

    if (isName) {
      assertInputStringLength(name, {
        ...options.minMax.inputStrings,
        inputDisplayName: 'name'
      });
    }

    if (isUrlList) {
      assertInputStringArrayEntryLength(urlList, {
        ...options.minMax.urlString,
        inputDisplayName: 'urlList'
      });

      assertInput(
        urlList.length <= options.minMax.docsToLoad.max,
        `"urlList" must be an array with a maximum length of ${options.minMax.docsToLoad.max} items.`
      );

      if (options.mode !== 'test') {
        assertInputUrlWhiteListed(
          urlList,
          options.patternflyOptions.urlWhitelist,
          { inputDisplayName: 'urlList' }
        );
      }
    }

    if (isVersion) {
      assertInputStringLength(version, {
        max: options.minMax.inputStrings.max,
        min: 2,
        inputDisplayName: 'version'
      });

      assertInputStringNumberEnumLike(version, options.patternflyOptions.availableSearchVersions, {
        inputDisplayName: 'version'
      });
    }

    const { latestVersion, latestSchemasVersion, byPath } = await getPatternFlyMcpResources.memo();
    const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(version);
    const updatedVersion = normalizedVersion || latestVersion;

    const docs: ProcessedDoc[] = [];
    const schemaResults = [];
    const docResults = [];

    try {
      if (isName) {
        const { docs: resolvedDocs } = await resolvePatternFlyResources({
          name,
          version: updatedVersion
        }, options);

        docs.push(...resolvedDocs);
      } else if (isUrlList) {
        const slicedUrlList = urlList.slice(0, options.minMax.docsToLoad.max);
        const resolvedUrls = await resolvePatternFlyUrls(slicedUrlList);
        const processedDocs = await processDocsFunction.memo(resolvedUrls);

        docs.push(...processedDocs);
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch documentation: ${error}`
      );
    }

    const schemasSeen = new Set<string>();

    for (const doc of docs) {
      const patternFlyEntry = doc.path ? byPath[doc.path] : undefined;
      const entryName = patternFlyEntry?.name;
      const entryVersion = patternFlyEntry?.version;
      const entryVersionDisplay = (entryVersion && `(${entryVersion}) `) || '';
      const docTitle = patternFlyEntry
        ? `# Documentation for ${patternFlyEntry.displayName || entryName} ${entryVersionDisplay}[${setCategoryDisplayLabel(patternFlyEntry)}]`
        : `# Content for ${doc.path}`;

      docResults.push(stringJoin.newline(
        docTitle,
        `Source: ${doc.path}`,
        '',
        doc.content
      ));

      if (latestSchemasVersion === entryVersion && entryName && !schemasSeen.has(entryName)) {
        schemasSeen.add(entryName);
        const componentSchema = await getPatternFlyComponentSchema.memo(entryName);

        if (componentSchema) {
          schemaResults.push(stringJoin.newline(
            `# Component Schema for ${entryName} ${entryVersionDisplay}`,
            `This machine-readable JSON schema defines the component's props, types, and validation rules.`,
            '```json',
            JSON.stringify(componentSchema, null, 2),
            '```'
          ));
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: [...docResults, ...schemaResults].join(options.separator)
        }
      ]
    };
  };

  return [
    'usePatternFlyDocs',
    {
      description: `Get markdown documentation and component JSON schemas for PatternFly resources and components.

      **Usage**:
        1. Input a component or resource name (e.g., "Button", "Writing") or a list of up to ${options.minMax.docsToLoad.max} documentation URIs, URLs at a time (typically from searchPatternFlyDocs results).

      **Returns**:
        - Markdown documentation
        - Component JSON schemas, if available
      `,
      inputSchema: {
        urlList: z.array(z.string().url().min(options.minMax.urlString.min).max(options.minMax.urlString.max)).max(options.minMax.docsToLoad.max)
          .optional().describe(`The list of URLs to fetch the documentation from (max ${options.minMax.docsToLoad.max} at a time)`),
        name: z.string().max(options.minMax.inputStrings.max)
          .optional().describe('The name of a PatternFly component or resource to fetch documentation for (e.g., "Button", "Table", "Writing")'),
        version: z.enum(options.patternflyOptions.availableSearchVersions)
          .optional().describe(`Filter results by a specific PatternFly version (e.g. ${options.patternflyOptions.availableSearchVersions.map(value => `"${value}"`).join(', ')})`)
      }
    },
    callback
  ];
};

/**
 * A tool name, typically the first entry in the tuple. Used in logging and deduplication.
 */
usePatternFlyDocsTool.toolName = 'usePatternFlyDocs';

export { usePatternFlyDocsTool };
