create extension if not exists pgcrypto;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_hash text not null,
  file_type text not null default 'pdf' check (file_type in ('pdf')),
  total_pages integer,
  tags text[] not null default '{}',
  status text not null default 'in_progress' check (status in ('in_progress','completed','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, file_hash)
);

create table public.document_progress (
  document_id uuid primary key references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  current_locator jsonb not null default '{"page":1,"y":0}'::jsonb,
  visited_ranges jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  last_meaningful_activity_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.highlights (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  locator jsonb not null,
  quote_text text not null,
  color text not null check (color in ('apricot','rose','olive','blue')),
  rects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table public.notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  highlight_id uuid references public.highlights(id) on delete set null,
  type text not null check (type in ('quick','question','parking')),
  locator jsonb not null,
  quote_text text,
  note_text text not null default '',
  status text check (status in ('open','resolved','reopened')),
  resolution_text text,
  is_active_parking boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index one_active_parking_note_per_document
on public.notes(document_id)
where type = 'parking' and is_active_parking = true;

create table public.reading_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  active_seconds integer not null default 0,
  start_locator jsonb,
  end_locator jsonb,
  updated_at timestamptz not null default now()
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null check (type in ('meme','audio','collectible','certificate','ambient','easter_egg')),
  title text not null,
  asset_path text,
  payload jsonb not null default '{}'::jsonb,
  weight integer not null default 10 check (weight > 0),
  cooldown_unlocks integer not null default 3 check (cooldown_unlocks >= 0),
  one_time boolean not null default false,
  active boolean not null default true
);

create table public.unlocked_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  reward_id uuid not null references public.rewards(id),
  unlocked_at timestamptz not null default now(),
  unique(user_id, document_id)
);

create table public.reminder_preferences (
  document_id uuid primary key references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  inactivity_days integer check (inactivity_days in (1,3,7)),
  enabled boolean not null default true,
  show_context boolean not null default true,
  snoozed_until timestamptz,
  next_reminder_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.reminder_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  sent_at timestamptz not null default now(),
  status text not null check (status in ('sent','failed','skipped')),
  detail text
);

alter table public.documents enable row level security;
alter table public.document_progress enable row level security;
alter table public.highlights enable row level security;
alter table public.notes enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.unlocked_rewards enable row level security;
alter table public.reminder_preferences enable row level security;
alter table public.reminder_logs enable row level security;

create policy "own documents" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own progress" on public.document_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own highlights" on public.highlights for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notes" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on public.reading_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own unlocks" on public.unlocked_rewards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reminder preferences" on public.reminder_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reminder logs" on public.reminder_logs for select using (auth.uid() = user_id);

grant select on public.rewards to authenticated;
