/**
 * Get the current Node.js major version.
 *
 * @note Do not use semver here. This is purposefully a light implementation
 * meant to be shared externally without the overhead of additional packaging.
 *
 * @param nodeVersion
 * @returns Node.js major version.
 */
const getNodeMajorVersion = (nodeVersion: unknown) => {
  const sanitizedVersion = typeof nodeVersion === 'string' ? nodeVersion.replace(/^[^0-9]+/, '') : '0.0.0';
  const major = Number.parseInt(sanitizedVersion.split('.')?.[0] || '0', 10);

  if (Number.isFinite(major)) {
    return major;
  }

  return 0;
};

export { getNodeMajorVersion };
