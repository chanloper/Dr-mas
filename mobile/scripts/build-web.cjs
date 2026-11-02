// Explicit static build for Vercel. Never edits .env or deploys anything.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const cli = require.resolve('expo/bin/cli');
const result = spawnSync(process.execPath, [cli, 'export', '--platform', 'web', ...process.argv.slice(2)], {
  cwd: path.resolve(__dirname, '..'), env: { ...process.env, DRMAS_WEB_OUTPUT: 'static' }, stdio: 'inherit',
});
if (result.error) { process.stderr.write('웹 빌드 프로세스를 실행하지 못했습니다.\n'); process.exitCode = 1; }
else process.exitCode = result.status ?? 1;
