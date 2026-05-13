# Contributing
Interested in contributing to the project? Review the following guidelines and our [planned architecture](./docs/architecture.md), [security policy](./SECURITY.md), and [governance policy](./GOVERNANCE.md) to make sure your contribution is aligned with the project's goals.

## Development

### Environment setup

#### Tools
- [Node.js](https://nodejs.org/en/download/package-manager)
- NPM (or equivalent package manager)
- Git configured with your GitHub account

#### Project setup
- Fork and clone the repository
- Open your terminal, or equivalent, in the codebase context and run the following commands
   ```bash
   npm install
   npm run build
   npm test
   npm run test:integration
   npm start
   ```
  All tests should pass, and the application should start successfully with a confirmation message in the terminal.

##### Windows and repository symlinks

Some paths in this repo are **symbolic links** so tools can reach shared skills without needing to host multiple versions of the same files. For example, `.agents/skills` and `.claude/skills` point at `guidelines/skills`. On **Windows**, Git may create **regular folders or files** instead of links, so these locations can look empty or broken.

**Before you clone the repository**

- Turn on **Developer Mode** (Settings -> Privacy & security -> For developers). That usually lets Git create symlinks without running as Administrator.
- Prefer cloning with links enabled, for example: `git clone -c core.symlinks=true <repository-url>`, or use **WSL** / **Git for Windows** with symlink support configured.

**If the repo is already on disk and the links are broken**

Turning on Developer Mode or Git symlink settings **does not always fix** paths Git has already created as ordinary files.
- Delete the broken `.agents/skills` and `.claude/skills` entries, or remove the entire folder/directory and **clone again**
- Then follow the **Before you clone the repository** steps above

> If you are unsure of any steps, please verify them with your IT or system administrator before proceeding.

#### Development workflow
- Make changes to the codebase
- Run tests to verify your changes do not break existing functionality
- Commit your changes and push them to your fork
- Open a pull request

### Using Git

#### Workflow
Our process follows the standard GitHub fork and pull request workflow.

- Fork the repository
- Create a branch for your changes
- Submit a pull request towards the main repository default branch

##### Main repository branches
- The `main` branch currently represents both development and stable releases

> In the future, if there is an increase in contributions, we may consider implementing a `stable` branch.
>    - `main` would be the default branch for development and feature work rebased from `stable` after release.
>    - `stable` would be a branch used for stable releases/hashes, reference links, and only updated with release commits.

#### Contributor roles

- **Core Contributors:** Maintainers listed in `CODEOWNERS`, which can include `MEMBER/OWNER` roles in the GitHub organization. Their focus is architecture, roadmap planning, maintenance, and feature contributions. 
- **General Contributors:** Community members contributing via forks. All PRs from general contributors undergo automated validation and must pass the initial checks before being queued for review by maintainers.

#### Before you contribute

> **Get a feature up and running. Try customizing the server!**
>
> The PatternFly MCP server is designed from the ground-up to be customizable. That customization allows the server to be [wrapped by a customized MCP server](./docs/development.md#programmatic-usage) and allows [MCP tool plugins](./docs/development.md#mcp-tool-plugins).

##### Have a feature or found a bug? Start a conversation

In the new age of agentic coding where your ideas can be up and working quickly, we encourage opening a GitHub issue before starting any work.

Opening an issue first starts the planning conversation to have your idea integrated, push the PatternFly MCP forward collectively, and give you the recognition for your effort and planning without forcing a code review from maintainers. We want your planned idea, not our reactive interpretation. 

Opening a PR without an issue has a higher likelihood your work will be flagged with automation, delayed for maintainer review, and potentially closed.

> **Just want to show us your work?**
>
> If you're leveraging the GitHub PR to provide us with file diffs, you can achieve the same Git diff applied by PRs by simply using the GitHub link format and applying it to your issue:
> - `https://github.com/[BASE_OWNER]/[BASE_REPO]/compare/[BASE_BRANCH]...[FORK_OWNER]:[FORK_BRANCH]`
>
> **Example for this repository:**
> - `https://github.com/patternfly/patternfly-mcp/compare/main...your-username:your-branch`

##### Want the PatternFly MCP to access your documentation?

The PatternFly MCP primarily focuses on documentation found on the PatternFly GitHub organization. 

**Guidelines for adding documentation references**:
- **PatternFly subject**: Added documentation should concern PatternFly as the primary subject. Requests for additional subjects require an issue first.
- **Specific domain**: Documentation is whitelisted to specific domains on purpose. Updates to this list require an issue first, for security.
- **Production ready**: Documentation added to the PatternFly MCP resources should be production ready. Exposing draft documentation is a concern, and it is requested you open an issue first if you are unsure.
- **Resource quality**: Documentation will be reviewed for quality and security. You will be providing a resource for every PatternFly MCP user.
- **Release dependent**: Documentation merges may be placed on hold temporarily if it conflicts with any future PatternFly MCP release cycle.
- **Agent skill**: An agent skill for a range of tools (e.g., Cursor, Claude, etc.) is provided for convenience to help update the related files
   - [Update documentation SKILL](./guidelines/skills/add-docs-links/SKILL.md)

#### Pull requests

Development pull requests (PRs) should be opened against the default branch.

Pull requests from non-core contributors will be invited to read the contribution agreement in both workflow logs and PR comments when available. Proceeding with the PR implies acceptance of these guidelines.

##### The Contributor's agreement
_I have read the contribution guidelines and fulfill them with this PR. I acknowledge my PR may be labeled, placed on policy hold, and closed by automation or maintainers if it does not have a related GitHub issue, follow guidelines, and pass validation._

##### PR Labels
> **Important**: Gatekeeper supports a flexible messaging model. Organization contributors receive direct PR feedback, and community contributors can find identical guidance mirrored in the workflow logs and summary. Please refer to the **GitHub Actions Job Summary** for the `Gatekeeper` job to view your status. If policy checks and automation do not pass, your PR will not be prioritized.

Automation manages the following summary labels to indicate PR state:
- `bot:policy-ready`: Gatekeeper policy checks have passed. Any additional required checks should pass before the PR is ready for maintainer review.
- `bot:policy-hold`: PR is temporarily on hold due to excessive scope or structural violations.
- `bot:needs-cleanup`: PR requires attention (e.g., failed scan, missing issue).
- `bot:needs-maintainer`: An unexpected error occurred, or manual intervention is required.

> Automation looks for a few metrics related to the following warning signs
>  - has no related issue
>  - ignores existing code style
>  - out-of-sync commits (not rebased against the default branch)
>  - poorly structured commits and messages
>  - any one commit relies on other commits to work (beyond "review requested updates")
>  - dramatic file restructures that attempt complex behavior
>  - missing, relaxed, or removed linting, typings, and tests
>  - overly complex TypeScript generics or generally over-the-top typings
>  - dramatic unit test snapshot updates
>  - favors naming unit test files after behavior instead of related filenames
>  - affects any file not directly associated with the issue being resolved
>  - affects "many" files
>  - contains or is a minor grammatical fix
>
> **If policy checks and automation do not pass, your PR will not be prioritized, and you may be asked to**:
>  - open an issue and close your PR
>  - restructure your commits
>  - break the work into multiple pull requests
>  - close the PR

##### Pull request commits, messaging

Your pull request should contain Git commit messaging that follows [conventional commit types](https://www.conventionalcommits.org/)
to provide consistent history and help generate [CHANGELOG.md](./CHANGELOG.md) updates.

Commit messages follow two basic guidelines:
- No more than `65` characters for the first line.
- Commit message formats follow the structure:
  ```
  <type>(<optional scope>): <issue> <description> (#PR_NUMBER)
  ```
  Where:
  - **Type**: The type of work the commit resolves (e.g., `feat`, `fix`, `chore`, `docs`, `refactor`, `test`).
  - **Scope**: The optional area of code affected (directory, filename, or concept).
  - **Issue**: Related story issue for the commit work. `feat` work requires an issue to pass validation and tracking metrics. Typically associated with the formats `issue/123` or `PF-123`. 
  - **Description**: What the commit work encompasses.
  - **#PR_NUMBER**: The pull request number. Typically added automatically during merge/squash operations. Including it manually is optional. It can help with traceability during review.

> If your **pull request contains multiple commits**, they will be squashed into a single commit before merging, and the messaging
> will be altered to reflect current guidelines.

##### Pull request test failures

To ensure a smooth and efficient review process, maintainers will begin their evaluation only after all automated policy checks and any other required checks have all passed successfully.

Please follow the guidance provided by automation and resolve the issues. If your work is still failing, seek guidance before requesting a manual review.

> If you are unsure why your tests are failing, we encourage you to [start a conversation](#have-a-feature-or-found-a-bug-start-a-conversation), and review both [pull request guidance](#pull-requests) and [testing documentation](#testing).

### Code style guidance and conventions
Basic code style guidelines are generally enforced by ESLint, but there are additional guidelines.

#### File structure
- File names use lowerCamelCase and dot notation (e.g., `server.http.ts`, `server.logger.ts`).
- Directory structure is organized by function, with all relevant files maintained in the `src` directory.

#### Functionality, testing
- Functions should attempt to maintain a single responsibility.
- Function annotations follow a minimal JSDoc style; descriptions are encouraged.
- Unit test file names should have a corresponding file with the same name (e.g. `server.ts`, `server.test.ts`).
- E2E test file names should be representative of the core functionality of the codebase.
- E2E testing can integrate into the `test` mode provided by the codebase. Recreating this functionality with custom mocks and fixtures is discouraged.
- Tests should focus on functionality.
- Tests should not be written for external packages. That is the responsibility of the external package, or it shouldn't be used. 

#### Functionality, features, fixes, etc.
- Existing functions should be prioritized for reuse over writing new functions that do the same thing

#### TypeScript
- Typings within the project may be generally loose for initial development but should be refined over time.
- Typings exposed to consumers should always attempt to maintain consistency.
- Typings for tests are less of a focus than functionality checks.

### Testing
Current testing is based on Jest.

> A consideration for Vitest is being made for the near future after base functionality is complete.

#### Unit tests

Unit tests are located in the `__tests__` directory.

#### E2E tests

E2E tests are located in the root `./tests/e2e` directory.

Contributors can run the MCP server in a specialized `test` mode against mock resources.

```bash
npm run test:integration
```

This mode leverages the `--mode test` and `--mode-test-url` flags to redirect resource lookups to a fixture server instead of live or local resources.

#### Audit tests

Data audit tests are located in the root `./tests/audit` directory.

```bash
npm run test:audit
```

#### Script tests

Script tests are located in the root `./tests/scripts` directory.

```bash
npm run test:scripts
```

## Maintenance: Node.js engine bumps

The `Node.js` engine requirements are updated on a predictable biannual schedule to ensure the server remains secure, leverages modern runtime features, and provides stability for consumers.

> Our engine requirements are intended to be the minimum to run the MCP server. They are not intended to be a maximum, as newer versions may introduce breaking changes or require additional configuration.

### Schedule and process
- **Timing**: Bumps are generally targeted for **Spring (April/May)** and **Fall (October/November)**, aligned with the [Node.js release schedule](https://nodejs.org/en/about/previous-releases) as versions enter or exit LTS.
- **Security**: Out-of-band updates may be performed if critical security considerations arise.
- **Version Targets**:
  - Focus on the latest **even-numbered (LTS/Stable)** versions (e.g., bumping to 22, 24, or 26).
  - GitHub Workflows should be updated to include the latest available even version.

### Acceptance criteria for bumps
- Update `package.json` engine requirements.
- Update related GitHub Action workflows (CI/CD).
- Update "Environmental Requirements" in documentation.
- Ensure all tests pass on the new target version.

## AI agent

### User section

Current agent interaction can be triggered with the chat command

- **`review the repo guidelines`** - Your agent should attempt to scan common markdown files and the guidelines directory

For detailed information on agent interaction, see [guidelines/README.md](./guidelines/README.md).

#### Customizing developer experience

As developers, we often have our own preferred workflows, and that includes working with AI agents. To that point, we've added agent guidance
to allow customization for your work environment through a tool-agnostic git-ignored directory `./.agent` in the root of the project.

#### Noting AI agent contributions

Please reference [PatternFly's AI-assisted development guidelines](https://github.com/patternfly/.github/blob/main/CONTRIBUTING.md) for guidance on how to
acknowledge AI agent contributions.

### Agent only
Agents: This repository contains a hierarchical guideline system. Agents should review agent-only comment blocks.

<!--
Agents must analyze these files when asked for guidance:

**Guidelines review order:**
1. **`./README.md`** - Main agent guidance and behavior standards (including agent-only comment block)
2. **`./guidelines/README.md`** - Core agent guidance and behavior standards
3. **`./guidelines/**/*.md`** - Specialized workflow and domain-specific instructions
4. **`./.agent/**/*.md`** - gitignored directory and local guidelines intended for agent-specific state and new agent-generated guidance, and user workflows that enhance the core guidelines

The guideline system should be processed in this order, with specialized guidelines taking precedence for their specific domains, and local guidelines overriding general guidelines when present.

**Next Steps:**
5. **Review guidance under the `./.agent/**/*.md` directory.** If the `./.agent` directory exists, the user may ask the agent about the guidance located here.
6. **If the `./.agent` directory does not exist, ask the user if they want to create it.** The agent should explain how it's going to be used.
-->
