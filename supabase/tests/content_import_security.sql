\set ON_ERROR_STOP on
\pset tuples_only on

-- Runs only in the disposable database created by run_all.sh.
insert into auth.users(id,email)
values ('00000000-0000-0000-0000-0000000000a1','import-admin@example.test')
on conflict (id) do nothing;
insert into user_roles(user_id,role)
values ('00000000-0000-0000-0000-0000000000a1','SUPER_ADMIN')
on conflict do nothing;

set role authenticated;
set app.uid = '00000000-0000-0000-0000-0000000000a1';
insert into content_import_batches(id,filename,uploaded_by,dry_run,total_rows,valid_rows)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','guard-test.xlsx','00000000-0000-0000-0000-0000000000a1',false,1,1);
reset role;

-- Execute as the local database owner to bypass RLS and prove the trigger is the final guard.
do $$
begin
  begin
    update content_import_batches set status='IMPORTING'
    where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'FAIL direct batch status update was allowed';
  exception when raise_exception then
    if sqlerrm='FAIL direct batch status update was allowed' then raise; end if;
  end;
  begin
    update content_import_batches set error_rows=99
    where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'FAIL direct batch error counter update was allowed';
  exception when raise_exception then
    if sqlerrm='FAIL direct batch error counter update was allowed' then raise; end if;
  end;
  begin
    update content_import_batches set finished_at=now()
    where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    raise exception 'FAIL direct batch finish-time update was allowed';
  exception when raise_exception then
    if sqlerrm='FAIL direct batch finish-time update was allowed' then raise; end if;
  end;
end $$;

set role authenticated;
-- The RPC controls transitions and recalculates error counts from stored records.
select transition_content_import_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','READY');
insert into content_import_errors(batch_id,sheet_name,row_number,field_name,error_code,message)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','Stories',2,'story_key','invalid_story','fixture');
select transition_content_import_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','IMPORTING');
select transition_content_import_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','COMPLETED');
select case when status='FAILED' and error_rows=1 and finished_at is not null
  then 'PASS server-derived terminal state and count'
  else 'FAIL incorrect terminal state/count' end
from content_import_batches where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

-- Dry-run validation can finish without importing stories, but its error total is server-derived.
insert into content_import_batches(id,filename,uploaded_by,dry_run,total_rows,valid_rows)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','dry-run.xlsx','00000000-0000-0000-0000-0000000000a1',true,1,1);
insert into content_import_errors(batch_id,sheet_name,row_number,field_name,error_code,message)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','Stories',2,'title','required','fixture');
select transition_content_import_batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','COMPLETED');
select case when status='COMPLETED' and error_rows=1 and finished_at is not null
  then 'PASS dry-run completion and error count'
  else 'FAIL incorrect dry-run state/count' end
from content_import_batches where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

-- A batch cannot be inserted already finished or with a client-chosen status.
do $$
begin
  begin
    insert into content_import_batches(id,filename,uploaded_by,dry_run,total_rows,valid_rows,status)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','forged.xlsx','00000000-0000-0000-0000-0000000000a1',false,1,1,'COMPLETED');
    raise exception 'FAIL forged initial batch state was allowed';
  exception when raise_exception then
    if sqlerrm='FAIL forged initial batch state was allowed' then raise; end if;
  end;
end $$;

reset role;
