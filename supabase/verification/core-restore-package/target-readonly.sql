begin read only;
do $$ begin
 if current_database()<>'drmas_core_restore_verify'
 or inet_server_addr() is distinct from '127.0.0.1'::inet or inet_server_port()<>55433
 or current_setting('server_version_num')::int/10000<>17 or current_user<>'postgres'
 then raise exception 'TARGET_GUARD'; end if;
end $$;
rollback;
