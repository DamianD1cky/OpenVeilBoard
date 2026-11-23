-- Extend the deployed tables without changing legacy pixel coordinates or RPCs.
alter table public.notes
  add column if not exists card_style text not null default 'note' check (card_style in ('polaroid','note','dossier','urgent')),
  add column if not exists capabilities jsonb not null default '[]' check (jsonb_typeof(capabilities)='array' and jsonb_array_length(capabilities)<=20),
  add column if not exists archived_at timestamptz,
  add column if not exists surface_x double precision check (surface_x between -0.5 and 0.5),
  add column if not exists surface_y double precision check (surface_y between -0.5 and 0.5),
  add column if not exists surface_version integer not null default 0;
alter table public.note_links
  add column if not exists color text not null default '#b83227' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists style text not null default 'rope' check (style in ('rope','twine','gold','muted'));

-- Keep one placement across both clients, preserving the legacy pixel units.
create or replace function private.sync_veilboard_position() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.surface_x is null then new.surface_x:=greatest(-0.5,least(0.5,(new.x-44)::double precision/2056-0.5));
    else new.x:=round((new.surface_x+0.5)*2056+44)::integer; end if;
    if new.surface_y is null then new.surface_y:=greatest(-0.5,least(0.5,(new.y-44)::double precision/1118-0.5));
    else new.y:=round((new.surface_y+0.5)*1118+44)::integer; end if;
  else
    if new.surface_x is distinct from old.surface_x then new.x:=round((new.surface_x+0.5)*2056+44)::integer;
    elsif new.x is distinct from old.x then new.surface_x:=greatest(-0.5,least(0.5,(new.x-44)::double precision/2056-0.5)); end if;
    if new.surface_y is distinct from old.surface_y then new.y:=round((new.surface_y+0.5)*1118+44)::integer;
    elsif new.y is distinct from old.y then new.surface_y:=greatest(-0.5,least(0.5,(new.y-44)::double precision/1118-0.5)); end if;
  end if;
  return new;
end $$;
drop trigger if exists sync_veilboard_position on public.notes;
create trigger sync_veilboard_position before insert or update of x,y,surface_x,surface_y on public.notes
for each row execute function private.sync_veilboard_position();

