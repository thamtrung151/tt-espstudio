// Explicit packaging step; does not install software, start Agent, or touch USB.
import { build } from 'vite';
import { copyFile, mkdir } from 'node:fs/promises';
await build({
  configFile: false,
  ssr: { noExternal: ['zod'] },
  build: {
    ssr: 'server/start-agent.ts', outDir: 'release/agent', emptyOutDir: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'agent.cjs' } },
  },
});
await mkdir('release/agent', { recursive: true });
await copyFile('installer/consent.ps1', 'release/agent/consent.ps1');
await mkdir('release/agent/licenses', { recursive: true });
await copyFile('node_modules/zod/LICENSE', 'release/agent/licenses/Zod-LICENSE.txt');
