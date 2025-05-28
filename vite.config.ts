import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';


export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'localhost',
      'c0c4-146-196-38-115.ngrok-free.app', // Allow ngrok host
    ],
    host: true, // Allow Vite to listen on all network interfaces (required for ngrok)
    port: 5173, // Default Vite port, adjust if needed
  },
  base: process.env.VITE_BASE_PATH || '/'
});