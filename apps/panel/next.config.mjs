/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @mgg/shared ships TypeScript that Next transpiles for both server and client.
  transpilePackages: ["@mgg/shared"],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // bcryptjs / prisma are server-only; keep them out of the client bundle.
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs", "otplib"],
    // run src/instrumentation.ts on server boot (starts the cron scheduler)
    instrumentationHook: true,
  },
};

export default nextConfig;
