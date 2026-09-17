/** @type {import('next').NextConfig} */
const securityHeaders = [
  // The app is never meant to be framed: Send is one click.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  async headers() { return [{ source: '/(.*)', headers: securityHeaders }]; },
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
