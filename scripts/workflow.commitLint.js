/** This is a temporary script meant to get up and running fast. It will be replaced. **/
/**
 * Available message scope types.
 *
 * @type {Array<string>}
 */
const MESSAGE_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert'
];

/**
 * Parse a commit message
 *
 * @param {object} params
 * @param {string} params.hash
 * @param {string} params.message
 * @param {Array} messageTypes
 * @returns {{scope: string, description: string, type: string, prNumber: string, hash: string,
 *     typeScope: string, isBreaking: boolean, original: string, message: string, length: number}}
 */
const parseCommitMessage = ({ hash, message }, messageTypes = MESSAGE_TYPES) => {
  let output;

  const trimmedMessage = message.trim();
  const firstColonIndex = trimmedMessage.indexOf(':');
  const baseTypeScope = trimmedMessage.substring(0, firstColonIndex);
  const descriptionEtAll = trimmedMessage.substring(firstColonIndex + 1).trim();
  const prMatch = descriptionEtAll.match(/\s\(#(\d+)\)$/);

  let prNumber = undefined;
  let description = descriptionEtAll;

  if (prMatch) {
    prNumber = prMatch[1];
    description = descriptionEtAll.replace(/\s\(#(\d+)\)$/, '').trim();
  }

  const typeScope = baseTypeScope.replace(/!$/, '').trim();
  let type = typeScope;
  let scope = '';

  if (typeScope.includes('(')) {
    const [splitType, splitScope] = typeScope.split('(');

    type = splitType?.trim();
    scope = splitScope?.split(')')?.[0]?.trim();
  }

  output = {
    hash,
    typeScope: typeScope || undefined,
    type: messageTypes.includes(type) && type ? type : undefined,
    scope: scope.split(')')[0] || undefined,
    description,
    prNumber,
    isBreaking: /!$/.test(baseTypeScope)
  };

  if (!output.type || (output.type && !descriptionEtAll?.length)) {
    const descriptionEtAllFallback = message.trim().split(/\s/);
    const [descriptionFallback, ...partialPrFallback] = descriptionEtAllFallback.join(' ').trim().split(/\(#/);

    output = {
      hash,
      typeScope: undefined,
      type: undefined,
      scope: undefined,
      description: descriptionFallback.trim(),
      prNumber: (partialPrFallback.join('(#').trim() || '').replace(/\D/g, '') || undefined,
      isBreaking: undefined
    };
  }

  const updatedMessage = [
    `${output.typeScope || ''}${(output.isBreaking && '!') || ''}${(output.typeScope && ':') || ''}`,
    output.description
  ]
    .filter(value => Boolean(value))
    .join(' ')
    .trim();

  return {
    ...output,
    messageLength: updatedMessage?.length || 0,
    message: updatedMessage,
    original: message
  };
};

/**
 * Apply valid/invalid checks.
 *
 * @param {Array} parsedMessages
 * @param {object} options Default options, update accordingly
 * @param {Array|string|undefined} options.issueNumberExceptions An "undefined" or "false" or "falsy" value
 *     will ignore issue numbers. A string of "*" will allow every type. An array of issue types can be used
 *     to identify which commit message type scopes to ignore, i.e. ['chore', 'fix', 'build', 'perf'].
 *     See NPM conventional-commit-types for full listing options, https://bit.ly/2L0yr6I
 * @param {number} options.maxMessageLength Max length of the main message string. Messages considered "body"
 *     do not count against this limit.
 * @param {Array|string|undefined} options.typeScopeExceptions see options.issueNumberExceptions
 * @returns {Array}
 */
const messagesList = (
  parsedMessages,
  {
    issueNumberExceptions = ['build', 'chore', 'ci', 'docs', 'fix', 'perf', 'refactor', 'test'],
    maxMessageLength = 65,
    typeScopeExceptions = '*'
  } = {}
) =>
  parsedMessages.map(
    ({ messageLength = 0, type = null, scope = null, description = null, message = null, hash = null }) => {
      const typeValid =
        (type && 'valid') || 'INVALID: type (expected known types and format "<type>:" or "<type>(<scope>):")';

      let scopeException = !typeScopeExceptions || !typeScopeExceptions?.length || typeScopeExceptions === '*';

      if (!scopeException && Array.isArray(typeScopeExceptions)) {
        scopeException = typeScopeExceptions.includes(type);
      }

      const scopeValid = (scopeException && 'valid') || (scope && 'valid') || 'INVALID: scope';

      let issueNumberException =
        !issueNumberExceptions || !issueNumberExceptions?.length || issueNumberExceptions === '*';

      if (!issueNumberException && Array.isArray(issueNumberExceptions)) {
        issueNumberException = issueNumberExceptions.includes(type);
      }

      const isIssueNumber = /(^[a-zA-Z]+[/-]+[0-9]+)/.test(description);
      // Note: skip issueNumber validation if typeValid fails, this is on purpose
      const issueNumberValid =
        (typeValid !== 'valid' && 'valid') ||
        (issueNumberException && 'valid') ||
        (isIssueNumber && 'valid') ||
        'INVALID: issue number (expected format "<desc>/<number>" or "<desc>-<number>")';

      const descriptionValid = (description && 'valid') || 'INVALID: description (missing description)';

      const lengthValid =
        (messageLength <= maxMessageLength && 'valid') ||
        `INVALID: message length (${messageLength} > ${maxMessageLength})`;

      return {
        hash,
        commit: message,
        type: typeValid,
        scope: scopeValid,
        description: descriptionValid,
        issueNumber: issueNumberValid,
        length: lengthValid
      };
    }
  );

/**
 * If commits exist, lint them.
 *
 * @param {string} commits
 * @returns {{resultsArray: Array, resultsString: string}}
 */
const start = commits => {
  const lintResults = { resultsArray: [], resultsString: '' };

  if (commits) {
    const updatedCommits = commits
      .map(({ sha, commit } = {}) => parseCommitMessage({
        hash: sha.substring(0, 7),
        message: (commit.message || 'empty').split('\n')[0]
      }));
    let filteredResults = messagesList(updatedCommits);

    filteredResults.forEach(obj => {
      const updatedObj = obj;

      Object.entries(updatedObj).forEach(([key, value]) => {
        if (value === 'valid') {
          delete updatedObj[key];
        }
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filteredResults = filteredResults.filter(({ hash, commit, ...rest }) => Object.keys(rest).length > 0);
    lintResults.resultsArray = filteredResults;
    lintResults.resultsString = JSON.stringify(filteredResults, null, 2);
  }

  return lintResults;
};

export { messagesList, parseCommitMessage, start, MESSAGE_TYPES };
