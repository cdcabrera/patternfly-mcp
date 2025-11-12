import { join } from 'node:path';
import { getOptions } from './options.context';

/**
 * Get local documentation paths
 * Uses context options to get the correct docsPath
 */
const getLocalDocs = () => {
  const options = getOptions();

  return [
    `[@patternfly/react-charts](${join(options.docsPath, 'charts', 'README.md')})`,
    `[@patternfly/react-chatbot](${join(options.docsPath, 'chatbot', 'README.md')})`,
    `[@patternfly/react-component-groups](${join(options.docsPath, 'component-groups', 'README.md')})`,
    `[@patternfly/react-components](${join(options.docsPath, 'components', 'README.md')})`,
    `[@patternfly/react-guidelines](${join(options.docsPath, 'guidelines', 'README.md')})`,
    `[@patternfly/react-resources](${join(options.docsPath, 'resources', 'README.md')})`,
    `[@patternfly/react-setup](${join(options.docsPath, 'setup', 'README.md')})`,
    `[@patternfly/react-troubleshooting](${join(options.docsPath, 'troubleshooting', 'README.md')})`
  ];
};

// Export function directly - LOCAL_DOCS is now computed lazily via getLocalDocs()
// This ensures context is available when called
export { getLocalDocs };
