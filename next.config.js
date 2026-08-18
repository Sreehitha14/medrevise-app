/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // textbook photos can be large
  },
};

module.exports = nextConfig;