-- Secret content is physically absent from public tables and Realtime payloads.
-- Legacy get_campaign_board/get_note_links RPCs can only return the sealed stub.
create table if not exists private.veilboard_secrets (
  note_id uuid primary key references public.notes(id) on delete cascade,
  content jsonb not null
);
revoke all on private.veilboard_secrets from public, anon, authenticated;
create or replace function private.veilboard_valid_capability(c jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare d jsonb:=c->'data'; t text:=c->>'type'; item jsonb; segments numeric; value numeric;
begin
  if c->>'id' is null or char_length(c->>'id') not between 1 and 80
    or jsonb_typeof(c->'enabled') is distinct from 'boolean' or jsonb_typeof(d) is distinct from 'object' then return false; end if;
  if t in ('checklist','resources') then
    if jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items')>100 then return false; end if;
    for item in select jsonb_array_elements(d->'items') loop
      if jsonb_typeof(item)<>'object' or item->>'id' is null then return false; end if;
      if t='checklist' and (jsonb_typeof(item->'text') is distinct from 'string' or char_length(item->>'text')>200 or jsonb_typeof(item->'done') is distinct from 'boolean') then return false; end if;
      if t='resources' and (jsonb_typeof(item->'name') is distinct from 'string' or jsonb_typeof(item->'value') is distinct from 'string' or char_length(item->>'name')>80 or char_length(item->>'value')>80) then return false; end if;
    end loop;
  elsif t='event_clock' then
    if jsonb_typeof(d->'segments') is distinct from 'number' or jsonb_typeof(d->'value') is distinct from 'number' then return false; end if;
    if jsonb_typeof(d->'name') is distinct from 'string' or jsonb_typeof(d->'consequence') is distinct from 'string'
      or char_length(d->>'name')>80 or char_length(d->>'consequence')>500 then return false; end if;
    segments:=(d->>'segments')::numeric; value:=(d->>'value')::numeric;
    if segments<>trunc(segments) or segments not between 2 and 24 or value<>trunc(value) or value not between 0 and segments
      or coalesce(d->>'mode','') not in ('progress','scale') then return false; end if;
  elsif t='dice_action' then
    if jsonb_typeof(d->'notation') is distinct from 'string' or char_length(d->>'notation') not between 1 and 160 then return false; end if;
    if jsonb_typeof(d->'label') is distinct from 'string' or char_length(d->>'label')>80
      or coalesce(jsonb_typeof(d->'last'),'null') not in ('number','null') then return false; end if;
  elsif t='comments' then
    if jsonb_typeof(d->'entries') is distinct from 'array' or jsonb_array_length(d->'entries')>200 then return false; end if;
  elsif t='secret' then
    if coalesce(d->>'scope','') not in ('all','gm','selected') or jsonb_typeof(d->'users') is distinct from 'array' then return false; end if;
  elsif t='tags' then
    if jsonb_typeof(d->'tags') is distinct from 'array' or jsonb_array_length(d->'tags')>20 then return false; end if;
    for item in select jsonb_array_elements(d->'tags') loop
      if jsonb_typeof(item)<>'string' or char_length(item#>>'{}')>40 then return false; end if;
    end loop;
  else return false; end if;
  return true;
end $$;
revoke all on function private.veilboard_valid_capability(jsonb) from public,anon,authenticated;
create or replace function private.veilboard_can_read(n public.notes) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_member(n.campaign_id) and (
    private.has_role(n.campaign_id,'gm') or not exists(
      select 1 from jsonb_array_elements(n.capabilities) c
      where c->>'type'='secret' and (c->>'enabled')::boolean
        and coalesce(c->'data'->>'scope','all') <> 'all'
        and not (c->'data'->'users' @> jsonb_build_array(private.current_actor_id()::text)
          and c->'data'->>'scope'='selected')
    )
  )
$$;
revoke all on function private.veilboard_can_read(public.notes) from public,anon,authenticated;

create or replace function private.veilboard_note(n public.notes) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(n) || coalesce(
    (select content from private.veilboard_secrets where note_id=n.id and private.veilboard_can_read(n)), '{}'::jsonb
  ) || jsonb_build_object('author_name',coalesce((select display_name from public.profiles where id=n.author_id),''))
$$;
revoke all on function private.veilboard_note(public.notes) from public,anon,authenticated;

create or replace function public.get_veilboard(p_campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_actor();
  if not private.is_member(p_campaign_id) then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
  return jsonb_build_object(
    'notes',(select coalesce(jsonb_agg(private.veilboard_note(n) order by n.layer),'[]') from public.notes n where campaign_id=p_campaign_id),
    'edges',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from public.note_links e where campaign_id=p_campaign_id),
    'clock',(select clock_config from public.campaign_settings where campaign_id=p_campaign_id),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'character_name',character_name,'role',role)),'[]')
      from public.campaign_members where campaign_id=p_campaign_id and active)
  );
end $$;

