-- Bestia: vetrina degli obiettivi di un membro della compagnia.
--
-- Da eseguire nel SQL Editor di Supabase DOPO 0012_festa.sql (vedi SUPABASE.md).
--
-- member_showcase(membro) mostra a chi è nella stessa compagnia gli obiettivi raggiunti da quel
-- membro e, per ognuno, quanti nella compagnia ce l'hanno (per metterli in ordine di rarità).
-- Vale "raggiunto", anche se il premio non è ancora stato riscosso.

-- Gli obiettivi di un profilo con valore e soglia (come my_achievement_rows, senza "riscosso").
create or replace function public.achievement_rows_of(p_profile uuid)
returns table (id text, value int, goal int)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.metrics_of(p_profile, 'infinity', null))
  select d.id,
         coalesce(m.value, 0),
         coalesce(d.goal, (select count(*)::int from public.avatar_items a where a.active and 'cat:' || a.category = d.metric))
  from public.achievement_defs d
  left join m on m.metric = d.metric;
$$;

create or replace function public.member_showcase(p_member uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_group uuid;
  v_profile uuid;
  v_name text;
  v_out jsonb;
begin
  select group_id, profile_id, name into v_group, v_profile, v_name from public.group_members where id = p_member;
  if v_group is null or not public.is_group_member(v_group) then raise exception 'not_allowed'; end if;
  if v_profile is null then
    return jsonb_build_object('name', v_name, 'has_account', false, 'members', 0, 'total', (select count(*) from public.achievement_defs),
                              'achievements', '[]'::jsonb, 'counts', '{}'::jsonb);
  end if;

  with peers as (
    select distinct profile_id from public.group_members where group_id = v_group and profile_id is not null
  ),
  reached as (
    select p.profile_id, r.id from peers p cross join lateral public.achievement_rows_of(p.profile_id) r where r.value >= r.goal
  )
  select jsonb_build_object(
    'name', v_name,
    'has_account', true,
    'members', (select count(*) from peers),
    'total', (select count(*) from public.achievement_defs),
    'achievements', coalesce((select jsonb_agg(id order by id) from reached where profile_id = v_profile), '[]'::jsonb),
    'counts', coalesce((select jsonb_object_agg(id, n) from (select id, count(*) n from reached group by id) c), '{}'::jsonb)
  ) into v_out;
  return v_out;
end $$;

revoke all on function public.achievement_rows_of(uuid) from public, anon, authenticated;
revoke all on function public.member_showcase(uuid) from public, anon;
grant execute on function public.member_showcase(uuid) to authenticated;
