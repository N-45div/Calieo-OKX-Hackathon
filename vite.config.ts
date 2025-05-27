import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';


export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'localhost',
      '7fcc-146-196-38-114.ngrok-free.app', // Allow ngrok host
    ],
    host: true, // Allow Vite to listen on all network interfaces (required for ngrok)
    port: 5173, // Default Vite port, adjust if needed
  },
});