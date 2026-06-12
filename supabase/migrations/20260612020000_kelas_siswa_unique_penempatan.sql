-- Cegah duplikasi penempatan siswa (double-click di Mutasi Siswa dkk).
-- Baris ber-tahun_ajaran NULL (pendaftaran PSB) tidak terpengaruh: NULL distinct di unique index.
-- Dedupe dulu: pertahankan baris aktif (atau id terbesar) per kombinasi.
delete from public.kelas_siswa a
using public.kelas_siswa b
where a.id <> b.id
  and a.siswa_id = b.siswa_id
  and a.kelas_id = b.kelas_id
  and a.tahun_ajaran_id = b.tahun_ajaran_id
  and (coalesce(a.aktif, false)::int, a.id::text) < (coalesce(b.aktif, false)::int, b.id::text);

create unique index if not exists uq_kelas_siswa_penempatan
  on public.kelas_siswa (siswa_id, kelas_id, tahun_ajaran_id);
