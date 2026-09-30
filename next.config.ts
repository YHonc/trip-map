import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingExcludes: { '/*': ['.env*', '.local/**/*', 'artifacts/**/*', 'release/**/*'] },
  devIndicators: false,
  logging: { incomingRequests: { ignore: [/\/_AMapService\//] }, browserToTerminal: false },
};
export default nextConfig;
