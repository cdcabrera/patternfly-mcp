# Tool Plugin Example Ideas

This document outlines potential tool plugin examples that can be added to `docs/examples/` to help developers understand how to extend the PatternFly MCP server with custom tools. These examples demonstrate various integration patterns, complexity levels, and use cases.

## Development Workflow Integrations

### Version Control & Git
- **`toolPluginGitCommit.js`** - Generate conventional commit messages based on code changes
  - Analyzes staged files and suggests commit messages following conventional commits format
  - Integrates with `git diff` and `git status` commands
  - Example: "Generate a commit message for my staged PatternFly component changes"

- **`toolPluginGitBranch.js`** - Create and manage Git branches with naming conventions
  - Creates feature branches with consistent naming (e.g., `feat/button-component`, `fix/table-accessibility`)
  - Validates branch names against team conventions
  - Example: "Create a branch for adding a new PatternFly modal component"

- **`toolPluginGitStatus.js`** - Get formatted Git repository status
  - Returns clean, structured status of working directory, staged files, and recent commits
  - Useful for AI agents to understand project state before making changes
  - Example: "What's the current Git status of this repository?"

### Package Management & CLI Tools
- **`toolPluginNpmScripts.js`** - Execute NPM scripts with validation
  - Runs NPM scripts (build, test, lint) with proper error handling
  - Validates script existence before execution
  - Example: "Run the lint script to check my PatternFly components"

- **`toolPluginPatternFlyCLI.js`** - Integrate with PatternFly CLI tools
  - Runs PatternFly CLI commands (e.g., component generation, theme building)
  - Validates CLI availability and provides helpful error messages
  - Example: "Generate a new PatternFly component using the CLI"

- **`toolPluginPackageInfo.js`** - Query package.json and dependencies
  - Reads and parses package.json to check PatternFly versions, dependencies
  - Validates PatternFly version compatibility
  - Example: "What version of PatternFly is installed in this project?"

### Build & Testing Tools
- **`toolPluginJestRunner.js`** - Run Jest tests with pattern matching
  - Executes specific test files or test patterns
  - Parses test results and provides formatted output
  - Example: "Run tests for all PatternFly table components"

- **`toolPluginTypeScriptCheck.js`** - Run TypeScript type checking
  - Executes `tsc --noEmit` and formats errors for readability
  - Filters errors by file pattern or component name
  - Example: "Check TypeScript types for my PatternFly components"

- **`toolPluginESLint.js`** - Run ESLint with custom rules
  - Executes ESLint on specific files or directories
  - Formats linting results with actionable suggestions
  - Example: "Lint my PatternFly component files and suggest fixes"

## File System & Code Analysis

### File Operations
- **`toolPluginFileSearch.js`** - Search for files by pattern or content
  - Finds files matching patterns (e.g., `**/*Button*.tsx`)
  - Searches file contents for specific patterns or imports
  - Example: "Find all files that import PatternFly Button component"

- **`toolPluginComponentAnalyzer.js`** - Analyze React component structure
  - Parses React components to extract props, imports, and usage patterns
  - Identifies PatternFly component usage and suggests improvements
  - Example: "Analyze my Button component and suggest PatternFly best practices"

- **`toolPluginImportChecker.js`** - Validate and fix import statements
  - Checks PatternFly import paths for correctness
  - Suggests fixes for incorrect imports (e.g., missing `/victory` for charts)
  - Example: "Check and fix all PatternFly imports in my project"

### Code Quality
- **`toolPluginAccessibilityAudit.js`** - Run accessibility checks
  - Integrates with tools like `axe-core` or `pa11y` to audit components
  - Provides WCAG compliance reports
  - Example: "Audit my PatternFly components for accessibility issues"

- **`toolPluginBundleAnalyzer.js`** - Analyze bundle size and dependencies
  - Runs bundle analysis tools to identify large dependencies
  - Suggests optimizations for PatternFly component imports
  - Example: "Analyze my bundle size and suggest PatternFly import optimizations"

## External API Integrations

### Documentation & Resources
- **`toolPluginPatternFlyAPI.js`** - Query PatternFly API endpoints
  - Fetches component data, examples, or documentation from PatternFly APIs
  - Caches responses for performance
  - Example: "Fetch the latest Button component API documentation"

- **`toolPluginGitHubAPI.js`** - Interact with GitHub API
  - Searches PatternFly React repository for examples or issues
  - Fetches component source code or documentation
  - Example: "Find examples of PatternFly Table usage in the GitHub repository"

- **`toolPluginNpmRegistry.js`** - Query NPM registry for package information
  - Checks latest versions, release notes, or package metadata
  - Validates package compatibility
  - Example: "Check if there's a newer version of @patternfly/react-core available"

### Design & Asset Management
- **`toolPluginFigmaAPI.js`** - Integrate with Figma API
  - Fetches design specifications or component tokens from Figma
  - Validates implementation against design specs
  - Example: "Fetch the design tokens for PatternFly Button from Figma"

- **`toolPluginImageOptimizer.js`** - Optimize images for PatternFly components
  - Compresses and optimizes images using external services or local tools
  - Generates responsive image variants
  - Example: "Optimize images for my PatternFly Card components"

## Code Generation & Automation

### Component Generation
- **`toolPluginComponentGenerator.js`** - Generate PatternFly component boilerplate
  - Creates new components following project conventions
  - Generates TypeScript interfaces, tests, and stories
  - Example: "Generate a new PatternFly Modal component with TypeScript types"

