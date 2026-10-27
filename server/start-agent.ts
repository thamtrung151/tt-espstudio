import { startAgent } from './agent';
void startAgent().catch(error => { console.error(error.message); process.exitCode = 1; });
