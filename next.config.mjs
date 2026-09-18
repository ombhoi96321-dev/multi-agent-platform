/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse (and its transitive deps) must never be bundled into
  // client code. Keeping it external on the server also avoids the
  // "Cannot find module pdf.worker.mjs" class of build errors that
  // shows up when a PDF library gets pulled into the browser bundle.
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
  },
};

export default nextConfig;
