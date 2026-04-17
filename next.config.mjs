/** @type {import('next').NextConfig} */
const nextConfig = {
  // Aumentar limite de body para fotos de notas fiscais (câmera de celular)
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
