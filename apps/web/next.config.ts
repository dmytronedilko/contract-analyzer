import type { NextConfig } from 'next';

import { fileURLToPath } from 'node:url';

const nextConfig: NextConfig = {
  // A self-contained server for the Docker image.
  output: 'standalone',
  // Trace files from the monorepo root so workspace packages (@repo/*) are included.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