create or replace function public.save_veilboard_note(
  p_campaign_id uuid, p_id uuid, p_patch jsonb, p_expected jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := private.require_actor();
  old public.notes; current_value jsonb; next_value jsonb; seal jsonb; locked boolean; k text;
begin
  perform private.lock_campaign(p_campaign_id);
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'INVALID_NOTE'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) key where key not in
    ('title','body','color','surface_x','surface_y','rotation','card_style','pin_color','image_path','archived_at','capabilities'))
    then raise exception 'INVALID_NOTE_PATCH'; end if;
  select * into old from public.notes where id=p_id for update;
  if found then
    if old.campaign_id<>p_campaign_id or not private.veilboard_can_read(old)
      or not (old.author_id=actor or private.has_role(p_campaign_id,'gm')) then raise exception 'NOTE_NOT_EDITABLE'; end if;
    current_value := private.veilboard_note(old);
    -- Materialize legacy positions for comparison, leaving x/y unchanged.
    current_value := current_value || jsonb_build_object(
      'surface_x',coalesce(old.surface_x,greatest(-0.5,least(0.5,(old.x-44)::double precision/2056-0.5))),
      'surface_y',coalesce(old.surface_y,greatest(-0.5,least(0.5,(old.y-44)::double precision/1118-0.5))));
    if p_expected is null then raise exception 'NOTE_CONFLICT'; end if;
    for k in select jsonb_object_keys(p_expected) loop
      if k='archived_at' then
        if (current_value->>k)::timestamptz is distinct from (p_expected->>k)::timestamptz then raise exception 'NOTE_CONFLICT'; end if;
      elsif current_value->k is distinct from p_expected->k then raise exception 'NOTE_CONFLICT'; end if;
    end loop;
  else
    if p_expected is not null then raise exception 'NOTE_CONFLICT'; end if;
    current_value := jsonb_build_object('title','新便签','body','','color','yellow','capabilities','[]'::jsonb,
      'surface_x',0,'surface_y',0,'rotation',0,'card_style','note','pin_color','red','image_path',null,'archived_at',null);
  end if;
  next_value := current_value || p_patch;
  if jsonb_typeof(next_value->'capabilities')<>'array' or jsonb_array_length(next_value->'capabilities')>20
    then raise exception 'INVALID_CAPABILITIES'; end if;
  if exists(select 1 from jsonb_array_elements(next_value->'capabilities') c
    where c->>'type' not in ('checklist','event_clock','dice_action','comments','secret','resources','tags')
      or jsonb_typeof(c->'data')<>'object' or jsonb_typeof(c->'enabled')<>'boolean')
    then raise exception 'INVALID_CAPABILITIES'; end if;
  if octet_length((next_value->'capabilities')::text)>65536
    or exists(select 1 from jsonb_array_elements(next_value->'capabilities') c where not private.veilboard_valid_capability(c))
    or (select count(*) from jsonb_array_elements(next_value->'capabilities')) <>
       (select count(distinct c->>'id') from jsonb_array_elements(next_value->'capabilities') c)
    then raise exception 'INVALID_CAPABILITIES'; end if;
  if exists(
    select 1 from jsonb_array_elements(next_value->'capabilities') c where c->>'type'='comments'
      and c->'data'->'entries' is distinct from coalesce(
        (select prior->'data'->'entries' from jsonb_array_elements(current_value->'capabilities') prior where prior->>'id'=c->>'id' and prior->>'type'='comments'),'[]'::jsonb)
  ) then raise exception 'COMMENT_NOT_EDITABLE'; end if;
  select c into seal from jsonb_array_elements(next_value->'capabilities') c
    where c->>'type'='secret' and (c->>'enabled')::boolean limit 1;
  if (select coalesce(jsonb_agg(c),'[]') from jsonb_array_elements(next_value->'capabilities') c where c->>'type'='secret')
      is distinct from (select coalesce(jsonb_agg(c),'[]') from jsonb_array_elements(current_value->'capabilities') c where c->>'type'='secret')
    and not private.has_role(p_campaign_id,'gm') then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
  if seal is not null and (coalesce(seal->'data'->>'scope','') not in ('all','gm','selected')
    or (seal->'data'->>'scope'='selected' and coalesce(jsonb_typeof(seal->'data'->'users'),'')<>'array'))
    then raise exception 'INVALID_SECRET'; end if;
  locked := seal is not null and seal->'data'->>'scope'<>'all';
  if char_length(next_value->>'title') not between 1 and 80 or char_length(next_value->>'body')>1000
    or (next_value->>'image_path' is not null and not starts_with(next_value->>'image_path',p_campaign_id::text||'/'))
    then raise exception 'INVALID_NOTE'; end if;
  if old.id is null then
    insert into public.notes(id,campaign_id,author_id,title) values(p_id,p_campaign_id,actor,'新便签')
      returning * into old;
  end if;
  if locked then
    insert into private.veilboard_secrets values(p_id,jsonb_build_object('title',next_value->'title','body',next_value->'body',
      'image_path',next_value->'image_path','capabilities',next_value->'capabilities'))
      on conflict(note_id) do update set content=excluded.content;
  else
    delete from private.veilboard_secrets where note_id=p_id;
  end if;
  update public.notes set
    title=case when locked then '机密便签' else next_value->>'title' end,
    body=case when locked then '' else next_value->>'body' end,
    image_path=case when locked then null else next_value->>'image_path' end,
    capabilities=case when locked then jsonb_build_array(seal) else next_value->'capabilities' end,
    color=next_value->>'color', card_style=next_value->>'card_style',
    pin_color=next_value->>'pin_color', rotation=(next_value->>'rotation')::numeric,
    surface_x=(next_value->>'surface_x')::double precision, surface_y=(next_value->>'surface_y')::double precision,
    archived_at=(next_value->>'archived_at')::timestamptz, surface_version=surface_version+1,updated_at=now()
  where id=p_id returning * into old;
  return private.veilboard_note(old);
