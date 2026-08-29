import type { NextConfig } from 'next';

/**
 * apps/web is a client of the room server only — it holds no engine
 * authority. Nothing here should ever reach into apps/party.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The codebase-wide convention is explicit `.js` extensions on relative
  // imports (verbatimModuleSyntax, matching how packages/* are consumed as
  // real ESM). tsc's Bundler resolution already maps `./foo.js` to
  // `./foo.ts`/`./foo.tsx`; webpack needs the same alias told to it
  // explicitly, or a `.js`-suffixed import to a `.tsx` component fails to
  // resolve in `next dev`.
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
