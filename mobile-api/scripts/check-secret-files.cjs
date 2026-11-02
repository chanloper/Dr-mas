'use strict';

// Read-only heuristic audit. Never emits matched values or source snippets.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
const files = [...new Set(git(['ls-files', '-c', '-o', '--exclude-standard', '-z']).split('\0').filter(Boolean))];
const tracked = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean));
const findings = [];
for (const filename of files) {
  const basename = path.basename(filename);
  const example = /(?:example|sample|template|exapmle)/i.test(basename);
  if (/^\.env(?:\..*)?$/.test(basename) && !example) {
    findings.push({ file: filename, rule: 'environment-file-not-ignored', tracked: tracked.has(filename) });
    continue;
  }
  if (/\.(pem|key|p12|pfx)$/i.test(filename)) findings.push({ file: filename, rule: 'private-key-file-review', tracked: tracked.has(filename) });
  const absolute = path.join(root, filename);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 2_000_000 || /package-lock\.json$|\.svg$|\.png$|\.jpg$/i.test(filename)) continue;
  const content = fs.readFileSync(absolute, 'utf8');
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/(?:AIza[\w-]{35}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{36}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(line)) {
      findings.push({ file: filename, line: index + 1, rule: 'credential-pattern-review', tracked: tracked.has(filename) });
    }
    // Environment examples can accidentally contain live values, including typos.
    if (example) {
      const match = line.match(/^\s*(DB_PASS(?:WORD)?|.*API_KEY|.*SECRET|.*TOKEN)\s*=\s*(.*?)\s*$/);
      if (match) {
        const value = match[2].replace(/^['"]|['"]$/g, '');
        if (value && !/^(?:your[_-]|replace|change|example|sample|test|dummy|<|\$\{|\.\.\.|여기에|본인|입력)/i.test(value)) {
          findings.push({ file: filename, line: index + 1, variable: match[1], rule: 'non-placeholder-example-value-review', tracked: tracked.has(filename) });
        }
      }
    }
    if (!/(?:^|\/)(?:test|scripts)\/|\.test\.|\.md$|\.sql$/i.test(filename)) {
      const literal = line.match(/\b(secret|apiKey|api_key)\s*:\s*['"]([^'"\r\n]{8,})['"]/i);
      if (literal) findings.push({ file: filename, line: index + 1, variable: literal[1], rule: 'hardcoded-secret-review', tracked: tracked.has(filename) });
    }
  }
}
const probes = ['mobile-api/.env', 'mobile-api/.env.local', 'mobile-api/.env.test', 'mobile-api/.env.example', '.local-auth-tests/probe/results.json'];
const ignored = probes.map(file => {
  try { git(['check-ignore', '-q', '--', file]); return { file, ignored: true }; }
  catch { return { file, ignored: false }; }
});
console.log(JSON.stringify({ scannedFiles: files.length, findings, ignoreChecks: ignored, limitations: 'Heuristic working-tree scan; does not inspect Git history or prove credential validity. Matched values are never output.' }, null, 2));
if (findings.length) process.exitCode = 1;
