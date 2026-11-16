import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { readKdcaPrivateSources } from './kdca-private-sources.js';

async function main() {
  try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('KDCA_PRIVATE_CONFIG_INVALID'); }
  const [command, id, file, parent, mode, extra] = process.argv.slice(2);
  if (extra || !['validate', 'stage', 'collect'].includes(command ?? '')
    || command === 'validate' && id !== undefined
    || command === 'collect' && (!id || file !== undefined)
    || command === 'stage' && (!id || !file || !parent || mode !== undefined && mode !== '--synthetic')) throw Error('KDCA_PRIVATE_ARGUMENTS_INVALID');
  const sources = await readKdcaPrivateSources(process.env);
  if (command === 'validate') console.log(JSON.stringify(sources.describe()));
  if (command === 'stage') console.log(JSON.stringify(await sources.stageXml(file!, parent!, id!, { synthetic: mode === '--synthetic' })));
  if (command === 'collect') await sources.collect(id!, process.env);
}
main().catch(error => {
  console.error(error instanceof Error && /^KDCA_[A-Z_]+$/.test(error.message) ? error.message : 'KDCA_PRIVATE_FAILED');
  process.exitCode = 1;
});
