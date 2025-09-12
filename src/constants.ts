import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const DocsRootDir = 'https://raw.githubusercontent.com/patternfly/patternfly-org/refs/heads/main/packages/documentation-site/patternfly-docs/content';
export const DesignGuidelinesDir = `${DocsRootDir}/design-guidelines`;
export const AccessibilityDir = `${DocsRootDir}/accessibility`;

export const ChartsDocsRootDir = 'https://raw.githubusercontent.com/patternfly/patternfly-react/refs/heads/main/packages/react-charts/src';

// Re-export doc arrays so consumers can import from a single module
export { ComponentDocs } from './componentDocs.js';
export { LayoutDocs } from './layoutDocs.js';
export { ChartDocs } from './chartDocs.js';

// Absolute paths to local README files used by the tool description and tests
const docsRoot = join(process.cwd(), 'documentation');

export const LocalReadmes: string[] = [
  join(docsRoot, 'charts', 'README.md'),
  join(docsRoot, 'chatbot', 'README.md'),
  join(docsRoot, 'component-groups', 'README.md'),
  join(docsRoot, 'components', 'README.md'),
  join(docsRoot, 'guidelines', 'README.md'),
  join(docsRoot, 'resources', 'README.md'),
  join(docsRoot, 'setup', 'README.md'),
  join(docsRoot, 'troubleshooting', 'README.md'),
];

export const localReadmeLinks: string[] = [
  { label: '@patternfly/react-charts', path: LocalReadmes[0] },
  { label: '@patternfly/react-chatbot', path: LocalReadmes[1] },
  { label: '@patternfly/react-component-groups', path: LocalReadmes[2] },
  { label: '@patternfly/react-components', path: LocalReadmes[3] },
  { label: '@patternfly/react-guidelines', path: LocalReadmes[4] },
  { label: '@patternfly/react-resources', path: LocalReadmes[5] },
  { label: '@patternfly/react-setup', path: LocalReadmes[6] },
  { label: '@patternfly/react-troubleshooting', path: LocalReadmes[7] },
].map(({ label, path }) => `[${label}](${path})`);

export const allDocTargets = (
  components: string[] = [],
  layouts: string[] = [],
  charts: string[] = [],
  locals: string[] = LocalReadmes
): string[] => Array.from(new Set<string>([...components, ...layouts, ...charts, ...locals]));
