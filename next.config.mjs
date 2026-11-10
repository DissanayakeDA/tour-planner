/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server-only Node packages: load them from node_modules at runtime instead of bundling.
  serverExternalPackages: ['pg', 'cloudinary', '@vercel/functions'],
  poweredByHeader: false,
  reactStrictMode: true,
  // A stray package-lock.json in the user's home folder must not be mistaken for the workspace root.
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
