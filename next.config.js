/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  async redirects() {
    return [
      // "Upload" became "Capture" (31 Jul) — keep old links and muscle memory working.
      { source: '/upload', destination: '/capture', permanent: true },
    ];
  },
};
