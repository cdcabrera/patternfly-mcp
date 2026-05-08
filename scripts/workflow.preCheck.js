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
    comment.body.trim().toLowerCase().startsWith(bypassCommand) &&
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
 * @returns {{commentSignature: string, errors: *[], isMaxFilesUpdated: boolean, isPrTemplateModified: boolean, hasTell: boolean}} An `object` containing code scan results.
 */
const signatureScan = ({ body, changedFiles, fileCount } = {}) => {
  // Make sure this is within the PR template, or we'll get false positives.
  const prTemplateStr = '<!-- GH_PR_METADATA_V1_789 -->';

  // Make sure contributor guidelines confirmation exists
  const contributorGuidelines = [
    '] I have read the [contribution guidelines](https://github.com/patternfly/patternfly-mcp/blob/main/CONTRIBUTING.md) and fulfill them with this PR. I acknowledge my PR may be labeled, converted to draft, and closed by automation or maintainers if it does not have a related GitHub issue, pass validation, and follow guidelines.'
  ];

  // Make sure the contributor guidelines confirmation has been checked
  const contributorConfirmation = [
    '[x] I have read the [contribution guidelines]',
    '[X] I have read the [contribution guidelines]'
  ];

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
    const isMissingAgreement = typeof body === 'string' ? !contributorGuidelines.every(guideline => body.toLowerCase().includes(guideline)) : undefined;
    const isMissingAgreementCheck = typeof body === 'string' ? contributorConfirmation.some(confirmation => body.toLowerCase().includes(confirmation)) : undefined;

    const isMaxFilesUpdated = typeof fileCount === 'number' ? fileCount > fileChangeLimit : undefined;
    const isPrTemplateModified = typeof body === 'string' ? body.includes(prTemplateStr) === false : undefined;

    const filesModified = doesListContainAnotherListValues(changedFiles, fileAndDirsList);
    const isSignatureModified = filesModified.length > 0;

    const tellsModified = doesListContainAnotherListValues(changedFiles, generalList);
    const isGeneralModified = tellsModified.length === generalList.length;

    // Aggregate errors
    const errors = [];

    if (isMissingAgreement === true) {
      errors.push(`⚠️ PR description is missing the Contributor's agreement confirmation. Please restore and fill out the PR template and check the Contributor's agreement box.`);
    } else if (isMissingAgreementCheck === true) {
      errors.push(`⚠️ PR description needs the Contributor's agreement checked. Please check the Contributor's agreement box to confirm you have read the Contributor's guidelines.`);
    }

    if (isMaxFilesUpdated === true) {
      errors.push(`⚠️ PR contains a large number of files (${fileCount}/${fileChangeLimit}). Please keep your contribution focused on a specific update and reference the contribution guidelines regarding updates, planning, and opening issues for non-core contributors.`);
    }

    if (isSignatureModified) {
      errors.push(`⚠️ PR contains core modifications to behavior and testing: ${filesModified.join(', ')}. Please reference the contribution guidelines regarding updates, planning, and opening issues for non-core contributors`);
    }

    return {
      errors,
      isGeneralModified,
      isMaxFilesUpdated: isMaxFilesUpdated === true,
      isPrTemplateModified: isPrTemplateModified === true,
      isSignatureModified,
      hasFailed: false,
      hasTell: isGeneralModified && isMaxFilesUpdated === true && isPrTemplateModified === true && isSignatureModified
    };
  } catch {}

  return {
    errors: [
      `📡 Calling for backup! An unexpected hitch occurred during processing, and a maintainer has been notified.`
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
