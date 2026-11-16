import { stageKdcaXml } from './kdca-offline.js';
// Only sanitized status and a newly created staging directory are printed.
async function main() {
  const [id, file, parent, mode, extra] = process.argv.slice(2);
  if (!id || !file || !parent || extra || mode !== undefined && mode !== '--synthetic') throw Error('KDCA_OFFLINE_ARGUMENTS_REQUIRED');
  console.log(JSON.stringify(await stageKdcaXml(file, parent, id, { synthetic: mode === '--synthetic' })));
}
main().catch(error => {
  const message = error instanceof Error && /^KDCA_[A-Z_]+$/.test(error.message)
    ? error.message : 'KDCA_OFFLINE_FAILED';
  console.error(message); process.exitCode = 1;
});
