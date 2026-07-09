/**
 * Server function: hitungNilaiAkhir
 * Migrasi dari supabase/functions/hitung-nilai-akhir.
 * Hitung nilai akhir berbobot per mapel. Boleh staff, atau siswa/ortu terkait.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth";
import { createAdminClient } from "./supabase";

export interface HitungNilaiAkhirInput {
  siswa_id: string;
  mapel_id: string;
  kelas_id: string;
  tahun_ajaran_id: string;
  semester_id: string;
}

function getPredikat(nilai: number): string {
  if (nilai >= 90) return "A";
  if (nilai >= 80) return "B";
  if (nilai >= 70) return "C";
  if (nilai >= 60) return "D";
  return "E";
}

export const hitungNilaiAkhir = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((d: HitungNilaiAkhirInput) => d)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ nilai_akhir: number; predikat: string }> => {
      const admin = createAdminClient();
      const userId = context.userId;

      const { siswa_id, mapel_id, kelas_id, tahun_ajaran_id, semester_id } =
        data;

      const { data: profile } = await admin
        .from("users_profile")
        .select("role")
        .eq("id", userId)
        .single();

      const allowedRoles = ["admin", "kepala_sekolah", "guru", "keuangan"];
      const isStaff = profile && allowedRoles.includes(profile.role);

      if (!isStaff) {
        const { data: isOwn } = await admin.rpc("is_own_siswa", {
          _user_id: userId,
          _siswa_id: siswa_id,
        });
        const { data: isParent } = await admin.rpc("is_ortu_of", {
          p_user_id: userId,
          p_siswa_id: siswa_id,
        });
        if (!isOwn && !isParent) throw new Error("Forbidden: akses ditolak");
      }

      const { data: grades } = await admin
        .from("penilaian")
        .select("jenis_ujian, nilai")
        .eq("siswa_id", siswa_id)
        .eq("mapel_id", mapel_id)
        .eq("kelas_id", kelas_id)
        .eq("tahun_ajaran_id", tahun_ajaran_id)
        .eq("semester_id", semester_id);

      if (!grades || grades.length === 0) {
        throw new Error("Tidak ada data penilaian");
      }

      const weights: Record<string, number> = {
        tugas: 0.2,
        ulangan_harian: 0.2,
        uts: 0.25,
        uas: 0.35,
      };

      const grouped: Record<string, number[]> = {};
      for (const g of grades) {
        const key = g.jenis_ujian || "tugas";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(Number(g.nilai) || 0);
      }

      let nilaiAkhir = 0;
      let totalWeight = 0;
      for (const [jenis, values] of Object.entries(grouped)) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const w = weights[jenis] || 0.25;
        nilaiAkhir += avg * w;
        totalWeight += w;
      }

      if (totalWeight > 0) nilaiAkhir = (nilaiAkhir / totalWeight) * 1;
      const rounded = Math.round(nilaiAkhir * 100) / 100;

      return { nilai_akhir: rounded, predikat: getPredikat(rounded) };
    }
  );
