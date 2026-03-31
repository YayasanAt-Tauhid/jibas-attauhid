import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SaldoAkun {
  akun_id: string;
  kode: string;
  nama: string;
  pos_isak35: string;
  saldo_normal: string;
  urutan_isak35: number;
  saldo: number;
}

async function hitungSaldoAkun(tahun: number, departemenId?: string): Promise<SaldoAkun[]> {
  const { data: akunList, error: akunErr } = await supabase
    .from("akun_rekening")
    .select("id, kode, nama, pos_isak35, saldo_normal, urutan_isak35, saldo_awal")
    .not("pos_isak35", "is", null)
    .eq("aktif", true)
    .order("urutan_isak35");
  if (akunErr) throw akunErr;

  let q = supabase
    .from("jurnal_detail")
    .select("akun_id, debit, kredit, jurnal!inner(tanggal, status, departemen_id)")
    .eq("jurnal.status", "posted")
    .gte("jurnal.tanggal", `${tahun}-01-01`)
    .lte("jurnal.tanggal", `${tahun}-12-31`);
  if (departemenId) q = (q as any).eq("jurnal.departemen_id", departemenId);
  const { data: details, error: detErr } = await q;
  if (detErr) throw detErr;

  const mutasi: Record<string, { debit: number; kredit: number }> = {};
  for (const d of (details as any[]) || []) {
    if (!mutasi[d.akun_id]) mutasi[d.akun_id] = { debit: 0, kredit: 0 };
    mutasi[d.akun_id].debit += Number(d.debit || 0);
    mutasi[d.akun_id].kredit += Number(d.kredit || 0);
  }

  const saldoAwalQuery = supabase
    .from("saldo_awal_isak35" as any)
    .select("akun_id, saldo")
    .eq("tahun", tahun);
  if (departemenId) saldoAwalQuery.eq("departemen_id", departemenId);
  const { data: saldoAwalData } = await saldoAwalQuery;
  const saldoAwalMap: Record<string, number> = {};
  for (const s of (saldoAwalData as any[]) || []) saldoAwalMap[s.akun_id] = Number(s.saldo || 0);

  return (akunList || []).map((akun: any) => {
    const m = mutasi[akun.id] || { debit: 0, kredit: 0 };
    const saldoAwal = saldoAwalMap[akun.id] ?? Number(akun.saldo_awal || 0);
    const saldo = akun.saldo_normal === "D"
      ? saldoAwal + m.debit - m.kredit
      : saldoAwal + m.kredit - m.debit;
    return { akun_id: akun.id, kode: akun.kode, nama: akun.nama, pos_isak35: akun.pos_isak35, saldo_normal: akun.saldo_normal, urutan_isak35: akun.urutan_isak35, saldo };
  });
}

function depresiasiSatuAset(harga: number, umurBulan: number, tglPerolehan: string, tahun: number) {
  const bpb = harga / umurBulan;
  const tgl = new Date(tglPerolehan);
  const mulai = tgl.getFullYear() * 12 + tgl.getMonth();
  let bebanTahunIni = 0, akumulasi = 0;
  for (let i = 0; i < umurBulan; i++) {
    const bulanKe = mulai + i;
    const thn = Math.floor(bulanKe / 12);
    if (thn <= tahun) akumulasi += bpb;
    if (thn === tahun) bebanTahunIni += bpb;
  }
  return { bebanTahunIni, akumulasi, nilaiBuku: harga - akumulasi };
}

async function totalDepresiasi(tahun: number, departemenId?: string) {
  let q = supabase.from("aset_tetap" as any).select("*").eq("aktif", true);
  if (departemenId) q = q.eq("departemen_id", departemenId);
  const { data, error } = await q;
  if (error) throw error;
  let totalHP = 0, totalBeban = 0, totalAkum = 0, totalNB = 0;
  for (const a of (data as any[]) || []) {
    totalHP += Number(a.harga_perolehan);
    const r = depresiasiSatuAset(Number(a.harga_perolehan), a.umur_ekonomis_bulan, a.tanggal_perolehan, tahun);
    totalBeban += r.bebanTahunIni; totalAkum += r.akumulasi; totalNB += r.nilaiBuku;
  }
  return { totalHP, totalBeban, totalAkum, totalNB };
}

// Helper: filter accounts by pos_isak35 and only include those with non-zero saldo
function byPos(saldo: SaldoAkun[], ...positions: string[]) {
  return saldo.filter(a => positions.includes(a.pos_isak35));
}

function sumSaldo(items: SaldoAkun[]) {
  return items.reduce((s, a) => s + a.saldo, 0);
}

export function useLaporanKomprehensif(tahun: number, departemenId?: string) {
  return useQuery({
    queryKey: ["isak35_komprehensif", tahun, departemenId],
    queryFn: async () => {
      const [saldo, dep] = await Promise.all([hitungSaldoAkun(tahun, departemenId), totalDepresiasi(tahun, departemenId)]);

      // Pendapatan tanpa pembatasan
      const pendapatan = byPos(saldo, "pendapatan_tidak_terikat");
      const totalPendapatan = sumSaldo(pendapatan);

      // Beban (program + penunjang)
      const beban = byPos(saldo, "beban_program", "beban_penunjang");
      const totalBeban = sumSaldo(beban);

      const surplusDefisit = totalPendapatan - totalBeban;

      // Pendapatan dengan pembatasan (terikat temporer + permanen)
      const pendapatanTerbatas = byPos(saldo, "pendapatan_terikat_temporer", "pendapatan_terikat_permanen");
      const totalPT = sumSaldo(pendapatanTerbatas);

      // Beban terbatas (if any accounts mapped)
      const bebanTerbatas = byPos(saldo, "beban_terbatas");
      const totalBT = sumSaldo(bebanTerbatas);

      const surplusTerbatas = totalPT - totalBT;

      // Penghasilan Komprehensif Lain
      const pklItems = byPos(saldo, "pkl");
      const pkl = sumSaldo(pklItems);

      return {
        pendapatan, totalPendapatan,
        beban, totalBeban,
        surplusDefisit,
        pendapatanTerbatas, totalPT,
        bebanTerbatas, totalBT,
        surplusTerbatas,
        pkl,
        totalKomprehensif: surplusDefisit + surplusTerbatas + pkl,
        dep,
      };
    },
  });
}

