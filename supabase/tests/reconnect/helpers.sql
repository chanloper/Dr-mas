-- Rolled back with single-session.sql. Helpers deliberately use caller privileges.
create schema drmas_reconnect_test;
grant usage on schema drmas_reconnect_test to authenticated,anon;
create function drmas_reconnect_test.ok(v boolean,label text) returns void
language plpgsql security invoker set search_path='' as $$
begin if v is distinct from true then raise exception 'FAIL %',label; end if;
raise notice 'PASS %',label; end $$;
create function drmas_reconnect_test.denied(q text,expected text,label text) returns void
language plpgsql security invoker set search_path='' as $$
declare code text;
begin
 begin execute q; exception when others then
 get stacked diagnostics code=returned_sqlstate;
 if code=expected then raise notice 'PASS %',label; return; end if;
 raise exception 'FAIL % SQLSTATE %',label,code;
 end;
 raise exception 'FAIL % unexpectedly_allowed',label;
end $$;
revoke all on all functions in schema drmas_reconnect_test from public;
grant execute on all functions in schema drmas_reconnect_test to authenticated,anon;
