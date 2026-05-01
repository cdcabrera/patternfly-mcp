#!/usr/bin/env node

import packageJson from '../package.json';
import { getNodeMajorVersion } from './options.helpers';

/**
 * CLI entry point with early error catching for environment and load-time issues.
 */
const run = async () => {
  const appBugs = packageJson.bugs?.url;
  const appName = packageJson.name;
  const appTroubleshoot = packageJson.support?.url;
  const appMinNodeMajorVersion = getNodeMajorVersion(packageJson.engines?.node);
  const envNodeMajorVersion = getNodeMajorVersion(process.versions?.node);

  if (envNodeMajorVersion < appMinNodeMajorVersion) {
    const error = new Error(
      `Node.js version ${envNodeMajorVersion} found but ${appMinNodeMajorVersion} or higher is required. Update Node.js and try again.`
    );

    console.error(`Failed to start ${appName}.`, error.message);
    process.exit(1);
  }

  let main;

  const processExit = (message: string, error: unknown) => {
    console.error(message, error instanceof Error ? error.message : error);

    if (appTroubleshoot) {
      console.error(`\nFor troubleshooting guidance visit:\n${appTroubleshoot}`);
    }

    if (appBugs) {
      console.error(`\nTo report bugs visit:\n${appBugs}`);
    }
    process.exit(1);
  };

  try {
    const module = await import('./index');

    main = module.main;
  } catch (error) {
    processExit(`Failed to load ${appName}`, error);

    return;
  }

  try {
    await main({ mode: 'cli' });
  } catch (error) {
    processExit(`${appName} runtime error`, error);
  }
};

run();
