/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false, 'utf-8-validate': false, 'bufferutil': false, 'fsevents': false, 'net': false, 'tls': false,
    };
    return config;
  },
};
export default nextConfig;
