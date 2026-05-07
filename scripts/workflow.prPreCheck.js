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
 * @returns {boolean} A `boolean` indicating whether an author/contributor is allowed to skip pre-checks.
 */
const coreContributors = ({ author, authorType, authorRole } = {}) => {
  const bots = ['Bot', 'dependabot[bot]'];
  const contributors = ['OWNER', 'MEMBER'];
  const codeOwnersPaths = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];

  const isBot = bots.includes(authorType) || bots.includes(author);
  const isMaintainer = contributors.includes(authorRole);
  let isCodeOwner = false;

  for (const filePath of codeOwnersPaths) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (new RegExp(`@${author}\\b`).test(content)) {
        isCodeOwner = true;
      }

      break;
    }
  }

  return isBot || isMaintainer || isCodeOwner;
};

/**
 * Does one list contain another list's values?
 *
 * @param {string[]} listBase - Base array of strings to match.
 * @param {string[]} listCheck - Array of strings to confirm matches in base.
 * @returns {string[]} An array of value matches.
 */
const doesListContainAnotherListValues = (listBase, listCheck) =>
  listBase
    .filter(file =>
      listCheck.includes(file?.filename) ||
      listCheck?.some(
        item => file?.filename && (file.filename?.startsWith(item) || file.filename?.endsWith(item) || file.filename?.includes(item) || item.includes(file.filename))
      )).map(file => file?.filename);

/**
 * Scan available updates for signature using basic logic.
 *
 * @param params - Passed code parameters for review.
 * @param params.body
 * @param params.changedFiles
 * @param params.fileCount
 * @returns {{commentSignature: string, errors: *[], isMaxFilesUpdated: boolean, isPrTemplateModified: boolean, hasTell: boolean}} An `object` containing code scan results.
 */
const signatureScan = ({ body, changedFiles, fileCount }) => {
  // Make sure this is within the PR template or we'll get false positives.
  const prTemplateStr = '<!-- GH_PR_METADATA_V1_789 -->';

  // Automation knows which comment to modify
  const commentSignature = '<!-- precheck-bot-comment-V1 -->';

  // Max file updates outside of core contributors before alerting.
  const fileChangeLimit = 15;

  // Signature checks. This can be a list of existing or non-existent files, directories, and/or extensions.
  const fileAndDirsList = [
    '.js',
    '.sh',
    '__mocks__',
    '__fixtures__',
    '.agents',
    '.github',
    '.claude',
    '.cursor',
    '.junie',
    'src/cli',
    'src/declarations',
    'src/fixtures',
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

  // Aggregate errors
  const errors = [];
  const filesModified = doesListContainAnotherListValues(changedFiles, fileAndDirsList);
  const tellsModified = doesListContainAnotherListValues(changedFiles, generalList);

  /*
  const filesModified = changedFiles
    .filter(file =>
      fileAndDirsList.includes(file?.filename) ||
      fileAndDirsList?.some(
        item => file?.filename && (file.filename?.startsWith(item) || file.filename?.endsWith(item) || file.filename?.includes(item) || item.includes(file.filename))
      )).map(file => file?.filename);

  const tellsModified = changedFiles
    .filter(file =>
      generalList.includes(file?.filename) ||
      generalList?.some(
        item => file?.filename && (file.filename?.startsWith(item) || file.filename?.endsWith(item) || file.filename?.includes(item) || item.includes(file.filename))
      )).map(file => file?.filename);
   */

  const isSignatureModified = filesModified.length > 0;
  const isGeneralModified = tellsModified.length === generalList.length;
  const isPrTemplateModified = typeof body === 'string' ? body.includes(prTemplateStr) === false : undefined;
  const isMaxFilesUpdated = typeof fileCount === 'number' ? fileCount > fileChangeLimit : undefined;

  if (isMaxFilesUpdated === true) {
    errors.push(`⚠️ PR contains a large number of files (${fileCount}/${fileChangeLimit}). Please keep your contribution focused on a specific update and reference the contribution guidelines regarding updates for features, refactors, performance, and fixes for non-core contributors.`);
  }

  if (isSignatureModified) {
    errors.push(`⚠️ PR contains core modifications to behavior and testing: ${filesModified.join(', ')}. Please reference the contribution guidelines regarding updates for features, refactors, performance, and fixes for non-core contributors`);
  }

  return {
    commentSignature,
    errors,
    isMaxFilesUpdated: isMaxFilesUpdated === true,
    isPrTemplateModified: isPrTemplateModified === true,
    hasTell: isGeneralModified && isPrTemplateModified === true && isMaxFilesUpdated === true && isSignatureModified
  };
};

/**
 * Check if the repository is in a release freeze state.
 *
 * @returns {boolean}
 */
const isReleaseFreeze = () => {
  const freezeFiles = ['RELEASE_FREEZE', 'VERSION_BUMP_IN_PROGRESS'];
  return freezeFiles.some(file => fs.existsSync(file));
};

export { coreContributors, isReleaseFreeze, signatureScan };