end $$;

create or replace function public.delete_veilboard_note(p_campaign_id uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_campaign(p_campaign_id);
  delete from public.notes where id=p_id and campaign_id=p_campaign_id
    and (author_id=private.current_actor_id() or private.has_role(p_campaign_id,'gm'));
  if not found then raise exception 'NOTE_NOT_EDITABLE'; end if;
end $$;

create or replace function public.save_veilboard_edge(
  p_campaign_id uuid,p_id uuid,p_from uuid,p_to uuid,p_label text,p_color text,p_style text
) returns public.note_links language plpgsql security definer set search_path='' as $$
declare result public.note_links; endpoint public.notes;
begin
  perform private.lock_campaign(p_campaign_id);
  if p_from=p_to then raise exception 'NOTE_LINK_SELF'; end if;
  if char_length(p_label)>120 then raise exception 'INVALID_LINK_LABEL'; end if;
  for endpoint in select * from public.notes where id in (p_from,p_to) loop
    if endpoint.campaign_id<>p_campaign_id or not private.veilboard_can_read(endpoint) then raise exception 'NOTE_NOT_EDITABLE'; end if;
  end loop;
  if (select count(*) from public.notes where campaign_id=p_campaign_id and id in(p_from,p_to))<>2 then raise exception 'NOTE_NOT_FOUND'; end if;
  if exists(select 1 from public.note_links where id=p_id and campaign_id<>p_campaign_id) then raise exception 'CAMPAIGN_ROLE_REQUIRED'; end if;
  if exists(select 1 from public.note_links where id=p_id and campaign_id=p_campaign_id) then
    update public.note_links set label=nullif(p_label,''),color=p_color,style=p_style where id=p_id returning * into result;
    return result;
  end if;
  insert into public.note_links(id,campaign_id,from_note_id,to_note_id,label,color,style)
    values(p_id,p_campaign_id,least(p_from,p_to),greatest(p_from,p_to),nullif(p_label,''),p_color,p_style)
    on conflict(from_note_id,to_note_id) do update set label=excluded.label,color=excluded.color,style=excluded.style
    returning * into result;
  return result;
end $$;

create or replace function public.comment_veilboard_note(
  p_campaign_id uuid,p_id uuid,p_capability_id text,p_body text,p_delete_id text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_actor(); n public.notes; content jsonb; caps jsonb; cap jsonb; entries jsonb;
begin
  perform private.lock_campaign(p_campaign_id);
  select * into n from public.notes where id=p_id and campaign_id=p_campaign_id for update;
  if not found or not private.veilboard_can_read(n) then raise exception 'NOTE_NOT_EDITABLE'; end if;
  content:=private.veilboard_note(n); caps:=content->'capabilities';
  select c into cap from jsonb_array_elements(caps) c where c->>'id'=p_capability_id and c->>'type'='comments' and (c->>'enabled')::boolean;
  if cap is null then raise exception 'COMMENTS_NOT_ENABLED'; end if;
  entries:=coalesce(cap->'data'->'entries','[]'::jsonb);
  if p_delete_id is not null then
    if not exists(select 1 from jsonb_array_elements(entries) e where e->>'id'=p_delete_id and e->>'authorId'=actor::text)
      then raise exception 'COMMENT_NOT_EDITABLE'; end if;
    select coalesce(jsonb_agg(e),'[]') into entries from jsonb_array_elements(entries) e where e->>'id'<>p_delete_id;
  else
    if char_length(trim(p_body)) not between 1 and 500 or jsonb_array_length(entries)>=200 then raise exception 'INVALID_COMMENT'; end if;
    entries:=entries||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'authorId',actor::text,
      'authorName',(select display_name from public.profiles where id=actor),'body',trim(p_body),'createdAt',now()));
  end if;
  cap:=jsonb_set(cap,'{data,entries}',entries);
  select jsonb_agg(case when c->>'id'=p_capability_id then cap else c end) into caps from jsonb_array_elements(caps) c;
  if exists(select 1 from private.veilboard_secrets where note_id=p_id) then
    update private.veilboard_secrets set content=jsonb_set(private.veilboard_secrets.content,'{capabilities}',caps) where note_id=p_id;
    update public.notes set surface_version=surface_version+1,updated_at=now() where id=p_id returning * into n;
  else
    update public.notes set capabilities=caps,surface_version=surface_version+1,updated_at=now() where id=p_id returning * into n;
  end if;
  return private.veilboard_note(n);
