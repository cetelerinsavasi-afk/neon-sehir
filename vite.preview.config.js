// SADECE önizleme (npm run preview:gangs) — production build bu dosyayı kullanmaz.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const m = (f) => path.resolve(__dirname, 'preview/mocks', f);
export default defineConfig({
  root: path.resolve(__dirname, 'preview'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^firebase\/app$/, replacement: m('firebase-app.js') },
      { find: /^firebase\/auth$/, replacement: m('firebase-auth.js') },
      { find: /^firebase\/functions$/, replacement: m('firebase-functions.js') },
      { find: /^firebase\/firestore$/, replacement: m('firebase-firestore.js') },
      { find: /^crypto$/, replacement: m('crypto.js') },
      { find: /.*\/config\/admin(\.js)?$/, replacement: m('admin-config.js') },
    ],
  },
  server: { port: 5199, host: '127.0.0.1', fs: { allow: [path.resolve(__dirname)] } },
});
