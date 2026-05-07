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
 * @param options.allowBots - Allow known bots to skip preCheck
 * @param options.allowMaintainers - Allow general members
 * @returns {boolean} A `boolean` indicating whether an author/contributor is allowed to skip pre-checks.
 */
const coreContributors = ({ author, authorType, authorRole } = {}, { allowBots = true, allowMaintainers = true } = {}) => {
  const bots = ['Bot', 'dependabot[bot]'];
  const contributors = ['OWNER'];
  const codeOwnersPaths = ['.github/CODEOWNERS', 'CODEOWNERS'];

  const isBot = allowBots && (bots.includes(authorType) || bots.includes(author));
  const isMaintainer = allowMaintainers && contributors.includes(authorRole);
  let isCodeOwner = false;

  for (const filePath of codeOwnersPaths) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (content.includes(`@${author}`)) {
    // if (new RegExp(`@${author}\\b`).test(content)) {
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
 * @param {{ filename: string }[]} listBase - Base array of strings to match.
 * @param {string[]} listCheck - Array of strings to confirm matches in base.
 * @returns {string[]} An array of value matches.
 */
const doesListContainAnotherListValues = (listBase, listCheck) =>
  ((Array.isArray(listBase) && listBase) || [])
    .filter(file => {
      const updatedFileName = file?.filename?.trim()?.toLowerCase() || undefined;
      const updatedListCheck = ((Array.isArray(listCheck) && listCheck) || []).map(item => item?.toLowerCase());

      if (!updatedFileName) {
        return false;
      }

      return updatedListCheck.includes(updatedFileName) ||
        updatedListCheck.some(
          item => (item && (updatedFileName.startsWith(item) || updatedFileName.endsWith(item) || updatedFileName.includes(item) || item.includes(updatedFileName)))
        );
    }).map(file => file?.filename);

/**
 * Scan PR for signatures using basic logic.
 *
 * @param params - Passed code parameters for review.
 * @param params.description
 * @param params.files
 * @param params.fileCount
 * @returns {{commentSignature: string, errors: string[], isMaxFilesUpdated: boolean, isPrTemplateModified: boolean, hasTell: boolean}} An `object` containing code scan results.
 */
const signatureScan = ({ description, files, fileCount } = {}) => {
  // Make sure this is within the PR template, or we'll get false positives.
  const prTemplateStr = '<!-- GH_PR_METADATA_V1_789 -->';

  // Max file updates outside of core contributors before alerting.
  const fileChangeLimit = 15;

  // Signature checks. This can be a list of existing or non-existent files, directories, and/or extensions.
  const coreList = [
    'src/cli',
    'src/declarations',
    'src/index',
    'src/mcpSdk',
    'src/options.default',
    'src/patternFly.getResources',
    'src/resource.',
    'src/server.ts',
    'src/tool.',
    'tests/audit',
    'tests/e2e'
  ];

  // generated check. This can be a list of existing or non-existent files, directories, and/or extensions.
  const genList = [
    'tests/e2e/utils/stdioTransportClient.ts',
    'tests/e2e/__snapshots__/stdioTransport.test.ts.snap'
  ];

  // double check. This can be a list of existing or non-existent files, directories, and/or extensions.
  const secList = [
    '.github',
    '.gitignore',
    '.npmrc',
    'package-lock.json',
    'src/index',
    'scripts/workflow'
  ];

  // more than needed. This can be a list of existing or non-existent files, directories, and/or extensions.
  const extrasList = [
    '__fixtures__',
    '__mocks__',
    '.js',
    '.sh',
    'src/fixtures',
    'src/mocks'
  ];

  // agent exceptions. This can be a list of existing or non-existent files, directories, and/or extensions.
  const agentList = [
    '.aiignore',
    '.agents',
    '.claude',
    '.cursor',
    '.junie',
    'guidelines/'
  ];

  try {
    const isMaxFilesUpdated = typeof fileCount === 'number' ? fileCount > fileChangeLimit : undefined;
    const isPrTemplateModified = typeof description === 'string' ? description.includes(prTemplateStr) === false : undefined;

    const coreModified = doesListContainAnotherListValues(files, coreList);
    const isCoreModified = coreModified.length > 0;

    const genModified = doesListContainAnotherListValues(files, genList);
    const isGenModified = genModified.length > 0;

    const secModified = doesListContainAnotherListValues(files, secList);
    const isSecModified = secModified.length > 0;

    const extraModified = doesListContainAnotherListValues(files, extrasList);
    const isExtraModified = extraModified.length > 0;

    const agentModified = doesListContainAnotherListValues(files, agentList);
    const isAgentModified = agentModified.length > 0;

    // Aggregate errors
    const errors = [];

    if (isMaxFilesUpdated === true) {
      errors.push(`⚠️ You've updated a lot of files (${fileCount}/${fileChangeLimit}). To keep things focused, please try to limit the scope of your PR as suggested in our guidelines.`);
    }

    if (isCoreModified) {
      errors.push(`⚠️ I detected core file modifications (${coreModified.join(', ')}). These changes usually require a bit more planning—check the guidelines for details.`);
    }

    if (isExtraModified) {
      errors.push(`⚠️ I've found extras in your updates that may not be required (${extraModified.join(', ')}). Aligning to the codebase style and workflow means your effort is more likely to be reviewed.`);
    }

    if (isAgentModified) {
      errors.push(`⚠️ I found local agent modifications in your changes (${agentModified.join(', ')}). These changes require a core contributor's involvement.`);
    }

    if (isSecModified) {
      errors.push(`⚠️ I've found updates that may require a core contributor's involvement (${secModified.join(', ')}). I'll make sure they know.`);
    }

    return {
      errors,
      isMaxFilesUpdated: isMaxFilesUpdated === true,
      isPrTemplateModified: isPrTemplateModified === true,
      isAgentModified,
      isCoreModified,
      isExtraModified,
      isGenModified,
      isSecModified,
      hasFailed: false,
      hasTell: isMaxFilesUpdated === true && isPrTemplateModified === true && isCoreModified && isGenModified
    };
  } catch (e) {
    console.error(`Workflow PreCheck signatureScan failed`, e?.message || e);
  }

  return {
    errors: [
      `📡 I'm calling for backup! I encountered an unexpected issue while processing your work. A maintainer has been notified.`
    ],
    isMaxFilesUpdated: false,
    isPrTemplateModified: false,
    isAgentModified: false,
    isCoreModified: false,
    isExtraModified: false,
    isGenModified: false,
    isSecModified: false,
    hasFailed: true,
    hasTell: false
  };
};

/**
 * Set labels
 *
 * @param config
 * @param config.github
 * @param config.context
 * @returns {{add: function(*): Promise<void>, remove: function(*): Promise<void>}}
 */
const setLabels = ({ github, context } = {}) => {
  const { owner, repo } = context?.repo || {};
  const issueNumber = context?.issue?.number;
  const addLabels = github?.rest?.issues?.addLabels;
  const removeLabel = github?.rest?.issues?.removeLabel;

  return {
    add: async labels => {
      if (Array.isArray(labels)) {
        await addLabels({ owner, repo, issue_number: issueNumber, labels }).catch(() => {});
      }
    },
    remove: async labels => {
      if (Array.isArray(labels)) {
        for (const label of labels) {
          await removeLabel({ owner, repo, issue_number: issueNumber, name: label }).catch(() => {});
        }
      }
    }
  };
};

/**
 * Get an ID from an issue number.
 *
 * @param signature
 * @param config
 * @param config.github
 * @param config.context
 * @returns {Promise<*>}
 */
const getCommentId = async (signature, { github, context } = {}) => {
  const { owner, repo } = context?.repo || {};
  const issueNumber = context?.issue?.number;

  const listComments = github?.rest?.issues?.listComments;
  let commentId;

  if (listComments && issueNumber) {
    const { data: comments } = await listComments({ owner, repo, issue_number: issueNumber }) || {};

    const foundComment = comments.find(comment => comment?.body?.includes(signature));

    commentId = foundComment?.id;
  }

  return commentId;
};

/**
 * Set comments
 *
 * @param config
 * @param config.signature
 * @param config.github
 * @param config.context
 * @returns {Promise<{add: function(*): Promise<*>, remove: function(): Promise<*>, existingCommentId: *, isComment: boolean}>}
 */
const setComment = async ({ signature, github, context } = {}) => {
  const { owner, repo } = context?.repo || {};
  const issueNumber = context?.issue?.number;
  const createComment = github?.rest?.issues?.createComment;
  const deleteComment = github?.rest?.issues?.deleteComment;
  const updateComment = github?.rest?.issues?.updateComment;

  const getBody = bod => String(bod ?? '') + signature;
  const commentId = await getCommentId(signature, { github, context });

  return {
    add: async body => {
      if (commentId) {
        return updateComment({ owner, repo, comment_id: commentId, body: getBody(body) }).catch(() => {});
      }

      return createComment({ owner, repo, issue_number: issueNumber, body: getBody(body) }).catch(() => {});
    },
    remove: async () => deleteComment({ owner, repo, comment_id: commentId }).catch(() => {}),
    existingCommentId: commentId,
    isComment: commentId !== undefined
  };
};

/**
 * Get a comment's reactions.
 *
 * @param config
 * @param config.signature
 * @param config.github
 * @param config.context
 * @returns {Promise<{authorReaction: number}>}
 */
const getReactions = async ({ signature, github, context } = {}) => {
  const { login: author } = context?.payload?.pull_request?.user || {};
  const commentId = await getCommentId(signature, { github, context });
  const listForIssueComment = github?.rest?.reactions?.listForIssueComment;
  let authorReaction = 0;

  if (listForIssueComment) {
    const { data: reactions } = await listForIssueComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: commentId
    }).catch(err => {
      console.error(`getReactions failed for commentId ${commentId}`, err?.message || err);
    }) || {};

    const initialAuthorReaction = reactions?.find(reaction => reaction?.user?.login === author);

    switch (initialAuthorReaction?.content) {
      case '-1':
        authorReaction = -1;
        break;
      case '+1':
        authorReaction = 1;
        break;
    }
  }

  return {
    authorReaction
  };
};