end $$;

revoke all on function public.get_veilboard(uuid),public.save_veilboard_note(uuid,uuid,jsonb,jsonb),
  public.delete_veilboard_note(uuid,uuid),public.save_veilboard_edge(uuid,uuid,uuid,uuid,text,text,text),
  public.comment_veilboard_note(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.get_veilboard(uuid),public.save_veilboard_note(uuid,uuid,jsonb,jsonb),
  public.delete_veilboard_note(uuid,uuid),public.save_veilboard_edge(uuid,uuid,uuid,uuid,text,text,text),
  public.comment_veilboard_note(uuid,uuid,text,text,text) to authenticated;

-- Existing storage policies grant member access to every image in the room.
-- Secret cover images therefore need the same note audience restriction.
create or replace function private.veilboard_image_allowed(path text,uploader text) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(
    select 1 from private.veilboard_secrets s join public.notes n on n.id=s.note_id
    where s.content->>'image_path'=path and not private.veilboard_can_read(n)
  ) and (
    path !~ '^[0-9a-f-]{36}/note-' or uploader=auth.uid()::text
    or exists(select 1 from public.notes where image_path=path)
    or exists(select 1 from private.veilboard_secrets s join public.notes n on n.id=s.note_id
      where s.content->>'image_path'=path and private.veilboard_can_read(n))
  )
$$;
revoke all on function private.veilboard_image_allowed(text,text) from public,anon,authenticated;
grant execute on function private.veilboard_image_allowed(text,text) to anon,authenticated;
drop policy if exists veilboard_secret_image on storage.objects;
create policy veilboard_secret_image on storage.objects as restrictive for select to anon,authenticated
  using(bucket_id<>'campaign-media' or private.veilboard_image_allowed(name,owner_id));

do $realtime$
declare t text;
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['notes','note_links','campaign_settings','campaign_members'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $realtime$;
