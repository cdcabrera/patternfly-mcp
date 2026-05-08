import fs from 'node:fs';

/**
 * Confirm specific authors/contributors from an available CODEOWNERS file.
 *
 * @note This check will pull authors/contributors regardless of CODEOWNERS' rights.
 *
 * @param params - Passed author parameters for review.
 * @param params.author
 * @param params.authorType
 * @param params.authorRole
 * @param options - Optional settings
 * @param options.allowBot - Allow known bots to skip preCheck
 * @returns {boolean} A `boolean` indicating whether an author/contributor is allowed to skip pre-checks.
 */
const coreContributors = ({ author, authorType, authorRole } = {}, { allowBot = true } = {}) => {
  const bots = ['Bot', 'dependabot[bot]'];
  const contributors = ['OWNER', 'MEMBER'];
  const codeOwnersPaths = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];

  const isBot = allowBot && (bots.includes(authorType) || bots.includes(author));
  const isMaintainer = contributors.includes(authorRole);
  let isCodeOwner = false;

  for (const filePath of codeOwnersPaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (new RegExp(`@${author}\\b`).test(content)) {
      isCodeOwner = true;
    }
  }

  return isBot || isMaintainer || isCodeOwner;
};

/**
 * Check if a maintainer has issued a `/bypass` command.
 *
 * @param {object} params
 * @param {object[]} params.comments - List of PR comments.
 * @returns {boolean} True if a valid bypass command is found.
 */
const coreContributorsBypass = ({ comments } = {}) => {
  const updatedComments = Array.isArray(comments) ? comments : [];
  const bypassCommand = '/bypass';

  return updatedComments.some(comment =>
    comment.body?.trim()?.toLowerCase()?.startsWith(bypassCommand) &&
    coreContributors({
      author: comment.user?.login || comment.author?.login,
      authorType: comment.user?.type || comment.author?.type,
      authorRole: comment.author_association
    }, { allowBot: false }));
};

/**
 * Does one list contain another list's values?
 *
 * @param {string[]} listBase - Base array of strings to match.
 * @param {string[]} listCheck - Array of strings to confirm matches in base.
 * @returns {string[]} An array of value matches.
 */
const doesListContainAnotherListValues = (listBase, listCheck) =>
  ((Array.isArray(listBase) && listBase) || [])
    .filter(file => {
      const updatedFileName = file?.filename?.trim()?.toLowerCase() || undefined;
      const updatedListCheck = (Array.isArray(listCheck) && listCheck) || [];

      if (!updatedFileName) {
        return false;
      }

      return updatedListCheck.includes(updatedFileName) ||
        updatedListCheck.some(
          item => (updatedFileName.startsWith(item) || updatedFileName.endsWith(item) || updatedFileName.includes(item) || item.includes(updatedFileName))
        );
    }).map(file => file?.filename);

/**
 * Scan available updates for signature using basic logic.
 *
 * @param params - Passed code parameters for review.
 * @param params.body
 * @param params.changedFiles
 * @param params.fileCount
 * @param params.handshakeStatus
 * @returns {{commentSignature: string, errors: *[], isMaxFilesUpdated: boolean, isPrTemplateModified: boolean, hasTell: boolean}} An `object` containing code scan results.
 */
const signatureScan = ({ body, changedFiles, fileCount, handshakeStatus } = {}) => {
  // Make sure this is within the PR template, or we'll get false positives.
  const prTemplateStr = '<!-- GH_PR_METADATA_V1_789 -->';

  // Max file updates outside of core contributors before alerting.
  const fileChangeLimit = 15;

  // Signature checks. This can be a list of existing or non-existent files, directories, and/or extensions.
  const fileAndDirsList = [
    '.aiignore',
    '.gitignore',
    '.js',
    '.npmrc',
    '.sh',
    '__mocks__',
    '__fixtures__',
    '.agents',
    '.github',
    '.claude',
    '.cursor',
    '.junie',
    'scripts/workflow',
    'src/cli',
    'src/declarations',
    'src/fixtures',
    'src/patternFly.getResources',
    'src/mocks',
    'src/index',
    'src/mcpSdk',
    'src/resource.',
    'src/server',
    'src/tool.',
    'tests/audit',
    'tests/e2e'
  ];

  // Other signature checks.
  const generalList = [
    'tests/e2e/utils/stdioTransportClient.ts',
    'tests/e2e/__snapshots__/stdioTransport.test.ts.snap'
  ];

  try {
    const isMaxFilesUpdated = typeof fileCount === 'number' ? fileCount > fileChangeLimit : undefined;
    const isPrTemplateModified = typeof body === 'string' ? body.includes(prTemplateStr) === false : undefined;

    const filesModified = doesListContainAnotherListValues(changedFiles, fileAndDirsList);
    const isSignatureModified = filesModified.length > 0;

    const tellsModified = doesListContainAnotherListValues(changedFiles, generalList);
    const isGeneralModified = tellsModified.length === generalList.length;

    // Aggregate errors
    const errors = [];

    // Handshake-specific messaging
    if (handshakeStatus === 'declined') {
      errors.push(`🚫 I've noticed you've declined the contributor agreement. I've paused all automation for this PR until you're ready to proceed.`);
    } else if (handshakeStatus === 'pending') {
      errors.push(`👋 I'm waiting for your handshake! Please give my comment below a 👍 to confirm you've read our guidelines and unlock the testing suite.`);
    }

    if (isMaxFilesUpdated === true) {
      errors.push(`⚠️ You've updated a lot of files (${fileCount}/${fileChangeLimit}). To keep things focused, please try to limit the scope of your PR as suggested in our guidelines.`);
    }

    if (isSignatureModified) {
      errors.push(`⚠️ I've detected core modifications to behavior or testing (${filesModified.join(', ')}). These changes usually require a bit more planning—check the guidelines for details.`);
    }

    return {
      errors,
      isGeneralModified,
      isMaxFilesUpdated: isMaxFilesUpdated === true,
      isPrTemplateModified: isPrTemplateModified === true,
      isSignatureModified,
      hasFailed: false,
      hasHandshake: handshakeStatus === 'confirmed',
      isDeclined: handshakeStatus === 'declined',
      hasTell: isGeneralModified && isMaxFilesUpdated === true && isPrTemplateModified === true && isSignatureModified
    };
  } catch (e) {
    console.error(`Workflow PreCheck signatureScan failed`, e?.message || e);
  }

  return {
    errors: [
      `📡 I'm calling for backup! I've encountered an unexpected hitch while processing your work, and I've notified a maintainer to assist you.`
    ],
    isGeneralModified: false,
    isMaxFilesUpdated: false,
    isPrTemplateModified: false,
    isSignatureModified: false,
    hasFailed: true,
    hasTell: false
  };
};

export { coreContributors, coreContributorsBypass, signatureScan };
