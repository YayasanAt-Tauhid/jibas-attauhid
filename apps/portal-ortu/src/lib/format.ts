// Util domain yang disalin dari aplikasi web agar perilakunya identik:
// - BULAN_ORDER_AKADEMIK: src/hooks/useKeuangan.ts
// - NAMA_BULAN & labelBulanTA: src/pages/portal/PortalTagihan.tsx
// Runtime code tidak bisa di-share lintas bundler (Vite vs Metro) tanpa
// memaketkan ulang jadi package — jika logika ini berubah di web, ubah
// juga di sini.

export const BULAN_ORDER_AKADEMIK = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

export const NAMA_BULAN = [
  "",
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// Label "Bulan Tahun" yang akurat untuk siklus tahun ajaran Juli-Juni
// (mis. "Juli 2026", "Januari 2027" untuk Tahun Ajaran 2026/2027) —
// bulan Juli-Des = tahun mulai tahun ajaran, bulan Jan-Jun = tahun mulai + 1.
export function labelBulanTA(bulan: number, tahunAjaranMulai: string): string {
  const nama = NAMA_BULAN[bulan];
  if (!nama) return "";
  const tahunMulai = new Date(tahunAjaranMulai).getFullYear();
  if (!tahunAjaranMulai || Number.isNaN(tahunMulai)) return nama;
  const tahunKalender = bulan >= 7 ? tahunMulai : tahunMulai + 1;
  return `${nama} ${tahunKalender}`;
}

export const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
