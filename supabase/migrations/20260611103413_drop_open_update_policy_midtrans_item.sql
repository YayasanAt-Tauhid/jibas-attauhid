-- Webhook midtrans-notification pakai service role (bypass RLS), policy terbuka tidak diperlukan
drop policy if exists "Service update item" on public.transaksi_midtrans_item;
