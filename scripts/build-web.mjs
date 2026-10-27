import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const result = spawnSync(process.execPath, [vite, 'build', '--outDir', 'dist-web'], { stdio: 'inherit', env: { ...process.env, VITE_COMPILER_MODE: 'agent' } });
process.exitCode = result.status ?? 1;