/**
 * Get a pull request context.
 *
 * @param config
 * @param config.github
 * @param config.context
 * @returns {Promise<{}|{author: *, authorType: *, authorRole: *, description: string, fileCount: *, files: *, comments: *}>}
 */
const getPullRequest = async ({ github, context } = {}) => {
  try {
    const { login: author, type: authorType } = context.payload.pull_request.user;
    const authorRole = context.payload.pull_request.author_association;

    const description = context.payload.pull_request.body || '';
    const fileCount = context.payload.pull_request.changed_files;
    const { data: files } = await github.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.issue.number,
      per_page: 50
    });
    const { data: comments } = await github.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number
    });

    return {
      author, authorType, authorRole, description, fileCount, files, comments
    };
  } catch (err) {
    console.error('Failed to get pull request context', err?.message || err);
  }

  return {};
};

/**
 * Start the pre-check process.
 *
 * @param config - Configuration params
 * @param config.isFreezeActive - Is a code freeze active flag
 * @param config.LABEL_CODE_FREEZE - Label string
 * @param config.LABEL_BREAKING_POTENTIAL - Label string
 * @param config.LABEL_NEEDS_CLEANUP - Label string
 * @param config.LABEL_NEEDS_MAINTAINER - Label string
 * @param config.LABEL_CONFIRMED - Label string
 * @param config.LABEL_UNCONFIRMED - Label string
 * @param config.LABEL_PRECHECKS_PASS - Label string
 * @param config.LABEL_PRECHECKS_BYPASS - Label string
 * @param config.LABEL_SEC - Label string
 * @param env - Environment params
 * @param env.github
 * @param env.context
 * @param env.core
 * @returns {Promise<void>}
 */
