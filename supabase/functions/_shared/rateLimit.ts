// Atomic provider quota counters. Keys contain only service/time buckets.
export const LIMIT_SCRIPT = `
for i=1,3 do if tonumber(redis.call('GET',KEYS[i]) or '0') >= tonumber(ARGV[i]) then return 0 end end
for i=1,3 do local n=redis.call('INCR',KEYS[i]); if n==1 then redis.call('EXPIRE',KEYS[i],ARGV[i+3]) end end
return 1`;
