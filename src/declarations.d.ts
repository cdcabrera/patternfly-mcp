// Type declarations for @patternfly/patternfly-component-schemas/json
// This file is needed because the package doesn't export TypeScript types.
// TODO: Remove this file once the package exports its own types.

declare module '@patternfly/patternfly-component-schemas/json' {

  /**
   * An array of all available PatternFly component names.
   */
  export const componentNames: string[];

  /**
   * A function that retrieves the JSON schema for a given component.
   * Returns the JSON Schema object directly from schemas.json
   *
   * @param componentName The name of the component to get the schema for.
   * @return A promise that resolves with the JSON Schema object.
   */
  export function getComponentSchema(componentName: string): Promise<{
    $schema: string;
    type: string;
    title: string;
    description: string;
    properties: Record<string, any>;
    additionalProperties?: boolean;
    required?: string[];
  }>;
}

// Type declarations for pid-port (ES module without TypeScript definitions)
declare module 'pid-port' {
  /**
   * Get the process ID (PID) of the process listening on a given port.
   *
   * @param port - Port number to check
   * @returns Promise that resolves to the PID, or undefined if no process is listening
   */
  export function portToPid(port: number): Promise<number | undefined>;
}

// Type declarations for fkill (ES module without TypeScript definitions)
declare module 'fkill' {
  interface FkillOptions {
    forceAfterTimeout?: number;
    waitForExit?: number;
    silent?: boolean;
  }

  /**
   * Kill a process by PID, name, or port.
   *
   * @param input - PID, process name, or port number
   * @param options - Optional settings
   * @returns Promise that resolves when the process is killed
   */
  function fkill(input: number | string, options?: FkillOptions): Promise<void>;

  export default fkill;
}
