/**
 * Server functions: pmbOptions, pmbDaftar
 * Migrasi dari supabase/functions/pmb-daftar (GET list + POST register).
 * PUBLIK — tidak butuh login (form pendaftaran siswa baru).
 */
import { createServerFn } from "@tanstack/react-start";
import { createAdminClient } from "./supabase";

export interface PmbOptionsResult {
  departemen: { id: string; nama: string; kode: string | null }[];
  angkatan: { id: string; nama: string; departemen_id: string | null }[];
}

// GET: daftar departemen + angkatan aktif.
export const pmbOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<PmbOptionsResult> => {
    const admin = createAdminClient();
    const [deptRes, angkatanRes] = await Promise.all([
      admin
        .from("departemen")
        .select("id, nama, kode")
        .eq("aktif", true)
        .eq("kategori", "unit_pendidikan")
        .eq("psb_dibuka", true)
        .order("nama"),
      admin
        .from("angkatan")
        .select("id, nama, departemen_id")
        .eq("aktif", true)
        .order("nama", { ascending: false }),
    ]);

    if (deptRes.error) throw new Error(deptRes.error.message);
    return {
      departemen: deptRes.data || [],
      angkatan: angkatanRes.data || [],
    };
  }
);

export interface PmbDaftarInput {
  nama: string;
  departemen_id: string;
  angkatan_id?: string;
  jenis_pendaftaran?: string;
  jenis_kelamin?: string;
  tempat_lahir?: string;
  tanggal_lahir?: string;
  alamat?: string;
  telepon?: string;
  nama_ayah?: string;
  nama_ibu?: string;
  pekerjaan_ayah?: string;
  pekerjaan_ibu?: string;
  telepon_ortu?: string;
  alamat_ortu?: string;
  asal_sekolah?: string;
  kelas_terakhir?: string;
  alasan_pindah?: string;
}

// POST: daftarkan calon siswa baru.
export const pmbDaftar = createServerFn({ method: "POST" })
  .inputValidator((d: PmbDaftarInput) => d)
  .handler(async ({ data }): Promise<{ success: true; siswa_id: string }> => {
    const admin = createAdminClient();

    const nama = (data.nama || "").trim();
    const departemen_id = (data.departemen_id || "").trim();
    const angkatan_id = (data.angkatan_id || "").trim() || null;
    const jenis_pendaftaran = [
      "baru",
      "pindahan",
      "alumni_internal",
    ].includes(data.jenis_pendaftaran || "")
      ? data.jenis_pendaftaran!
      : "baru";

    if (!nama || nama.length < 2 || nama.length > 200) {
      throw new Error("Nama lengkap wajib diisi (2-200 karakter)");
    }
    if (!departemen_id) throw new Error("Departemen/lembaga wajib dipilih");

    const { data: dept } = await admin
      .from("departemen")
      .select("id")
      .eq("id", departemen_id)
      .eq("aktif", true)
      .eq("kategori", "unit_pendidikan")
      .eq("psb_dibuka", true)
      .single();
    if (!dept) throw new Error("Departemen tidak valid atau PMB belum dibuka untuk lembaga ini");

    const jk = data.jenis_kelamin === "P" ? "P" : "L";

    const { data: siswa, error: siswaError } = await admin
      .from("siswa")
      .insert({
        nama,
        jenis_kelamin: jk,
        tempat_lahir: (data.tempat_lahir || "").trim().slice(0, 100) || null,
        tanggal_lahir: data.tanggal_lahir || null,
        alamat: (data.alamat || "").trim().slice(0, 500) || null,
        telepon: (data.telepon || "").trim().slice(0, 20) || null,
        agama: "Islam",
        status: "calon",
        departemen_id,
        angkatan_id,
      })
      .select("id")
      .single();
    if (siswaError) throw new Error(siswaError.message);

    const { error: detailError } = await admin.from("siswa_detail").insert({
      siswa_id: siswa.id,
      nama_ayah: (data.nama_ayah || "").trim().slice(0, 200) || null,
      nama_ibu: (data.nama_ibu || "").trim().slice(0, 200) || null,
      pekerjaan_ayah: (data.pekerjaan_ayah || "").trim().slice(0, 100) || null,
      pekerjaan_ibu: (data.pekerjaan_ibu || "").trim().slice(0, 100) || null,
      telepon_ortu: (data.telepon_ortu || "").trim().slice(0, 20) || null,
      alamat_ortu: (data.alamat_ortu || "").trim().slice(0, 500) || null,
      jenis_pendaftaran,
      asal_sekolah:
        jenis_pendaftaran !== "baru"
          ? (data.asal_sekolah || "").trim().slice(0, 200) || null
          : null,
      kelas_terakhir:
        jenis_pendaftaran !== "baru"
          ? (data.kelas_terakhir || "").trim().slice(0, 50) || null
          : null,
      alasan_pindah:
        jenis_pendaftaran === "pindahan"
          ? (data.alasan_pindah || "").trim().slice(0, 500) || null
          : null,
    });

    if (detailError) {
      await admin.from("siswa").delete().eq("id", siswa.id);
      throw new Error(detailError.message);
    }

    return { success: true, siswa_id: siswa.id };
  });
