const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Configure the proxy middleware for Tibia images
app.use('/tibia-proxy', createProxyMiddleware({
  target: 'https://static.tibia.com',
  changeOrigin: true,
  pathRewrite: {
    '^/tibia-proxy': '/'
  },
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://www.tibia.com',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  }
}));

// Start the proxy server
const PORT = process.env.PROXY_PORT || 3128;
app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`);
});
