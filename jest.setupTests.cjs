// Shared helpers for all Jest tests

const SEP = '\n\n---\n\n';

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactAbsolutePaths(str = '') {
  // Replace any absolute path up to /documentation or /llms-files with a placeholder
  return String(str).replace(
    /(^|\s)(?:[A-Za-z]:)?[\\/][^\s]*?(?=(?:[\\/](documentation|llms-files)))/g,
    '$1<PROJECT_ROOT>'
  );
}

function countOccurrences(haystack, needle) {
  const m = haystack.match(new RegExp(escapeForRegex(needle), 'g'));
  return m ? m.length : 0;
}

function normalizeContentResponse(text) {
  const redacted = redactAbsolutePaths(String(text));
  const headerMatches = redacted.match(/^# Documentation from .*$/gm) || [];
  const firstHeader = headerMatches[0] || '';
  return {
    headerCount: headerMatches.length,
    separatorCount: countOccurrences(redacted, SEP),
    firstHeader,
    preview: redacted.slice(0, 300),
    length: redacted.length,
  };
}

global.__TESTS__ = { SEP, normalizeContentResponse };
