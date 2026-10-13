# 保養品比價雷達

每日抓取 momo、品牌官網、蝦皮、酷澎上的 雅漾(Avène) 活泉水噴霧、AHC 精華液／原液、OLAY 乳霜價格與活動。

## 部署步驟
1. Supabase 建立新專案，SQL Editor 依序執行 `supabase/schema.sql`、`supabase/seed.sql`
2. Vercel 匯入此 repo，設定環境變數：
   - `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_KEY`（管理頁密碼，自訂）
   - `CRON_SECRET`（自訂亂數字串，Vercel Cron 會自動帶上）
3. 部署後打開 `/api/cron?key=ADMIN_KEY` 手動跑第一次
4. 之後每天台灣時間 09:00 自動更新（`vercel.json`）

## 新增商品
到 `/admin` 貼上商品頁網址（可多筆），系統自動判斷平台、品牌、品項、規格並立即抓一次。
