-- 1. Drop sisa eksperimen matching jurnal antar-lembaga (tidak dipakai aplikasi, tabel 0 baris)
drop view if exists public.v_rekon_belum_match;
drop function if exists public.fn_match_jurnal_pasangan;
drop table if exists public.jurnal_pasangan;

-- 2. Kas kecil: batasi ke admin/kepala/keuangan (sebelumnya semua authenticated bisa baca-tulis)
drop policy if exists kas_kecil_setting_read on public.kas_kecil_setting;
drop policy if exists kas_kecil_setting_write on public.kas_kecil_setting;
create policy kas_kecil_setting_all on public.kas_kecil_setting
  for all to authenticated
  using (is_admin_or_kepala(auth.uid()) or has_role(auth.uid(), 'keuangan'))
  with check (is_admin_or_kepala(auth.uid()) or has_role(auth.uid(), 'keuangan'));

drop policy if exists transaksi_kas_kecil_read on public.transaksi_kas_kecil;
drop policy if exists transaksi_kas_kecil_write on public.transaksi_kas_kecil;
create policy transaksi_kas_kecil_all on public.transaksi_kas_kecil
  for all to authenticated
  using (is_admin_or_kepala(auth.uid()) or has_role(auth.uid(), 'keuangan'))
  with check (is_admin_or_kepala(auth.uid()) or has_role(auth.uid(), 'keuangan'));

drop policy if exists replenishment_kas_kecil_read on public.replenishment_kas_kecil;
drop policy if exists replenishment_kas_kecil_write on public.replenishment_kas_kecil;
create policy replenishment_kas_kecil_all on public.replenishment_kas_kecil
  for all to authenticated
  using (is_admin_or_kepala(auth.uid()) or has_role(auth.uid(), 'keuangan'))
  with check (is_admin_or_kepala(auth.uid()) or has_role(auth.uid(), 'keuangan'));

-- 3. Midtrans: hapus policy UPDATE terbuka; webhook midtrans-notification sudah pakai service role (bypass RLS)
drop policy if exists "Service update transaksi" on public.transaksi_midtrans;
