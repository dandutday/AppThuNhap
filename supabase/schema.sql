-- =========================================================
-- schema.sql — Tạo bảng cho app Heo Đất trên Supabase
-- Cách chạy: Supabase Dashboard → SQL Editor → New query → dán toàn bộ → Run
-- Chạy lại nhiều lần cũng không sao (có "if not exists" / "drop policy if exists").
-- =========================================================

-- Hồ sơ người dùng: lưu mục tiêu thu nhập tháng
create table if not exists public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  goal       bigint not null default 0 check (goal >= 0),
  created_at timestamptz not null default now()
);

-- Nguồn thu (Lương, Freelance, ...)
create table if not exists public.sources (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  name       text not null check (char_length(name) between 1 and 40),
  emoji      text not null default '✨',
  color      text not null default '#a7b4c6',
  sort_order int  not null default 0,
  primary key (user_id, id)
);

-- Các khoản thu
create table if not exists public.transactions (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  amount     bigint not null check (amount > 0),
  source_id  text not null,
  date       date not null,
  status     text not null default 'received' check (status in ('received', 'pending')),
  note       text not null default '' check (char_length(note) <= 120),
  series_id  text,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

-- ---------------------------------------------------------
-- Cập nhật v2: thêm KHOẢN CHI + ngân sách
-- (dùng "add column if not exists" nên chạy trên database cũ hay mới đều được;
--  dữ liệu cũ tự nhận type = 'income')
-- ---------------------------------------------------------
alter table public.profiles     add column if not exists budget bigint not null default 0 check (budget >= 0);
alter table public.sources      add column if not exists type text not null default 'income' check (type in ('income', 'expense'));
alter table public.transactions add column if not exists type text not null default 'income' check (type in ('income', 'expense'));

create index if not exists transactions_user_type_date_idx on public.transactions (user_id, type, date desc);

-- Báo PostgREST (API của Supabase) nạp lại cấu trúc bảng ngay
notify pgrst, 'reload schema';

-- ---------------------------------------------------------
-- Row Level Security: mỗi người chỉ đọc/ghi được dữ liệu của chính mình.
-- BẮT BUỘC, vì anon key nằm công khai trong mã nguồn web.
-- ---------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.sources      enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own sources" on public.sources;
create policy "own sources" on public.sources
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
