import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

const packageName = 'cascade-q';

export default defineConfig({
  build: {
    lib: {
      // 使用多入口配置
      entry: {
        'cascade-q': resolve(__dirname, 'src/index.ts'),
        types: resolve(__dirname, 'src/types-export.ts')
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        if (entryName === 'cascade-q') {
          return format === 'es' ? `${packageName}.js` : `${packageName}.cjs`;
        }
        return format === 'es' ? `${entryName}.js` : `${entryName}.cjs`;
      }
    },
    sourcemap: true,
    rollupOptions: {
      output: {
        preserveModules: false
      }
    }
  },
  test: {
    globals: true,
    environment: 'node'
  },
  plugins: [dts()]
});
