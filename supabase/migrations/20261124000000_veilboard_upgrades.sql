-- Incremental upgrade: multi-image media gallery & burnt note material config.
-- Fully backward-compatible with legacy image_path and existing RPC contracts.

alter table public.notes
  add column if not exists media jsonb not null default '[]'
    check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 12),
  add column if not exists burn_config jsonb;

create or replace function private.veilboard_valid_media(m jsonb, p_campaign_id uuid) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;
begin
  if jsonb_typeof(m) is distinct from 'array' or jsonb_array_length(m) > 12 then return false; end if;
  for item in select jsonb_array_elements(m) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    if item->>'path' is null or not starts_with(item->>'path', p_campaign_id::text || '/') then return false; end if;
    if item ? 'caption' and (jsonb_typeof(item->'caption') <> 'string' or char_length(item->>'caption') > 200) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function private.veilboard_valid_media(jsonb, uuid) from public, anon, authenticated;

create or replace function private.veilboard_valid_burn(b jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare p numeric;
begin
  if b is null or jsonb_typeof(b) = 'null' then return true; end if;
  if jsonb_typeof(b) <> 'object' then return false; end if;
  if coalesce(b->>'mode', '') not in ('none', 'scorched', 'burning') then return false; end if;
  if b ? 'topology' and coalesce(b->>'topology', '') not in ('corner', 'bottom', 'perimeter', 'point') then return false; end if;
  if b ? 'progress' then
    if jsonb_typeof(b->'progress') <> 'number' then return false; end if;
    p := (b->>'progress')::numeric;
    if p < 0 or p > 1 then return false; end if;
  end if;
  return true;
end $$;
revoke all on function private.veilboard_valid_burn(jsonb) from public, anon, authenticated;

create or replace function public.save_veilboard_note(
  p_campaign_id uuid, p_id uuid, p_patch jsonb, p_expected jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := private.require_actor();
  old public.notes; current_value jsonb; next_value jsonb; seal jsonb; locked boolean; k text;
  effective_media jsonb; effective_image text;
begin
  perform private.lock_campaign(p_campaign_id);
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'INVALID_NOTE'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) key where key not in
    ('title','body','color','surface_x','surface_y','rotation','card_style','pin_color','image_path','media','burn_config','archived_at','capabilities'))
    then raise exception 'INVALID_NOTE_PATCH'; end if;
  select * into old from public.notes where id=p_id for update;
  if found then
    if old.campaign_id<>p_campaign_id or not private.veilboard_can_read(old)
      or not (old.author_id=actor or private.has_role(p_campaign_id,'gm')) then raise exception 'NOTE_NOT_EDITABLE'; end if;
    current_value := private.veilboard_note(old);
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
      'surface_x',0,'surface_y',0,'rotation',0,'card_style','note','pin_color','red','image_path',null,'media','[]'::jsonb,'burn_config',null,'archived_at',null);
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

  effective_media := coalesce(next_value->'media', '[]'::jsonb);
  if not private.veilboard_valid_media(effective_media, p_campaign_id) then raise exception 'INVALID_NOTE'; end if;
  if not private.veilboard_valid_burn(next_value->'burn_config') then raise exception 'INVALID_NOTE'; end if;

  effective_image := coalesce(next_value->>'image_path', effective_media->0->>'path');
  if char_length(next_value->>'title') not between 1 and 80 or char_length(next_value->>'body')>1000
    or (effective_image is not null and not starts_with(effective_image,p_campaign_id::text||'/'))
    then raise exception 'INVALID_NOTE'; end if;

  if old.id is null then
    insert into public.notes(id,campaign_id,author_id,title) values(p_id,p_campaign_id,actor,'新便签')
      returning * into old;
  end if;
  if locked then
    insert into private.veilboard_secrets values(p_id,jsonb_build_object(
      'title',next_value->'title','body',next_value->'body',
      'image_path',to_jsonb(effective_image),'media',effective_media,
      'capabilities',next_value->'capabilities'))
      on conflict(note_id) do update set content=excluded.content;
  else
    delete from private.veilboard_secrets where note_id=p_id;
  end if;
  update public.notes set
    title=case when locked then '机密便签' else next_value->>'title' end,
    body=case when locked then '' else next_value->>'body' end,
    image_path=case when locked then null else effective_image end,
    media=case when locked then '[]'::jsonb else effective_media end,
    burn_config=case when jsonb_typeof(next_value->'burn_config')='null' then null else next_value->'burn_config' end,
    capabilities=case when locked then jsonb_build_array(seal) else next_value->'capabilities' end,
    color=next_value->>'color', card_style=next_value->>'card_style',
    pin_color=next_value->>'pin_color', rotation=(next_value->>'rotation')::numeric,
    surface_x=(next_value->>'surface_x')::double precision, surface_y=(next_value->>'surface_y')::double precision,
    archived_at=(next_value->>'archived_at')::timestamptz, surface_version=surface_version+1,updated_at=now()
  where id=p_id returning * into old;
  return private.veilboard_note(old);
end $$;

create or replace function private.veilboard_image_allowed(path text,uploader text) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(
    select 1 from private.veilboard_secrets s join public.notes n on n.id=s.note_id
    where (
      s.content->>'image_path'=path
      or exists(select 1 from jsonb_array_elements(coalesce(s.content->'media','[]'::jsonb)) m where m->>'path'=path)
    ) and not private.veilboard_can_read(n)
  ) and (
    path !~ '^[0-9a-f-]{36}/note-' or uploader=auth.uid()::text
    or exists(select 1 from public.notes where image_path=path
      or exists(select 1 from jsonb_array_elements(media) m where m->>'path'=path))
    or exists(select 1 from private.veilboard_secrets s join public.notes n on n.id=s.note_id
      where (
        s.content->>'image_path'=path
        or exists(select 1 from jsonb_array_elements(coalesce(s.content->'media','[]'::jsonb)) m where m->>'path'=path)
      ) and private.veilboard_can_read(n))
  )
$$;
revoke all on function private.veilboard_image_allowed(text,text) from public,anon,authenticated;
grant execute on function private.veilboard_image_allowed(text,text) to anon,authenticated;
