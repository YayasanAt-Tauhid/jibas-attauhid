/**
 * Server function: rekapTunggakan
 * Migrasi dari supabase/functions/rekap-tunggakan.
 * Rekap sisa tunggakan siswa. Boleh staff, atau siswa/ortu terkait.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth";
import { createAdminClient } from "./supabase";

export interface RekapTunggakanInput {
  siswa_id: string;
  tahun_ajaran_id?: string;
}

export interface TunggakanRow {
  jenis: string;
  bulan: number;
  nominal: number;
  terbayar: number;
  sisa: number;
  tipe: string;
}

export interface RekapTunggakanResult {
  tunggakan: TunggakanRow[];
  total: number;
}

export const rekapTunggakan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((d: RekapTunggakanInput) => d)
  .handler(async ({ data, context }): Promise<RekapTunggakanResult> => {
    const admin = createAdminClient();
    const userId = context.userId;
    const { siswa_id, tahun_ajaran_id } = data;

    const { data: profile } = await admin
      .from("users_profile")
      .select("role")
      .eq("id", userId)
      .single();

    const staffRoles = ["admin", "kepala_sekolah", "keuangan", "kasir"];
    const isStaff = profile && staffRoles.includes(profile.role);

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

    const { data: jenisList } = await admin
      .from("jenis_pembayaran")
      .select("id, nama, nominal, tipe")
      .eq("aktif", true);

    if (!jenisList) return { tunggakan: [], total: 0 };

    let query = admin
      .from("pembayaran")
      .select("jenis_id, bulan, jumlah")
      .eq("siswa_id", siswa_id);
    if (tahun_ajaran_id) query = query.eq("tahun_ajaran_id", tahun_ajaran_id);

    const { data: payments } = await query;

    const tunggakan: TunggakanRow[] = [];
    let total = 0;

    for (const jenis of jenisList) {
      const nominal = Number(jenis.nominal) || 0;
      const tipe = jenis.tipe || "bulanan";

      if (tipe === "sekali") {
        const paid = (payments || [])
          .filter((p) => p.jenis_id === jenis.id)
          .reduce((sum, p) => sum + (Number(p.jumlah) || 0), 0);
        const sisa = nominal - paid;
        if (sisa > 0) {
          tunggakan.push({
            jenis: jenis.nama,
            bulan: 0,
            nominal,
            terbayar: paid,
            sisa,
            tipe: "sekali",
          });
          total += sisa;
        }
      } else {
        for (let bulan = 1; bulan <= 12; bulan++) {
          const paid = (payments || [])
            .filter((p) => p.jenis_id === jenis.id && p.bulan === bulan)
            .reduce((sum, p) => sum + (Number(p.jumlah) || 0), 0);
          const sisa = nominal - paid;
          if (sisa > 0) {
            tunggakan.push({
              jenis: jenis.nama,
              bulan,
              nominal,
              terbayar: paid,
              sisa,
              tipe: "bulanan",
            });
            total += sisa;
          }
        }
      }
    }

    return { tunggakan, total };
  });