export function useLaporanPosisiKeuangan(tahun: number, departemenId?: string) {
  return useQuery({
    queryKey: ["isak35_posisi", tahun, departemenId],
    queryFn: async () => {
      const [saldo, dep] = await Promise.all([hitungSaldoAkun(tahun, departemenId), totalDepresiasi(tahun, departemenId)]);

      // Aset Lancar - all accounts with pos_isak35 = 'aset_lancar'
      const asetLancarItems = byPos(saldo, "aset_lancar");
      const totalAL = sumSaldo(asetLancarItems);

      // Aset Tidak Lancar - all accounts with pos_isak35 = 'aset_tidak_lancar'
      const asetTidakLancarItems = byPos(saldo, "aset_tidak_lancar");
      const totalATL = sumSaldo(asetTidakLancarItems);

      const totalAset = totalAL + totalATL;

      // Liabilitas Jangka Pendek
      const liabJPItems = byPos(saldo, "kewajiban_jangka_pendek");
      const totalLJP = sumSaldo(liabJPItems);

      // Liabilitas Jangka Panjang
      const liabJGItems = byPos(saldo, "kewajiban_jangka_panjang");
      const totalLJG = sumSaldo(liabJGItems);

      const totalLiabilitas = totalLJP + totalLJG;

      // Aset Neto
      const asetNetoItems = byPos(saldo, "aset_neto_tidak_terikat", "aset_neto_terikat_temporer", "aset_neto_terikat_permanen");
      const totalAsetNetoSaldo = sumSaldo(asetNetoItems);

      // Calculated aset neto = total aset - total liabilitas
      const totalAsetNeto = totalAset - totalLiabilitas;

      const selisih = totalAset - totalLiabilitas - totalAsetNeto;

      return {
        asetLancarItems, totalAL,
        asetTidakLancarItems, totalATL,
        totalAset,
        liabJPItems, totalLJP,
        liabJGItems, totalLJG,
        totalLiabilitas,
        asetNetoItems, totalAsetNetoSaldo,
        totalAsetNeto,
        selisih,
      };
    },
  });
}

export function useLaporanArusKas(tahun: number, departemenId?: string) {
  return useQuery({
    queryKey: ["isak35_arus_kas", tahun, departemenId],
    queryFn: async () => {
      const saldo = await hitungSaldoAkun(tahun, departemenId);

      // Penerimaan operasi = all pendapatan accounts
      const pendapatanItems = byPos(saldo, "pendapatan_tidak_terikat", "pendapatan_terikat_temporer", "pendapatan_terikat_permanen");
      const penerimaanOperasi = sumSaldo(pendapatanItems);

      // Pengeluaran operasi = all beban accounts
      const bebanItems = byPos(saldo, "beban_program", "beban_penunjang", "beban_terbatas");
      const pengeluaranOperasi = sumSaldo(bebanItems);

      const arusOperasi = penerimaanOperasi - pengeluaranOperasi;

      // Investasi = aset tidak lancar movement (simplified)
      const asetTLItems = byPos(saldo, "aset_tidak_lancar");
      const arusInvestasi = -sumSaldo(asetTLItems);

      // Pendanaan = liabilitas movement
      const liabItems = byPos(saldo, "kewajiban_jangka_pendek", "kewajiban_jangka_panjang");
      const arusPendanaan = sumSaldo(liabItems);

      const kenaikanKas = arusOperasi + arusInvestasi + arusPendanaan;
      const kasAwal = 0;

      return {
        penerimaanOperasi, pengeluaranOperasi, arusOperasi,
        arusInvestasi, arusPendanaan,
        kenaikanKas, kasAwal, kasAkhir: kasAwal + kenaikanKas,
      };
    },
  });
}

export function useAsetTetapList(departemenId?: string) {
  return useQuery({
    queryKey: ["aset_tetap", departemenId],
    queryFn: async () => {
      let q = supabase.from("aset_tetap" as any).select("*").eq("aktif", true).order("tanggal_perolehan");
      if (departemenId) q = q.eq("departemen_id", departemenId);
      const { data, error } = await q;
      if (error) throw error;
      const tahun = new Date().getFullYear();
      return ((data as any[]) || []).map((a: any) => ({ ...a, ...depresiasiSatuAset(Number(a.harga_perolehan), a.umur_ekonomis_bulan, a.tanggal_perolehan, tahun) }));
    },
  });
}

export function useCreateAsetTetap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { jenis_aset: string; tanggal_perolehan: string; umur_ekonomis_bulan: number; harga_perolehan: number; keterangan?: string; departemen_id?: string }) => {
      const { error } = await supabase.from("aset_tetap" as any).insert(v as any);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aset_tetap"] }); toast.success("Aset berhasil ditambahkan"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteAsetTetap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("aset_tetap" as any).update({ aktif: false } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["aset_tetap"] }); toast.success("Aset dihapus"); },
    onError: (e: any) => toast.error(e.message),
  });
}
