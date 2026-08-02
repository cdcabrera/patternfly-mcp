import { type McpToolCreator, type McpResourceCreator } from './mcpSdk';
import { type CollectionCreator } from './records.user';
import { searchPatternFlyTool } from './tool.searchPatternFly';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { searchPatternFlyDocsTool } from './tool.searchPatternFlyDocs';
import { patternFlyComponentsIndexResource } from './resource.patternFlyComponentsIndex';
import { patternFlyContextResource } from './resource.patternFlyContext';
import { patternFlyDocsIndexResource } from './resource.patternFlyDocsIndex';
import { patternFlyDocsTemplateResource } from './resource.patternFlyDocsTemplate';
import { patternFlySchemasIndexResource } from './resource.patternFlySchemasIndex';
import { patternFlySchemasTemplateResource } from './resource.patternFlySchemasTemplate';
import { patternFlyApiCollection } from './records.patternFlyApi';
import { patternFlyDocsCollection } from './records.patternFlyDocs';
import { patternFlySchemasCollection } from './records.patternFlySchemas';

/**
 * Built-in tools.
 *
 * Array of built-in tools
 */
const builtinTools: McpToolCreator[] = [
  usePatternFlyDocsTool,
  searchPatternFlyDocsTool,
  searchPatternFlyTool
];

/**
 * Built-in resources.
 *
 * Array of built-in resources
 */
const builtinResources: McpResourceCreator[] = [
  patternFlyContextResource,
  patternFlyComponentsIndexResource,
  patternFlyDocsIndexResource,
  patternFlyDocsTemplateResource,
  patternFlySchemasIndexResource,
  patternFlySchemasTemplateResource
];

/**
 * Built-in collections.
 *
 * Array of built-in collections
 */
const builtinCollections: CollectionCreator[] = [
  patternFlyDocsCollection,
  patternFlySchemasCollection,
  patternFlyApiCollection
];

export { builtinCollections, builtinResources, builtinTools };
