import { defineConfig } from '@playwright/test';
const deployed = process.env.ESPSTUDIO_TEST_WEB_URL;
export default defineConfig({
  testDir: './tests/agent-browser', timeout: 30000, workers: 1,
  use: { baseURL: deployed || 'http://127.0.0.1:3212', channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure' },
  webServer: deployed ? undefined : { command: 'node node_modules/vite/bin/vite.js preview --outDir dist-web --host 127.0.0.1 --port 3212 --strictPort', url: 'http://127.0.0.1:3212', reuseExistingServer: false },
});
