-- Migration: 0002_telegram_cron.sql
-- Adds telegram_chat_id column, automated next_reminder_at sync, and hourly cron schedule

-- 1. Ensure telegram_chat_id exists on reminder_preferences
alter table public.reminder_preferences
add column if not exists telegram_chat_id text;

-- 2. Trigger to keep next_reminder_at synchronized when meaningful activity happens
create or replace function public.update_next_reminder_on_progress()
returns trigger
language plpgsql
security definer
as $$
begin
  if NEW.last_meaningful_activity_at is not null then
    update public.reminder_preferences
    set 
      next_reminder_at = NEW.last_meaningful_activity_at + (coalesce(inactivity_days, 3) || ' days')::interval,
      updated_at = now()
    where document_id = NEW.document_id
      and enabled = true;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_next_reminder on public.document_progress;
create trigger trg_sync_next_reminder
after update of last_meaningful_activity_at on public.document_progress
for each row
execute function public.update_next_reminder_on_progress();

-- 3. Extensions for HTTP requests and cron scheduling
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 4. Hourly reminder trigger function
create or replace function public.invoke_send_reminder()
returns void
language plpgsql
security definer
as $$
declare
  project_url text;
begin
  project_url := current_setting('app.settings.supabase_url', true);
  if project_url is null or project_url = '' then
    project_url := 'https://zzajhdejzcuiiarcwnff.supabase.co';
  end if;

  perform net.http_post(
    url := project_url || '/functions/v1/send-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- 5. Active hourly cron schedule (0 * * * *)
do $$
begin
  perform cron.unschedule('studyflow-hourly-reminder');
exception when others then
  null;
end $$;

select cron.schedule(
  'studyflow-hourly-reminder',
  '0 * * * *',
  'select public.invoke_send_reminder();'
);
