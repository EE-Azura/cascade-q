import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

const packageName = 'cascade-q';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'CascadeQ',
      formats: ['es', 'cjs'],
      fileName: (format: string) => (format === 'es' ? `${packageName}.js` : `${packageName}.cjs`)
    },
    sourcemap: true
  },
  test: {
    globals: true,
    environment: 'node'
  },
  plugins: [dts()]
});
