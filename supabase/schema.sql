-- 電商比價追蹤 schema
create table if not exists ec_listings (
  id bigserial primary key,
  brand text,                     -- 雅漾 Avène / AHC / OLAY（自動分類，可手動改）
  line text,                      -- 活泉水噴霧 / 精華液 / 原液 / 乳霜
  spec text,                      -- 300ml、300ml×3 …（從標題解析）
  platform text not null check (platform in ('momo','official','shopee','coupang')),
  url text not null unique,
  title text,                     -- 平台上的商品標題（每次抓取更新）
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists ec_price_snapshots (
  id bigserial primary key,
  listing_id bigint references ec_listings(id) on delete cascade,
  captured_on date not null default (now() at time zone 'Asia/Taipei')::date,
  captured_at timestamptz default now(),
  status text not null,           -- ok / blocked / not_found / error
  list_price int,                 -- 市售價 / 原價
  sale_price int,                 -- 促銷價
  final_price int,                -- 限時折後價（實際最低成交價）
  promos jsonb default '[]',      -- [{text, period}]
  in_stock boolean,
  error text,
  unique (listing_id, captured_on)
);
create index if not exists ec_price_snapshots_day on ec_price_snapshots (captured_on desc);

-- 只開放讀取給網頁（anon），寫入只透過 service role
alter table ec_listings enable row level security;
alter table ec_price_snapshots enable row level security;
create policy "ec read listings" on ec_listings for select using (true);
create policy "ec read snapshots" on ec_price_snapshots for select using (true);
