#!/usr/bin/env node
import { main } from './index';

main({ mode: 'cli' }).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
