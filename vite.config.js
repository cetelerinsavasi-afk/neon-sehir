import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // v165 GEÇİCİ ÖLÇÜM — okuma kaynağı sayacı (bkz. src/lib/fsMeter). Kaldırmak için bu satırı sil.
      { find: /^firebase\/firestore$/, replacement: fileURLToPath(new URL('./src/lib/fsMeter/firestoreShim.js', import.meta.url)) },
    ],
  },
})
