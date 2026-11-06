import { createHandler } from './handler.ts';

// No Supabase admin client or DB access is needed by this public read service.
Deno.serve(createHandler({ env: key => Deno.env.get(key), fetch,
  diagnose: event => console.warn(JSON.stringify(event)),
}));