const start = async ({
  isFreezeActive,
  LABEL_CODE_FREEZE,
  LABEL_BREAKING_POTENTIAL,
  LABEL_NEEDS_CLEANUP,
  LABEL_NEEDS_MAINTAINER,
  LABEL_CONFIRMED,
  LABEL_UNCONFIRMED,
  LABEL_PRECHECKS_PASS,
  LABEL_PRECHECKS_BYPASS,
  LABEL_SEC
} = {}, { github, context, core } = {}) => {
  const { author, authorType, authorRole, description: prDescription, fileCount: prFileCount, files: prFiles, comments } = await getPullRequest({ github, context });

  if (coreContributors({ author, authorType, authorRole })) {
    console.log(`Contributor found, skipping pre-checks: ${author}`);

    return;
  }

  const botCommentSignature = '<!-- precheck-bot-comment-V1 -->';
  const { add: addBotComment } = await setComment({ signature: botCommentSignature, github, context });
  const { add: addLabels, remove: removeLabels } = await setLabels({ github, context });

  if (isFreezeActive) {
    await addLabels([LABEL_CODE_FREEZE]);
  } else {
    await removeLabels([LABEL_CODE_FREEZE]);
  }

  // Core contributors bypass
  if (coreContributorsBypass({ comments })) {
    const bypassComment = `### 🤖 PR Quality Guidance\n` +
      `Bypass acknowledged, standing down!\n\n` +
      `_This comment updates automatically._`;

    await addBotComment(bypassComment);
    await addLabels([LABEL_PRECHECKS_BYPASS]);

    return;
  }

  // Contributor's Agreement
  const isConfirmed = context.payload.pull_request.labels.some(label => label.name === LABEL_CONFIRMED);

  if (!isConfirmed) {
    const agreementCommentSignature = '<!-- precheck-bot-agreement-V1 -->';
    const { add: addAgreementComment, remove: removeAgreementComment, existingCommentId: agreementCommentId } =
      await setComment({ signature: agreementCommentSignature, github, context });

    if (!agreementCommentId) {
      const agreementComment = `### 🤖 PR Contributor's Agreement\n\n` +
        `I'm ready to help! Give my comment a 👍 to confirm you've read our [contribution guidelines](https://github.com/patternfly/patternfly-mcp/blob/main/CONTRIBUTING.md) and unlock the testing suite.`;

      await addAgreementComment(agreementComment);

      return;
    }

    const { authorReaction } = await getReactions({ github, context, signature: agreementCommentSignature });

    // No reaction
    if (authorReaction === 0) {
      return;
    }

    // Thumbs down reaction
    if (authorReaction === -1) {
      const declinedComment = `### 🤖 PR Contributor's Agreement\n` +
        `🚫 I noticed you declined the agreement, so I've paused automation. If you change your mind, just change your reaction to a 👍!`;

      await addAgreementComment(declinedComment);
      await addLabels([LABEL_UNCONFIRMED]);

      return;
    }

    // Thumbs up reaction
    if (authorReaction === 1) {
      await removeAgreementComment();
      await addLabels([LABEL_CONFIRMED]);
      await removeLabels([LABEL_UNCONFIRMED]);
    }
  }

  // Signature checks found feature-like work, notify the user they may not be following guidance
  const codeSignature = signatureScan({ description: prDescription, files: prFiles, fileCount: prFileCount });

  if (codeSignature.hasTell) {
    // GraphQL Mutation to convert to Draft
    const prNodeId = context.payload.pull_request.node_id;
    const mutation = `mutation($id: ID!) {
      convertPullRequestToDraft(input: { pullRequestId: $id }) {
        pullRequest { id isDraft }
      }
    }`;

    await github.graphql(mutation, { id: prNodeId });

    const botComment = `### 🤖 PR Quality Guidance\n` +
      `I noticed there's quite a bit of work here. I'm moving this over to a draft PR temporarily. Make sure you review the [contribution guidelines](https://github.com/patternfly/patternfly-mcp/blob/main/CONTRIBUTING.md) again.\n\n` +
      `_This comment updates automatically._`;

    await addBotComment(botComment);
    await addLabels([LABEL_BREAKING_POTENTIAL]);

    core.setFailed('PR moved to Draft. Make sure to review the contributing guidelines regarding potential feature and generated work and why your PatternFly MCP contribution may require planning.');

    return;
  } else {
    await removeLabels([LABEL_BREAKING_POTENTIAL]);
  }

  // Sec check, once it's found, don't remove it
  if (codeSignature.isSecModified) {
    await addLabels([LABEL_SEC]);
  }

  // Signature checks found something, alert the contributor in good faith
  if (codeSignature.errors.length > 0) {
    const botComment = `### 🤖 PR Quality Guidance\n` +
      `I found some issues with your work. Make sure you've reviewed the [contribution guidelines](https://github.com/patternfly/patternfly-mcp/blob/main/CONTRIBUTING.md). Once the following updates are addressed, you'll be queued for review:\n\n` +
      `${codeSignature.errors.map(err => `- ${err}`).join('\n')}\n\n` +
      `_This comment updates automatically._`;

    await addBotComment(botComment);
    await addLabels([LABEL_NEEDS_CLEANUP]);

    core.setFailed('PR pre-check requirements not met.');

    return;
  }

  // Fallback if signature checks fail, alert the maintainers
  if (codeSignature.hasFailed) {
    const errorComment = `### 🤖 PR Quality Guidance\n` +
      `${codeSignature.errors.map(err => `- ${err}`).join('\n')}\n\n` +
      `_This comment updates automatically._`;

    await addBotComment(errorComment);
    await addLabels([LABEL_NEEDS_MAINTAINER]);

    return;
  }

  // Confirm the work has passed pre-check
  const successComment = `### 🤖 PR Quality Guidance\n` +
    `I finished my scan and all pre-checks pass!\n\n` +
    `_This comment updates automatically._`;

  await addBotComment(successComment);
  await addLabels([LABEL_PRECHECKS_PASS]);
  await removeLabels([LABEL_NEEDS_CLEANUP, LABEL_NEEDS_MAINTAINER]);
};

export {
  coreContributors,
  coreContributorsBypass,
  doesListContainAnotherListValues,
  getCommentId,
  getPullRequest,
  getReactions,
  setComment,
  setLabels,
  signatureScan,
  start
};
