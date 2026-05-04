/**
 * POC: skill workflow (add-docs-links) as external tools + session skill resources.
 *
 * Workflow step text is loaded from `guidelines/skills/add-docs-links/SKILL.md`
 * (## Workflow section); not hardcoded in this file.
 *
 * Run from repo root after build:
 *   node dist/cli.js --log-stderr --tool ./docs/examples/toolPluginSkillWorkflowPoc.js
 *
 * On first run you may need `--plugin-isolation none` so the host can read
 * skill files under `guidelines/skills/add-docs-links/` (see docs/development.md).
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

/** @type {string[] | null} */
let workflowStepsCache = null;

/**
 * Slice of SKILL.md from "## Workflow" up to (but not including) the next "## " heading.
 *
 * @param {string} markdown - Full SKILL.md body
 * @returns {string}
 */
const extractWorkflowSection = markdown => {
  const start = markdown.match(/^## Workflow\s*$/m);

  if (!start || start.index === undefined) {
    return '';
  }

  const from = start.index + start[0].length;
  const tail = markdown.slice(from);
  const nextHeading = tail.match(/\n## (?!Workflow\b)/m);

  return nextHeading ? tail.slice(0, nextHeading.index) : tail;
};

/**
 * Split workflow section into one markdown string per numbered top-level item (1. … 2. …).
 * Trailing lines after the last number (e.g. **CI:**) stay attached to that step.
 *
 * @param {string} section
 * @returns {string[]}
 */
const parseNumberedWorkflowSteps = section => {
  const lines = section.split('\n');

  /** @type {string[][]} */
  const chunks = [];

  /** @type {string[]} */
  let current = [];

  for (const line of lines) {
    const isNewStep = /^\d+\.\s/.test(line);

    if (isNewStep) {
      if (current.length) {
        chunks.push(current);
      }

      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }

  if (current.length) {
    chunks.push(current);
  }

  return chunks.map(buf => buf.join('\n').trim()).filter(Boolean);
};

/**
 * @returns {Promise<string[]>}
 */
const getWorkflowStepsFromSkill = async () => {
  if (workflowStepsCache) {
    return workflowStepsCache;
  }

  const markdown = await readFile(join(skillDir, 'SKILL.md'), 'utf8');
  const section = extractWorkflowSection(markdown);
  const steps = parseNumberedWorkflowSteps(section);

  if (steps.length === 0) {
    throw new Error(
      'add-docs-links POC: could not parse any numbered steps from ## Workflow in SKILL.md'
    );
  }

  workflowStepsCache = steps;

  return workflowStepsCache;
};

/**
 * True when the step text points agents at reference.md (whitelist, entry format, etc.).
 *
 * @param {string} stepMarkdown
 */
const stepMentionsReferenceMd = stepMarkdown =>
  /\[reference\.md\]|`reference\.md`|reference\.md#/i.test(stepMarkdown);

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
    let stepCountNote = 'the numbered steps in SKILL.md';

    try {
      const steps = await getWorkflowStepsFromSkill();

      stepCountNote = String(steps.length);
    } catch {
      // keep generic note if SKILL.md cannot be read yet
    }

    const text = [
      '## PatternFly skill: add-docs-links (entry)',
      '',
      'Use this skill when the user asks to maintain **src/docs.json** (add/edit/remove rows, fix links, align tests/CI).',
      '',
      '### Workflow contract',
      '1. Call **patternflySkillWorkflow_addDocsLinks** with `{ "action": "start" }` to obtain a `workflowId`.',
      [
        '2. The server loads **',
        stepCountNote,
        '** workflow steps from `guidelines/skills/add-docs-links/SKILL.md` (section `## Workflow`). ',
        'For each step, do the work, then call **patternflySkillWorkflow_addDocsLinks** with ',
        '`{ "action": "advance", "workflowId": "<id>", "stepCompleted": true }`.'
      ].join(''),
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
    'Step-driven workflow for the add-docs-links skill. Steps are read from SKILL.md ## Workflow; session state lives in the tools host; registers full reference.md when a step cites it.',
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
    let guides;

    try {
      guides = await getWorkflowStepsFromSkill();
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: [
              '**Workflow unavailable** — could not read or parse `guidelines/skills/add-docs-links/SKILL.md`.',
              '',
              String(err?.message || err),
              '',
              'Ensure the plugin runs from the repo (or paths are readable) and try `--plugin-isolation none` for local development.'
            ].join('\n')
          }
        ]
      };
    }

    const stepCount = guides.length;
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
            text: `**Status** — workflow \`${workflowId}\` is on **step ${st.step} / ${stepCount}**.\n\n${guides[st.step - 1]}`
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
              guides[0],
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

      if (st.step > stepCount) {
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

      if (st.step > stepCount) {
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
        `Now on **step ${st.step} / ${stepCount}** (after your confirmation).`,
        '',
        guides[st.step - 1],
        ''
      ];

      if (st.step < stepCount) {
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

      if (stepMentionsReferenceMd(guides[st.step - 1])) {
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
