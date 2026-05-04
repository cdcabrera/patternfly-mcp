/**
 * POC: skill workflow (add-docs-links) as external tools + session skill resources.
 *
 * Run from repo root after build:
 *   node dist/cli.js --log-stderr --tool ./docs/examples/toolPluginSkillWorkflowPoc.js
 *
 * On first run you may need `--plugin-isolation none` so the host can read
 * `guidelines/skills/add-docs-links/reference.md` (see docs/development.md).
 *
 * Node.js >= 22 for external tool plugins.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpTool } from '@patternfly/patternfly-mcp';

const __dirname = dirname(fileURLToPath(import.meta.url));

const skillDir = join(__dirname, '../../guidelines/skills/add-docs-links');

/** @type {Map<string, { step: number }>} */
const workflows = new Map();

/** @type {Map<string, string>} */
const referenceFullByWorkflow = new Map();

const STEP_COUNT = 8;

const STEP_GUIDES = [
  `**Step 1 — Resolve raw URL and ref**  
Map GitHub links to a **raw** \`https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{file}\` URL. Prefer the same ref already used in \`docs.json\` for that repo. For a new \`patternfly/<repo>\`, open \`src/__tests__/docs.json.test.ts\` if \`baseHashes\` may need updating — do not guess counts from the skill text alone.`,

  `**Step 2 — Whitelist**  
Each \`path\` must match \`patternflyOptions.urlWhitelist\` in \`src/options.defaults.ts\`. HTTPS only. Do not widen the whitelist in a catalog-only PR. See the linked **reference** resource for allowed domains.`,

  `**Step 3 — Reachability**  
Verify HTTP **2xx** for each URL (for example \`curl -sI\`). Do not add dead links.`,

  `**Step 4 — Unique \`path\`**  
Each \`path\` must appear exactly once in the whole catalog.`,

  `**Step 5 — Placement in \`docs\`**  
New top-level keys: append as the **last** property inside \`"docs"\`. New rows in an existing array: append to the **end** unless the user specifies order.`,

  `**Step 6 — Entry shape**  
Match field types to **reference.md — Entry format**. Copy \`section\` / \`category\` from the closest similar row when unsure.`,

  `**Step 7 — \`meta\` and \`generated\`**  
\`meta.totalEntries\` = number of keys in \`docs\`. \`meta.totalDocs\` = total objects across arrays. \`generated\` = \`new Date().toISOString()\`.`,

  `**Step 8 — Tests**  
From repo root: \`npm test\` or scoped Jest. Update snapshots only where catalog-driven output changed. CI: \`.github/workflows/audit.yml\` on PRs touching \`src/docs.json\`.`
];

const previewSlice = (text, max = 220) => {
  const t = text.replace(/\s+/g, ' ').trim();

  return t.length <= max ? t : `${t.slice(0, max)}…`;
};

const referenceUri = workflowId => `patternfly://skills/${workflowId}-reference`;

const loadReferenceFull = async workflowId => {
  if (referenceFullByWorkflow.has(workflowId)) {
    return referenceFullByWorkflow.get(workflowId);
  }

  const full = await readFile(join(skillDir, 'reference.md'), 'utf8');

  referenceFullByWorkflow.set(workflowId, full);

  return full;
};

const entryTool = {
  name: 'patternflySkillEntry_addDocsLinks',
  description:
    'Entry instructions for the add-docs-links skill (docs.json catalog). Use when the user wants to add, edit, or remove documentation links. Points agents to the step workflow tool.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  async handler() {
    const text = [
      '## PatternFly skill: add-docs-links (entry)',
      '',
      'Use this skill when the user asks to maintain **src/docs.json** (add/edit/remove rows, fix links, align tests/CI).',
      '',
      '### Workflow contract',
      '1. Call **patternflySkillWorkflow_addDocsLinks** with `{ "action": "start" }` to obtain a `workflowId`.',
      '2. For each numbered step, do the work in your environment, then call **patternflySkillWorkflow_addDocsLinks** with `{ "action": "advance", "workflowId": "<id>", "stepCompleted": true }`.',
      '3. Use **patternflySkillWorkflow_addDocsLinks** `{ "action": "status", "workflowId": "<id>" }` if you need the current step.',
      '4. When a response includes `type: "resource"` with `patternfly://skills/...`, treat the inline `text` as a **preview**; call MCP **resources/read** on the same URI for the **full** body (cached for this session).',
      '',
      '### Source of truth',
      'Canonical skill files live under `guidelines/skills/add-docs-links/` in this repository (POC). A future catalog sync may mirror published skills from **patternfly/ai-helpers** via `docs.json` raw URLs.'
    ].join('\n');

    return {
      content: [{ type: 'text', text }]
    };
  }
};

