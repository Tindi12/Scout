/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ncaa-api.henrygd.me',
      },
    ],
  },
}

export default nextConfig
