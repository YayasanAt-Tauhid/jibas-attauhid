// Keranjang tagihan yang dipilih di tab Tagihan, dibaca layar /checkout —
// padanan sessionStorage "keranjang_tagihan" di portal web. Cukup singleton
// module-level: hidup selama app berjalan, tidak perlu persist.

export interface KeranjangItem {
  siswa_id: string;
  nama_siswa: string;
  jenis_id: string;
  jenis_nama: string;
  bulan: number;
  jumlah: number;
  departemen_id?: string;
  departemen_nama?: string;
  tahun_ajaran_id?: string;
  tahun_ajaran_nama?: string;
  tahun_ajaran_mulai?: string;
  kelas_nama?: string;
}

let keranjang: KeranjangItem[] = [];

export function setKeranjang(items: KeranjangItem[]) {
  keranjang = items;
}

export function getKeranjang(): KeranjangItem[] {
  return keranjang;
}

export function clearKeranjang() {
  keranjang = [];
}
