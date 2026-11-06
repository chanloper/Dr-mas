import { createHandler } from './handler.ts';
// Prepared locally only. Never logs medicine queries, tokens, provider URLs or keys.
Deno.serve(createHandler({ env: key => Deno.env.get(key), fetch }));
