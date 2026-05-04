import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type McpResource } from './server';
import { getOptions, getSessionOptions, runWithOptions } from './options.context';
import { getSkillArtifact, MAX_ARTIFACTS_PER_SESSION } from './server.skillArtifacts';
import { stringJoin } from './server.helpers';

/**
 * Name of the resource.
 */
const NAME = 'patternfly-skills-artifact';

/**
 * URI template for session-scoped skill artifact bodies (populated via tool workflow + IPC).
 */
const URI_TEMPLATE = 'patternfly://skills/{id}';

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly skill workflow artifact',
  description:
    'Full markdown (or other text) for a skill step, cached for this MCP session after a workflow tool registers it. Use the preview from the tool response, then read this URI for the complete body.',
  mimeType: 'text/markdown' as const
};

/**
 * Resource read callback.
 *
 * @param passedUri - Requested URI
 * @param variables - Template variables (`id`)
 */
const resourceCallback = async (passedUri: URL, variables: Record<string, string | string[]>) => {
  const rawId = variables?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const safeId = typeof id === 'string' ? id.trim() : '';
  const uri = safeId ? `patternfly://skills/${encodeURIComponent(safeId)}` : passedUri?.toString?.() || URI_TEMPLATE;
  const sessionId = getSessionOptions().sessionId;
  const body = getSkillArtifact(sessionId, uri);

  if (!body) {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: stringJoin.newline(
            '# Skill artifact unavailable',
            '',
            `No cached body for \`${uri}\`.`,
            '',
            `- Run the **add-docs-links skill workflow** tool step first so the server can register this URI.`,
            `- Bodies are session-scoped and capped at **${MAX_ARTIFACTS_PER_SESSION}** URIs; older entries may have been evicted.`,
            `- Stopping the Tools Host clears this cache.`
          )
        }
      ]
    };
  }

  return {
    contents: [
      {
        uri,
        mimeType: body.mimeType,
        text: body.text
      }
    ]
  };
};

/**
 * Resource creator for skill workflow artifacts.
 *
 * @param options - Global options
 * @returns MCP resource tuple
 */
const patternFlySkillsResource = (options = getOptions()): McpResource => {
  const template = new ResourceTemplate(URI_TEMPLATE, { list: undefined });

  const callback: McpResource[3] = async (uri, variables) =>
    runWithOptions(options, async () => resourceCallback(uri, variables));

  return [NAME, template, CONFIG, callback];
};

export { patternFlySkillsResource, resourceCallback, NAME, URI_TEMPLATE, CONFIG };
