/**
 * Server function: generateTagihan
 * Migrasi dari supabase/functions/generate-tagihan.
 * Generate tagihan (piutang) + jurnal untuk sekelompok siswa. Hanya admin/kepala/keuangan.
 *
 * CATATAN PERBAIKAN (2026-07-14): Sebelumnya proses ini melakukan ~5 subrequest
 * Supabase PER SISWA PER BULAN (RPC tarif, RPC nomor jurnal, insert jurnal,
 * insert jurnal_detail, insert tagihan) secara sequential di dalam loop
 * JavaScript. Untuk generate 12 bulan x banyak siswa, ini gampang menembus
 * limit subrequest per invocation di Cloudflare Workers — begitu limit
 * tercapai, Worker berhenti paksa di tengah loop dan sisa bulan/siswa yang
 * belum diproses hilang tanpa pemberitahuan jelas ("tagihan bolong").
 *
 * Sekarang logic generate per-siswa dipindah ke stored procedure Postgres
 * `generate_tagihan_batch`, dipanggil SEKALI PER BULAN (bukan per siswa).
 * Ini menurunkan jumlah subrequest dari (siswa x bulan x 5) menjadi
 * (bulan x 1), sehingga generate massal jauh lebih tahan terhadap limit
 * subrequest dan juga jauh lebih cepat.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, requireRole } from "./auth";
import { createAdminClient } from "./supabase";

export interface GenerateTagihanInput {
  tahun_ajaran_id: string;
  jenis_id: string;
  bulan?: number | null;
  bulan_list?: number[];
  departemen_id?: string;
  siswa_id?: string;
  kelas_id?: string;
}

export interface GenerateTagihanResult {
  success: true;
  generated: number;
  skipped: number;
  total_siswa?: number;
  bulan_count?: number;
  message?: string;
  errors?: string[];
}

export const generateTagihan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((d: GenerateTagihanInput) => d)
  .handler(async ({ data, context }): Promise<GenerateTagihanResult> => {
    const admin = createAdminClient();
    await requireRole(admin, context.userId, [
      "admin",
      "kepala_sekolah",
      "keuangan",
    ]);

    const {
      tahun_ajaran_id,
      jenis_id,
      bulan,
      bulan_list,
      departemen_id,
      siswa_id,
      kelas_id,
    } = data;

    const bulanArray: (number | null)[] =
      bulan_list && Array.isArray(bulan_list) && bulan_list.length > 0
        ? bulan_list
        : bulan != null
          ? [bulan]
          : [null];

    if (!tahun_ajaran_id || !jenis_id) {
      throw new Error("tahun_ajaran_id dan jenis_id wajib diisi");
    }

    const { data: jenis, error: jenisErr } = await admin
      .from("jenis_pembayaran")
      .select("id, nama, nominal, tipe, akun_pendapatan_id")
      .eq("id", jenis_id)
      .single();
    if (jenisErr || !jenis) throw new Error("Jenis pembayaran tidak ditemukan");

    const { data: pengaturan } = await admin
      .from("pengaturan_akun")
      .select("kode_setting, akun_id")
      .in("kode_setting", ["piutang_siswa"]);
    const piutangAkunId = pengaturan?.find(
      (p) => p.kode_setting === "piutang_siswa"
    )?.akun_id;

    if (!piutangAkunId) {
      throw new Error(
        "Akun piutang siswa belum dikonfigurasi di Pengaturan Akun"
      );
    }
    if (!jenis.akun_pendapatan_id) {
      throw new Error(`Akun pendapatan belum diset untuk jenis "${jenis.nama}"`);
    }

    // Ambil siswa berdasarkan filter: siswa_id > kelas_id > semua di tahun_ajaran
    let kelasSiswaList: { siswa_id: string; kelas_id: string }[] = [];

    if (siswa_id) {
      const { data: rows, error } = await admin
        .from("kelas_siswa")
        .select("siswa_id, kelas_id")
        .eq("siswa_id", siswa_id)
        .eq("tahun_ajaran_id", tahun_ajaran_id)
        .eq("aktif", true);
      if (error)
        throw new Error("Gagal mengambil data kelas siswa: " + error.message);
      kelasSiswaList = rows || [];
      if (kelasSiswaList.length === 0) {
        kelasSiswaList = [{ siswa_id, kelas_id: (kelas_id || null) as string }];
      }
    } else if (kelas_id) {
      const { data: rows, error } = await admin
        .from("kelas_siswa")
        .select("siswa_id, kelas_id")
        .eq("kelas_id", kelas_id)
        .eq("tahun_ajaran_id", tahun_ajaran_id)
        .eq("aktif", true);
      if (error)
        throw new Error("Gagal mengambil data kelas siswa: " + error.message);
      kelasSiswaList = rows || [];
    } else {
      const { data: rows, error } = await admin
        .from("kelas_siswa")
        .select("siswa_id, kelas_id")
        .eq("aktif", true)
        .eq("tahun_ajaran_id", tahun_ajaran_id);
      if (error)
        throw new Error("Gagal mengambil data kelas siswa: " + error.message);
      kelasSiswaList = rows || [];
    }

    if (kelasSiswaList.length === 0) {
      return {
        success: true,
        generated: 0,
        skipped: 0,
        message: "Tidak ada siswa yang cocok dengan kriteria",
      };
    }

    // Filter by departemen bila diminta & belum difilter kelas
    if (departemen_id && !siswa_id && !kelas_id) {
      const kelasIds = [
        ...new Set(kelasSiswaList.map((ks) => ks.kelas_id).filter(Boolean)),
      ];
      if (kelasIds.length > 0) {
        const { data: kelasData } = await admin
          .from("kelas")
          .select("id")
          .eq("departemen_id", departemen_id)
          .in("id", kelasIds);
        const validKelasIds = new Set((kelasData || []).map((k) => k.id));
        kelasSiswaList = kelasSiswaList.filter((ks) =>
          validKelasIds.has(ks.kelas_id)
        );
      }
    }

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Satu panggilan RPC PER BULAN, bukan per siswa. Stored procedure
    // `generate_tagihan_batch` melakukan seluruh proses (tarif + jurnal +
    // jurnal_detail + tagihan, untuk semua siswa dalam daftar) dalam satu
    // transaksi di sisi database. Kalau satu bulan gagal total (mis. RPC
    // error jaringan), bulan lain tetap lanjut diproses karena kita
    // membungkus tiap panggilan dengan try/catch sendiri-sendiri.
    for (const currentBulan of bulanArray) {
      try {
        const { data: result, error: rpcErr } = await admin.rpc(
          "generate_tagihan_batch",
          {
            p_jenis_id: jenis_id,
            p_tahun_ajaran_id: tahun_ajaran_id,
            p_bulan: currentBulan,
            p_departemen_id: departemen_id || null,
            p_siswa_list: kelasSiswaList.map((ks) => ({
              siswa_id: ks.siswa_id,
              kelas_id: ks.kelas_id || null,
            })),
            p_created_by: context.userId,
          }
        );

        if (rpcErr) {
          errors.push(
            `Bulan ${currentBulan ?? "-"}: gagal generate (${rpcErr.message})`
          );
          continue;
        }

        // RPC bertipe RETURNS TABLE — hasilnya array dengan 1 baris
        const row = Array.isArray(result) ? result[0] : result;
        generated += row?.generated ?? 0;
        skipped += row?.skipped ?? 0;
        if (row?.errors && Array.isArray(row.errors) && row.errors.length > 0) {
          errors.push(
            ...row.errors.map((e: string) => `Bulan ${currentBulan ?? "-"}: ${e}`)
          );
        }
      } catch (err) {
        // Kegagalan tak terduga (mis. network) untuk SATU bulan tidak boleh
        // menghentikan proses bulan-bulan lainnya.
        errors.push(
          `Bulan ${currentBulan ?? "-"}: ${err instanceof Error ? err.message : "gagal"}`
        );
      }
    }

    return {
      success: true,
      generated,
      skipped,
      total_siswa: kelasSiswaList.length,
      bulan_count: bulanArray.filter((b) => b !== null).length || 1,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    };
  });
