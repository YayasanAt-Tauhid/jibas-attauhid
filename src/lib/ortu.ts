// Nama akun orang tua/wali tidak tersimpan di users_profile — akun ortu
// cuma punya email/role, sedangkan nama orang tua yang diisi saat PSB
// justru tersimpan di siswa_detail (nama_ayah/nama_ibu), terikat ke data
// anak, bukan ke akun login. Fungsi ini menurunkan nama tampilan terbaik
// yang tersedia dari anak-anak yang terhubung ke akun ortu tsb.
//
// Catatan: karena ortu_siswa.hubungan hampir selalu diisi generik "ortu"
// (bukan "ayah"/"ibu"), tidak ada cara pasti menentukan siapa persisnya
// yang login — nama_ayah diutamakan sekadar sebagai urutan tampilan,
// bukan karena akun ini pasti milik sang ayah.
export function getNamaOrtuDariAnak(
  anakList: { siswa?: { siswa_detail?: { nama_ayah?: string | null; nama_ibu?: string | null }[] | null } | null }[]
): string | null {
  for (const anak of anakList) {
    const detail = anak.siswa?.siswa_detail?.[0];
    if (detail?.nama_ayah) return detail.nama_ayah;
    if (detail?.nama_ibu) return detail.nama_ibu;
  }
  return null;
}
