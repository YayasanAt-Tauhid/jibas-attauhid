/**
 * Server function: generateTagihan
 * Migrasi dari supabase/functions/generate-tagihan.
 * Generate tagihan (piutang) + jurnal untuk sekelompok siswa. Hanya admin/kepala/keuangan.
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
    const tanggalHariIni = new Date().toISOString().split("T")[0];
    const tahunSekarang = new Date().getFullYear();

    for (const currentBulan of bulanArray) {
      let existingQuery = admin
        .from("tagihan")
        .select("siswa_id")
        .eq("jenis_id", jenis_id)
        .eq("tahun_ajaran_id", tahun_ajaran_id);

      existingQuery =
        currentBulan != null
          ? existingQuery.eq("bulan", currentBulan)
          : existingQuery.is("bulan", null);

      const { data: existingTagihan } = await existingQuery;
      const existingSet = new Set(
        (existingTagihan || []).map((t) => t.siswa_id)
      );

      const toGenerate = kelasSiswaList.filter(
        (ks) => !existingSet.has(ks.siswa_id)
      );
      skipped += kelasSiswaList.length - toGenerate.length;
      if (toGenerate.length === 0) continue;

      for (const ks of toGenerate) {
        try {
          const { data: nominal } = await admin.rpc("get_tarif_siswa", {
            p_jenis_id: jenis_id,
            p_siswa_id: ks.siswa_id,
            p_kelas_id: ks.kelas_id,
            p_tahun_ajaran_id: tahun_ajaran_id,
          });

          const tarifNominal = Number(nominal) || Number(jenis.nominal) || 0;
          if (tarifNominal <= 0) continue;

          const bulanLabel = currentBulan ? `-B${currentBulan}` : "";
          const { data: nomorJurnal } = await admin.rpc(
            "generate_nomor_jurnal",
            { p_prefix: "JPI", p_tahun: tahunSekarang }
          );

          const { data: jurnal, error: jErr } = await admin
            .from("jurnal")
            .insert({
              nomor: nomorJurnal,
              tanggal: tanggalHariIni,
              keterangan: `Piutang ${jenis.nama}${bulanLabel} - siswa ${ks.siswa_id}`,
              departemen_id: departemen_id || null,
              total_debit: tarifNominal,
              total_kredit: tarifNominal,
              status: "posted",
            })
            .select("id")
            .single();

          if (jErr || !jurnal) {
            errors.push(
              `Jurnal gagal untuk siswa ${ks.siswa_id} bulan ${currentBulan}`
            );
            continue;
          }

          await admin.from("jurnal_detail").insert([
            {
              jurnal_id: jurnal.id,
              akun_id: piutangAkunId,
              keterangan: `Piutang ${jenis.nama}`,
              debit: tarifNominal,
              kredit: 0,
              urutan: 1,
            },
            {
              jurnal_id: jurnal.id,
              akun_id: jenis.akun_pendapatan_id,
              keterangan: `Pendapatan ${jenis.nama}`,
              debit: 0,
              kredit: tarifNominal,
              urutan: 2,
            },
          ]);

          const { error: tagErr } = await admin.from("tagihan").insert({
            siswa_id: ks.siswa_id,
            jenis_id: jenis_id,
            tahun_ajaran_id: tahun_ajaran_id,
            kelas_id: ks.kelas_id,
            bulan: currentBulan || null,
            nominal: tarifNominal,
            status: "belum_bayar",
            jurnal_piutang_id: jurnal.id,
            created_by: context.userId,
          });

          if (tagErr) {
            if (tagErr.code === "23505") {
              skipped++;
              continue;
            }
            errors.push(
              `Tagihan gagal untuk siswa ${ks.siswa_id}: ${tagErr.message}`
            );
            continue;
          }

          generated++;
        } catch (err) {
          errors.push(
            `Error siswa ${ks.siswa_id}: ${err instanceof Error ? err.message : "gagal"}`
          );
        }
      }
    }

    return {
      success: true,
      generated,
      skipped,
      total_siswa: kelasSiswaList.length,
      bulan_count: bulanArray.filter((b) => b !== null).length || 1,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    };
  });
