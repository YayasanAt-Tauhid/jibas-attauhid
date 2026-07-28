/**
 * Helper jatuh tempo tagihan (sisi klien).
 *
 * Cerminan dari fungsi SQL `hitung_jatuh_tempo_tagihan` (lihat migrasi
 * 20260728100000_tagihan_jatuh_tempo.sql). Nilai jatuh tempo yang otoritatif
 * tetap kolom `tagihan.jatuh_tempo` di database — modul ini dipakai untuk
 * menghitung/menampilkan di UI (mis. pratinjau saat memilih bulan) dan untuk
 * mengklasifikasikan tagihan jadi menunggak / belum jatuh tempo tanpa perlu
 * bolak-balik ke server.
 *
 * Kalau rumus di sini diubah, ubah juga fungsi SQL-nya — keduanya harus
 * menghasilkan tanggal yang sama.
 */

/** Hari jatuh tempo default kalau jenis pembayaran tidak menentukan sendiri. */
export const HARI_JATUH_TEMPO_DEFAULT = 10;

const MS_PER_HARI = 24 * 60 * 60 * 1000;

/** Format Date jadi "yyyy-MM-dd" memakai komponen tanggal UTC. */
function keTanggalISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Tahun kalender sebuah `bulan` (1-12) di dalam sebuah periode.
 *
 * Diturunkan dari bulan awal periode, sehingga rumusnya benar untuk kedua
 * konvensi periode yang hidup berdampingan di sistem ini:
 *
 *   - tahun buku Januari-Desember (mulai bulan 1)
 *     -> semua bulan 1..12 jatuh di tahun yang sama dengan tanggal mulai
 *   - tahun ajaran Juli-Juni (mulai bulan 7)
 *     -> bulan 7..12 di tahun tanggal mulai, bulan 1..6 di tahun berikutnya
 *
 * @param periodeMulai tanggal mulai periode, "yyyy-MM-dd"
 * @param bulan bulan kalender 1-12
 */
export function tahunKalenderBulan(
  periodeMulai: string,
  bulan: number
): number | null {
  const mulai = new Date(`${periodeMulai}T00:00:00Z`);
  if (Number.isNaN(mulai.getTime())) return null;
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return null;

  const tahunMulai = mulai.getUTCFullYear();
  const bulanMulai = mulai.getUTCMonth() + 1;
  return bulan >= bulanMulai ? tahunMulai : tahunMulai + 1;
}

/**
 * Tanggal jatuh tempo sebuah tagihan, "yyyy-MM-dd".
 *
 * @param periodeMulai tanggal mulai periode (tahun buku / tahun ajaran)
 * @param bulan bulan kalender 1-12, atau null untuk tagihan sekali bayar
 * @param hari tanggal jatuh tempo dalam bulan (1-31); default 10.
 *   Nilai yang melewati akhir bulan dipotong ke hari terakhir bulan tsb
 *   (mis. tanggal 31 di Februari jadi 28/29).
 */
export function hitungJatuhTempo(
  periodeMulai: string | null | undefined,
  bulan: number | null | undefined,
  hari: number | null | undefined = HARI_JATUH_TEMPO_DEFAULT
): string | null {
  if (!periodeMulai) return null;
  const mulai = new Date(`${periodeMulai}T00:00:00Z`);
  if (Number.isNaN(mulai.getTime())) return null;

  // Tagihan sekali bayar (mis. uang pangkal): jatuh tempo di awal periode.
  if (bulan == null || !Number.isInteger(bulan) || bulan < 1 || bulan > 12) {
    return keTanggalISO(mulai);
  }

  const tahun = tahunKalenderBulan(periodeMulai, bulan);
  if (tahun === null) return null;

  const hariDipakai = hari ?? HARI_JATUH_TEMPO_DEFAULT;
  // Hari 0 bulan berikutnya = hari terakhir bulan ini.
  const akhirBulan = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  const hariFinal = Math.min(Math.max(hariDipakai, 1), akhirBulan);

  return keTanggalISO(new Date(Date.UTC(tahun, bulan - 1, hariFinal)));
}

/** Selisih hari kalender antara dua tanggal "yyyy-MM-dd" (b dikurangi a). */
export function selisihHari(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / MS_PER_HARI);
}

/**
 * Apakah tagihan sudah menunggak per tanggal acuan.
 *
 * Tagihan tanpa jatuh tempo (data lama yang periodenya tidak punya tanggal
 * mulai) dianggap sudah tertagih — konsisten dengan generate_tagihan_batch
 * yang juga langsung mengakui piutangnya untuk kasus tersebut.
 */
export function sudahMenunggak(
  jatuhTempo: string | null | undefined,
  perTanggal: string
): boolean {
  if (!jatuhTempo) return true;
  return jatuhTempo < perTanggal;
}

/** Berapa hari sebuah tagihan terlambat per tanggal acuan; 0 kalau belum lewat. */
export function hariTerlambat(
  jatuhTempo: string | null | undefined,
  perTanggal: string
): number {
  if (!jatuhTempo) return 0;
  return Math.max(selisihHari(jatuhTempo, perTanggal), 0);
}
