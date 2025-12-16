// Fixture exports a creator function directly; public helpers not required here

const echo_plugin_tool = options => [
  'echo_plugin_tool',
  {
    description: 'Echo back the provided args, but with a different description',
    inputSchema: { additionalProperties: true }
  },
  // args => ({ ok: true, args, options })
  args => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({ args, options }, null, 2)
      }
    ]
  })
];

export default echo_plugin_tool;

/*
export default createMcpTool([
  {
    name: 'echo_plugin_tool',
    description: 'Echo back the provided args',
    inputSchema: { additionalProperties: true },
    handler: args => ({ ok: true, args })
  },
  options => {
    console.warn('options', options);

    return [
      'echo_2_tool',
      {
        description: 'Echo back the provided args, but with a different description',
        inputSchema: { additionalProperties: true }
      },
      handler => args => ({ ok: true, args, handler })
    ];
  }
]);
*/
