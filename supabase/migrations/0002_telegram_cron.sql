-- Migration: 0002_telegram_cron.sql
-- Adds telegram_chat_id column to reminder_preferences if not present
alter table public.reminder_preferences
add column if not exists telegram_chat_id text;

-- Setup scheduled cron if pg_cron extension is available on the Supabase project
create extension if not exists pg_cron;

-- Schedule the send-reminder Edge Function to run daily at 09:00 AM UTC
-- (Commented by default so developers can enable when Edge Function is deployed)
/*
select cron.schedule(
  'studyflow-daily-reminders',
  '0 9 * * *',
  $$
  select
    net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminder',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
*/
