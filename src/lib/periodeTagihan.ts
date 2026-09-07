export interface PeriodeTanggal {
  id: string;
  nama?: string | null;
  tanggal_mulai: string;
  tanggal_selesai: string;
}

export interface BulanKalenderAkademik {
  bulan: number;
  tahun: number;
  tanggal: string;
}

export interface KelompokTahunBuku {
  tahunBukuId: string;
  tahunBukuNama: string;
  bulanList: number[];
}

export const BULAN_ORDER_AKADEMIK = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

function parseYearMonth(value: string): { tahun: number; bulan: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(value || "");
  if (!match) return null;
  const tahun = Number(match[1]);
  const bulan = Number(match[2]);
  if (!tahun || bulan < 1 || bulan > 12) return null;
  return { tahun, bulan };
}

function isoAwalBulan(tahun: number, bulan: number) {
  return `${tahun}-${String(bulan).padStart(2, "0")}-01`;
}

/**
 * Menghasilkan urutan bulan kalender yang benar untuk satu tahun ajaran.
 * Contoh 2026-07-01 s.d. 2027-06-30 -> Jul 2026 ... Jun 2027.
 */
export function bulanKalenderTahunAjaran(tahunAjaran?: PeriodeTanggal | null): BulanKalenderAkademik[] {
  if (!tahunAjaran) return [];
  const start = parseYearMonth(tahunAjaran.tanggal_mulai);
  const end = parseYearMonth(tahunAjaran.tanggal_selesai);
  if (!start || !end) return [];

  const result: BulanKalenderAkademik[] = [];
  let tahun = start.tahun;
  let bulan = start.bulan;

  // Pengaman: periode akademik normal 12 bulan, tetapi izinkan sampai 24 bulan
  // supaya data konfigurasi yang sedikit berbeda tidak menyebabkan loop tak berujung.
  for (let i = 0; i < 24; i++) {
    result.push({ bulan, tahun, tanggal: isoAwalBulan(tahun, bulan) });
    if (tahun === end.tahun && bulan === end.bulan) break;
    bulan += 1;
    if (bulan > 12) {
      bulan = 1;
      tahun += 1;
    }
  }
  return result;
}

export function cariTahunBukuUntukTanggal(
  tahunBukuList: PeriodeTanggal[] | undefined,
  tanggal: string,
): PeriodeTanggal | null {
  return (tahunBukuList || []).find(
    (tb) => tb.tanggal_mulai <= tanggal && tb.tanggal_selesai >= tanggal,
  ) || null;
}

/**
 * Memetakan bulan-bulan dalam tahun ajaran ke periode Tahun Buku (keuangan).
 * Tagihan tetap disimpan dengan FK tahun_buku, sedangkan pemilihan di UI dapat
 * mengikuti Tahun Ajaran Juli-Juni.
 */
export function kelompokkanBulanKeTahunBuku(params: {
  tahunAjaran?: PeriodeTanggal | null;
  tahunBukuList?: PeriodeTanggal[];
  bulanList: number[];
}): {
  groups: KelompokTahunBuku[];
  missing: BulanKalenderAkademik[];
} {
  const kalender = bulanKalenderTahunAjaran(params.tahunAjaran);
  const selected = new Set(params.bulanList);
  const groupMap = new Map<string, KelompokTahunBuku>();
  const missing: BulanKalenderAkademik[] = [];

  for (const item of kalender) {
    if (!selected.has(item.bulan)) continue;
    const tb = cariTahunBukuUntukTanggal(params.tahunBukuList, item.tanggal);
    if (!tb) {
      missing.push(item);
      continue;
    }
    const existing = groupMap.get(tb.id);
    if (existing) {
      existing.bulanList.push(item.bulan);
    } else {
      groupMap.set(tb.id, {
        tahunBukuId: tb.id,
        tahunBukuNama: tb.nama || "Tahun Buku",
        bulanList: [item.bulan],
      });
    }
  }

  return { groups: Array.from(groupMap.values()), missing };
}

/**
 * Tahun Buku yang perlu memiliki baris tarif agar satu tarif Tahun Ajaran
 * berlaku utuh. Untuk pembayaran bulanan: semua periode keuangan yang
 * beririsan dengan tahun ajaran. Untuk tipe sekali: periode yang memuat awal
 * tahun ajaran.
 */
export function targetTahunBukuTarif(params: {
  tahunAjaran?: PeriodeTanggal | null;
  tahunBukuList?: PeriodeTanggal[];
  tipeSekali?: boolean;
}): {
  ids: string[];
  missing: BulanKalenderAkademik[];
} {
  const kalender = bulanKalenderTahunAjaran(params.tahunAjaran);
  if (kalender.length === 0) return { ids: [], missing: [] };

  const targetKalender = params.tipeSekali ? [kalender[0]] : kalender;
  const ids = new Set<string>();
  const missing: BulanKalenderAkademik[] = [];

  for (const item of targetKalender) {
    const tb = cariTahunBukuUntukTanggal(params.tahunBukuList, item.tanggal);
    if (!tb) missing.push(item);
    else ids.add(tb.id);
  }

  return { ids: Array.from(ids), missing };
}

export function labelBulanKalender(item: BulanKalenderAkademik) {
  const nama = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ][item.bulan - 1];
  return `${nama} ${item.tahun}`;
}