- **`toolPluginStoryGenerator.js`** - Generate Storybook stories
  - Creates Storybook stories for PatternFly components
  - Generates multiple variants and examples
  - Example: "Generate Storybook stories for my PatternFly Table component"

- **`toolPluginTestGenerator.js`** - Generate test files
  - Creates test files with common test patterns
  - Generates accessibility and interaction tests
  - Example: "Generate tests for my PatternFly Form component"

### Documentation Generation
- **`toolPluginJSDocGenerator.js`** - Generate JSDoc comments
  - Analyzes code and generates JSDoc documentation
  - Follows project documentation standards
  - Example: "Generate JSDoc comments for my PatternFly component props"

- **`toolPluginReadmeGenerator.js`** - Generate component README files
  - Creates README files with usage examples and API documentation
  - Includes PatternFly-specific guidance
  - Example: "Generate a README for my PatternFly component"

## Project-Specific Integrations

### CI/CD Integration
- **`toolPluginCICDStatus.js`** - Check CI/CD pipeline status
  - Queries CI/CD systems (GitHub Actions, GitLab CI, Jenkins) for build status
  - Provides formatted status reports
  - Example: "What's the status of the latest CI/CD pipeline run?"

- **`toolPluginDeployment.js`** - Trigger or check deployments
  - Integrates with deployment platforms (Vercel, Netlify, Surge)
  - Checks deployment status or triggers new deployments
  - Example: "Deploy my PatternFly application to staging"

### Monitoring & Analytics
- **`toolPluginErrorTracking.js`** - Query error tracking services
  - Integrates with Sentry, LogRocket, or similar services
  - Fetches error reports and suggests fixes
  - Example: "What PatternFly-related errors are occurring in production?"

- **`toolPluginPerformanceMonitor.js`** - Query performance monitoring
  - Fetches performance metrics from monitoring tools
  - Identifies performance issues in PatternFly components
  - Example: "What are the performance metrics for my PatternFly Table component?"

## Multi-Tool Plugin Examples

### `toolPluginDevelopmentSuite.js`
A comprehensive plugin with multiple related tools:
- `gitCommit` - Generate commit messages
- `runTests` - Execute test suites
- `checkTypes` - TypeScript validation
- `lintCode` - ESLint checking
- `analyzeBundle` - Bundle size analysis

Demonstrates how to create a cohesive set of development tools in a single plugin.

### `toolPluginPatternFlyWorkflow.js`
PatternFly-specific workflow tools:
- `validateComponent` - Validate PatternFly component usage
- `checkVersion` - Verify PatternFly version compatibility
- `suggestComponent` - Suggest PatternFly components for use cases
- `migrateComponent` - Help migrate from v5 to v6

## Advanced Integration Patterns

### `toolPluginAsyncWorkflow.js`
Demonstrates complex async workflows:
- Chains multiple operations (e.g., lint → test → build → deploy)
- Handles errors and rollbacks
- Provides progress updates

### `toolPluginStreamingOutput.js`
Shows streaming output patterns:
- Streams long-running command output (e.g., build logs)
- Provides real-time updates to the MCP client
- Handles cancellation and cleanup

### `toolPluginStatefulTool.js`
Demonstrates stateful tool patterns:
- Maintains state across tool invocations
- Useful for multi-step workflows
- Example: Interactive component generation wizard

## Example Organization Recommendations

### By Complexity Level
1. **Beginner** - Simple single-purpose tools (git commit, npm scripts)
2. **Intermediate** - Tools with validation and error handling (component analyzer, import checker)
3. **Advanced** - Multi-tool plugins, async workflows, stateful tools

### By Integration Type
1. **CLI Integration** - Git, NPM, PatternFly CLI
2. **File System** - File operations, code analysis
3. **External APIs** - GitHub, NPM registry, Figma
4. **Code Generation** - Component generators, test generators
5. **CI/CD & DevOps** - Pipeline status, deployments

### By Use Case
1. **Development Workflow** - Git, testing, linting
2. **Code Quality** - Analysis, validation, optimization
3. **Code Generation** - Boilerplate, tests, documentation
4. **Project Management** - CI/CD, monitoring, deployment

## Implementation Notes

When creating these examples, consider:

1. **Error Handling** - All examples should demonstrate proper error handling and user-friendly error messages
2. **Validation** - Input validation using JSON Schema or Zod
3. **Security** - Safe execution of external commands and API calls
4. **Documentation** - Clear comments explaining key concepts
5. **Testing** - Examples should be testable and runnable
6. **Patterns** - Show both single-tool and multi-tool plugin patterns
7. **Async Operations** - Demonstrate proper async/await patterns
8. **Output Formatting** - Consistent MCP response format with structured content

## Priority Recommendations

Based on developer needs and learning value, consider implementing these first:

1. **`toolPluginGitCommit.js`** - High value, demonstrates CLI integration and conventional commits
2. **`toolPluginNpmScripts.js`** - Common use case, shows command execution patterns
3. **`toolPluginComponentAnalyzer.js`** - PatternFly-specific, demonstrates code analysis
4. **`toolPluginDevelopmentSuite.js`** - Shows multi-tool plugin pattern
5. **`toolPluginPatternFlyCLI.js`** - Direct PatternFly integration, high relevance

These examples will provide developers with a solid foundation to build their own custom tool plugins.
