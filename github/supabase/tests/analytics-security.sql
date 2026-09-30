-- Run as the SQL Editor administrator. All fixtures are rolled back.
-- An assertion/error means a regression; the script must reach the final PASS.
begin;
select set_config('momento.test_user', gen_random_uuid()::text, true);
select set_config('momento.test_browser', gen_random_uuid()::text, true);
insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at)
values (current_setting('momento.test_user')::uuid,
  'analytics-fixture-' || current_setting('momento.test_user') || '@example.invalid',
  '{"display_name":"Analytics test"}', now(), now());

set local role anon;
do $$
declare browser uuid := current_setting('momento.test_browser')::uuid;
  private_value text;
begin
  insert into public.analytics_events (event_name, session_id, metadata)
  values ('page_view', browser, '{"utm_source":"pinterest","utm_campaign":"launch"}');
  insert into public.analytics_events (event_name, session_id, metadata)
  values ('first_memory_created', browser, '{"mode":"guest","photo_count":2}');
  begin
    insert into public.analytics_events (event_name, session_id, metadata)
    values ('first_memory_created', browser, '{"mode":"guest"}');
    raise exception 'FAIL: duplicate guest first conversion accepted';
  exception when unique_violation then null; end;
  begin
    perform count(*) from public.analytics_events;
    raise exception 'FAIL: anonymous read allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.analytics_events set event_name = 'page_view';
    raise exception 'FAIL: anonymous update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.analytics_events;
    raise exception 'FAIL: anonymous delete allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.analytics_events (event_name, session_id, user_id)
    values ('page_view', browser, current_setting('momento.test_user')::uuid);
    raise exception 'FAIL: anonymous user ID accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.analytics_events (event_name, session_id, created_at)
    values ('page_view', browser, '2000-01-01');
    raise exception 'FAIL: client timestamp override accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.analytics_events (event_name, session_id)
    values ('unknown_event', browser);
    raise exception 'FAIL: unknown event accepted';
  exception when check_violation then null; end;
  foreach private_value in array array[
    '{"text":"PRIVATE"}', '{"title":"PRIVATE"}', '{"email":"PRIVATE"}',
    '{"location":"PRIVATE"}', '{"password":"PRIVATE"}', '{"bio":"PRIVATE"}',
    '{"photo_url":"PRIVATE"}', '{"filename":"PRIVATE"}',
    '{"source":"PRIVATE"}', '{"mode":"PRIVATE"}', '{"photo_count":6}',
    '{"photo_count":-1}', '{"photo_count":1.5}', '{"memory_count":100001}',
    '{"confirmation_required":"true"}', '{"source":null}', '{"photo_count":null}',
    '{"utm_source":"private@example.com"}', '{"utm_campaign":"https://example.com"}',
    '{"utm_content":{"text":"PRIVATE"}}', '{"utm_medium":null}'
  ] loop
    begin
      insert into public.analytics_events (event_name, session_id, metadata)
      values ('page_view', browser, private_value::jsonb);
      raise exception 'FAIL: unsafe metadata accepted: %', private_value;
    exception when check_violation then null; end;
  end loop;
  begin
    insert into public.analytics_events (event_name, session_id, metadata)
    values ('first_memory_created', gen_random_uuid(), '{"mode":"cloud"}');
    raise exception 'FAIL: anonymous cloud first conversion accepted';
  exception when check_violation then null; end;
end $$;
reset role;

select set_config('request.jwt.claims',
  jsonb_build_object('sub', current_setting('momento.test_user'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare browser uuid := current_setting('momento.test_browser')::uuid;
  account uuid := current_setting('momento.test_user')::uuid;
begin
  assert auth.uid() = account, 'JWT fixture did not set auth.uid()';
  insert into public.analytics_events (event_name, session_id, user_id, metadata)
  values ('login_completed', browser, account, '{"mode":"cloud"}');
  insert into public.analytics_events (event_name, session_id, user_id, metadata)
  values ('first_memory_created', browser, account, '{"mode":"cloud"}');
  begin
    insert into public.analytics_events (event_name, session_id, user_id, metadata)
    values ('first_memory_created', gen_random_uuid(), account, '{"mode":"cloud"}');
    raise exception 'FAIL: duplicate cloud first conversion accepted across browsers';
  exception when unique_violation then null; end;
  begin
    perform count(*) from public.analytics_events;
    raise exception 'FAIL: authenticated read allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.analytics_events set event_name = 'page_view';
    raise exception 'FAIL: authenticated update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.analytics_events;
    raise exception 'FAIL: authenticated delete allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.analytics_events (event_name, session_id, user_id)
    values ('page_view', browser, gen_random_uuid());
    raise exception 'FAIL: forged authenticated user ID accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.analytics_events (event_name, session_id)
    values ('page_view', browser);
    raise exception 'FAIL: authenticated null user ID accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: safe inserts, denied reads/writes/forgeries, metadata constraints and first-memory uniqueness' as result;
