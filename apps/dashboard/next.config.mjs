/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.fallback ??= {};
    Object.assign(config.resolve.fallback, {
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    });
    return config;
  },
};

export default nextConfig;

