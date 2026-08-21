import type { NextConfig } from 'next';

/**
 * apps/web is a client of the room server only — it holds no engine
 * authority. Nothing here should ever reach into apps/party.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
