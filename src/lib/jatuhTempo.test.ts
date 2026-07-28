import { describe, it, expect } from "vitest";
import {
  HARI_JATUH_TEMPO_DEFAULT,
  hariTerlambat,
  hitungJatuhTempo,
  selisihHari,
  sudahMenunggak,
  tahunKalenderBulan,
} from "./jatuhTempo";

// Dua konvensi periode yang hidup berdampingan di sistem ini.
const TAHUN_AJARAN_MULAI = "2026-07-01"; // Juli 2026 – Juni 2027
const TAHUN_BUKU_MULAI = "2026-01-01"; // Januari – Desember 2026

describe("tahunKalenderBulan", () => {
  it("menaruh bulan Juli-Desember di tahun mulai untuk tahun ajaran Juli-Juni", () => {
    expect(tahunKalenderBulan(TAHUN_AJARAN_MULAI, 7)).toBe(2026);
    expect(tahunKalenderBulan(TAHUN_AJARAN_MULAI, 12)).toBe(2026);
  });

  it("menaruh bulan Januari-Juni di tahun berikutnya untuk tahun ajaran Juli-Juni", () => {
    expect(tahunKalenderBulan(TAHUN_AJARAN_MULAI, 1)).toBe(2027);
    expect(tahunKalenderBulan(TAHUN_AJARAN_MULAI, 6)).toBe(2027);
  });

  it("menaruh SEMUA bulan di tahun yang sama untuk tahun buku Januari-Desember", () => {
    expect(tahunKalenderBulan(TAHUN_BUKU_MULAI, 1)).toBe(2026);
    expect(tahunKalenderBulan(TAHUN_BUKU_MULAI, 6)).toBe(2026);
    expect(tahunKalenderBulan(TAHUN_BUKU_MULAI, 12)).toBe(2026);
  });

  it("menolak bulan di luar 1-12 dan tanggal tidak valid", () => {
    expect(tahunKalenderBulan(TAHUN_AJARAN_MULAI, 0)).toBeNull();
    expect(tahunKalenderBulan(TAHUN_AJARAN_MULAI, 13)).toBeNull();
    expect(tahunKalenderBulan("bukan-tanggal", 7)).toBeNull();
  });
});

describe("hitungJatuhTempo", () => {
  it("memakai hari default 10 kalau jenis pembayaran tidak menentukan", () => {
    expect(hitungJatuhTempo(TAHUN_AJARAN_MULAI, 7)).toBe("2026-07-10");
    expect(HARI_JATUH_TEMPO_DEFAULT).toBe(10);
  });

  it("mengikuti hari jatuh tempo per jenis pembayaran", () => {
    expect(hitungJatuhTempo(TAHUN_AJARAN_MULAI, 7, 25)).toBe("2026-07-25");
    expect(hitungJatuhTempo(TAHUN_AJARAN_MULAI, 7, 1)).toBe("2026-07-01");
  });

  it("menyeberang tahun kalender untuk bulan Januari-Juni di tahun ajaran", () => {
    expect(hitungJatuhTempo(TAHUN_AJARAN_MULAI, 1)).toBe("2027-01-10");
    expect(hitungJatuhTempo(TAHUN_AJARAN_MULAI, 6)).toBe("2027-06-10");
  });

  it("tidak menyeberang tahun untuk tahun buku Januari-Desember", () => {
    expect(hitungJatuhTempo(TAHUN_BUKU_MULAI, 1)).toBe("2026-01-10");
    expect(hitungJatuhTempo(TAHUN_BUKU_MULAI, 12)).toBe("2026-12-10");
  });

  it("memotong hari yang melewati akhir bulan", () => {
    // Februari 2027 hanya sampai tanggal 28.
    expect(hitungJatuhTempo(TAHUN_AJARAN_MULAI, 2, 31)).toBe("2027-02-28");
    // Februari 2028 kabisat -> 29.
    expect(hitungJatuhTempo("2027-07-01", 2, 31)).toBe("2028-02-29");
    // April hanya 30 hari.
    expect(hitungJatuhTempo(TAHUN_AJARAN_MULAI, 4, 31)).toBe("2027-04-30");
  });

  it("memakai awal periode untuk tagihan sekali bayar (bulan null)", () => {
    expect(hitungJatuhTempo(TAHUN_AJARAN_MULAI, null)).toBe("2026-07-01");
    expect(hitungJatuhTempo(TAHUN_BUKU_MULAI, null)).toBe("2026-01-01");
  });

  it("mengembalikan null kalau periode tidak punya tanggal mulai", () => {
    expect(hitungJatuhTempo(null, 7)).toBeNull();
    expect(hitungJatuhTempo(undefined, 7)).toBeNull();
    expect(hitungJatuhTempo("bukan-tanggal", 7)).toBeNull();
  });

  it("menghasilkan 12 jatuh tempo kronologis untuk satu tahun ajaran penuh", () => {
    const urutanAkademik = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
    const tanggal = urutanAkademik.map(
      (b) => hitungJatuhTempo(TAHUN_AJARAN_MULAI, b)!
    );
    const terurut = [...tanggal].sort();
    expect(tanggal).toEqual(terurut);
    expect(tanggal[0]).toBe("2026-07-10");
    expect(tanggal[11]).toBe("2027-06-10");
  });
});

describe("sudahMenunggak", () => {
  const hariIni = "2026-07-28";

  it("belum menunggak kalau jatuh tempo masih di depan", () => {
    expect(sudahMenunggak("2026-08-10", hariIni)).toBe(false);
    // SPP 6 tahun ke depan untuk siswa kelas 1 SD: jelas belum menunggak.
    expect(sudahMenunggak("2032-06-10", hariIni)).toBe(false);
  });

  it("belum menunggak tepat pada hari jatuh tempo", () => {
    expect(sudahMenunggak(hariIni, hariIni)).toBe(false);
  });

  it("menunggak kalau jatuh tempo sudah lewat", () => {
    expect(sudahMenunggak("2026-07-27", hariIni)).toBe(true);
    expect(sudahMenunggak("2025-01-10", hariIni)).toBe(true);
  });

  it("menganggap tagihan tanpa jatuh tempo sudah tertagih", () => {
    expect(sudahMenunggak(null, hariIni)).toBe(true);
    expect(sudahMenunggak(undefined, hariIni)).toBe(true);
  });
});

describe("selisihHari & hariTerlambat", () => {
  it("menghitung selisih hari kalender", () => {
    expect(selisihHari("2026-07-10", "2026-07-28")).toBe(18);
    expect(selisihHari("2026-07-28", "2026-07-10")).toBe(-18);
    expect(selisihHari("2026-07-28", "2026-07-28")).toBe(0);
  });

  it("menghitung selisih lintas bulan dan tahun", () => {
    expect(selisihHari("2026-12-31", "2027-01-01")).toBe(1);
    expect(selisihHari("2028-02-28", "2028-03-01")).toBe(2); // 2028 kabisat
  });

  it("tidak pernah negatif untuk hari terlambat", () => {
    expect(hariTerlambat("2026-08-10", "2026-07-28")).toBe(0);
    expect(hariTerlambat("2026-07-10", "2026-07-28")).toBe(18);
    expect(hariTerlambat(null, "2026-07-28")).toBe(0);
  });
});