const workflowTool = {
  name: 'patternflySkillWorkflow_addDocsLinks',
  description:
    'Step-driven workflow for the add-docs-links skill. Session state in the tools host; registers full reference.md for MCP resources/read on steps that need it.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'advance', 'status'],
        description: 'start = new workflow; advance = confirm and move to next step; status = current step'
      },
      workflowId: {
        type: 'string',
        description: 'Returned from action=start; required for advance and status'
      },
      stepCompleted: {
        type: 'boolean',
        description: 'Required for advance: set true after finishing the current step in your workspace'
      }
    },
    required: ['action'],
    additionalProperties: false
  },
  async handler(args = {}) {
    const { action, workflowId, stepCompleted } = args;

    if (action === 'status') {
      if (!workflowId || typeof workflowId !== 'string') {
        return {
          content: [{ type: 'text', text: '`workflowId` is required for status.' }]
        };
      }

      const st = workflows.get(workflowId);

      if (!st) {
        return {
          content: [{ type: 'text', text: `Unknown workflowId "${workflowId}". Call action=start first.` }]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `**Status** — workflow \`${workflowId}\` is on **step ${st.step} / ${STEP_COUNT}**.\n\n${STEP_GUIDES[st.step - 1]}`
          }
        ]
      };
    }

    if (action === 'start') {
      const id = randomUUID();

      workflows.set(id, { step: 1 });

      return {
        content: [
          {
            type: 'text',
            text: [
              `Started workflow \`${id}\` (add-docs-links).`,
              '',
              STEP_GUIDES[0],
              '',
              'When step 1 is done in your workspace, call this tool with:',
              `\`{ "action": "advance", "workflowId": "${id}", "stepCompleted": true }\``
            ].join('\n')
          }
        ]
      };
    }

    if (action === 'advance') {
      if (!workflowId || typeof workflowId !== 'string') {
        return {
          content: [{ type: 'text', text: '`workflowId` is required for advance.' }]
        };
      }

      if (stepCompleted !== true) {
        return {
          content: [
            {
              type: 'text',
              text: 'Set **stepCompleted** to **true** only after you have finished the current step in the repo. Then call advance again.'
            }
          ]
        };
      }

      const st = workflows.get(workflowId);

      if (!st) {
        return {
          content: [{ type: 'text', text: `Unknown workflowId "${workflowId}". Call action=start first.` }]
        };
      }

      if (st.step > STEP_COUNT) {
        return {
          content: [
            {
              type: 'text',
              text: `Workflow \`${workflowId}\` is already **complete**. Call action=start for a new run.`
            }
          ]
        };
      }

      st.step += 1;

      if (st.step > STEP_COUNT) {
        workflows.delete(workflowId);
        referenceFullByWorkflow.delete(workflowId);

        return {
          content: [
            {
              type: 'text',
              text: [
                `**Workflow complete** for \`${workflowId}\`.`,
                '',
                'Run tests from the repo root and follow CI expectations for `docs.json` PRs.',
                '',
                'You can call `action=start` to begin a new workflow.'
              ].join('\n')
            }
          ]
        };
      }

      const lines = [
        `Now on **step ${st.step} / ${STEP_COUNT}** (after your confirmation).`,
        '',
        STEP_GUIDES[st.step - 1],
        ''
      ];

      if (st.step < STEP_COUNT) {
        lines.push(
          'When this step is done, call:',
          `\`{ "action": "advance", "workflowId": "${workflowId}", "stepCompleted": true }\``
        );
      } else {
        lines.push(
          'This is the **last** step. When finished, call advance with `stepCompleted: true` once more to close the workflow.'
        );
      }

      const content = [{ type: 'text', text: lines.join('\n') }];

      /** @type {Record<string, { mimeType: string; text: string }>} */
      const _pfSkillArtifactMap = {};

      if (st.step === 2 || st.step === 6) {
        const full = await loadReferenceFull(workflowId);
        const uri = referenceUri(workflowId);

        _pfSkillArtifactMap[uri] = { mimeType: 'text/markdown', text: full };
        content.push({
          type: 'resource',
          resource: {
            uri,
            mimeType: 'text/markdown',
            text: previewSlice(full)
          }
        });
        const withResource = [
          lines[0],
          lines[1],
          lines[2],
          '',
          'Attached **reference.md** as an embedded resource (preview above). Read the **full** file via MCP `resources/read` on:',
          `\`${uri}\``,
          '',
          ...lines.slice(3)
        ];

        content[0] = { type: 'text', text: withResource.join('\n') };
      }

      if (Object.keys(_pfSkillArtifactMap).length > 0) {
        return {
          content,
          _pfSkillArtifactMap
        };
      }

      return { content };
    }

    return {
      content: [{ type: 'text', text: `Unknown action "${action}".` }]
    };
  }
};

export default createMcpTool([entryTool, workflowTool]);
