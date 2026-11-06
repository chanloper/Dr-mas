'use strict';
const tables = ['profiles','care_links','medications','medication_records'];
const privateFunctions = ['can_read_patient','current_role','handle_new_user','keep_record_identity','validate_medication_timezone'];
const rpcs = ['request_care_link','approve_care_link','revoke_care_link'];
function selectEntry(line) {
  if (!/^\d+; \d+ \d+ /.test(line)) return false;
  const text = line.replace(/^\d+; \d+ \d+ /,'');
  if (/^SCHEMA - drmas_private postgres$/.test(text)) return true;
  if (/^ACL - SCHEMA drmas_private postgres$/.test(text)) return true;
  if (/^TYPE public drmas_(role|link_status) postgres$/.test(text)) return true;
  const f = text.match(/^(?:FUNCTION|ACL) (drmas_private|public) (?:FUNCTION )?"?([a-z_]+)"?\(/);
  if (f) return / postgres$/.test(text) && (f[1]==='drmas_private' ? privateFunctions : rpcs).includes(f[2]);
  if (/^TRIGGER auth users drmas_auth_user_created supabase_auth_admin$/.test(text)) return true;
  return tables.some(t => new RegExp('^(?:TABLE|TABLE DATA|CONSTRAINT|FK CONSTRAINT|ROW SECURITY|POLICY|TRIGGER) public '+t+'(?: |$)').test(text)
    || new RegExp('^ACL public (?:TABLE '+t+' |COLUMN '+t+'\\.)').test(text))
    || /^INDEX public (care_links_approved_by|care_links_guardian|care_links_requested_by|medication_records_patient|medications_patient) postgres$/.test(text);
}
function buildSelection(toc) {
  const entries=toc.split(/\r?\n/).filter(x=>/^\d+;/.test(x));
  const selected=entries.filter(selectEntry);
  const check=(re,n)=>{if(selected.filter(x=>re.test(x)).length!==n)throw Error('ARCHIVE_INVENTORY_MISMATCH');};
  check(/ TABLE public /,4); check(/ TABLE DATA public /,4);
  check(/ TYPE public /,2); check(/ FUNCTION (?:public|drmas_private) (?!FUNCTION )/,8);
  check(/ POLICY public /,11); check(/ ROW SECURITY public /,4);
  check(/ FK CONSTRAINT public /,8); check(/ CONSTRAINT public /,14); // 6 keys + 8 FKs
  check(/ INDEX public /,5); check(/ TRIGGER (?:auth|public) /,3);
  check(/ ACL public TABLE /,4); check(/ ACL public COLUMN /,11);
  return {selected,excluded:entries.filter(x=>!selectEntry(x)),total:entries.length};
}
// Parse COPY framing only. Content is retained privately; never printed.
function copyBlocks(sql) {
  const result=[];const re=/^COPY public\.(profiles|care_links|medications|medication_records) \(([^\r\n]+)\) FROM stdin;\r?\n([\s\S]*?)^\\\.\r?$/gm;
  for(const m of sql.matchAll(re)) result.push({table:m[1],columns:m[2].split(',').map(x=>x.trim()),rows:m[3].replace(/\r\n/g,'\n').split('\n').filter((_,i,a)=>i<a.length-1)});
  if(result.length!==4||new Set(result.map(x=>x.table)).size!==4)throw Error('COPY_FRAMING_MISMATCH');
  for(const b of result)for(const row of b.rows)if(row.split('\t').length!==b.columns.length)throw Error('COPY_COLUMN_MISMATCH');
  return result;
}
module.exports={tables,buildSelection,copyBlocks,selectEntry};
