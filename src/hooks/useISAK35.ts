import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Kode departemen yang termasuk Unit Pendidikan
export const UNIT_PENDIDIKAN_KODE = ["TK", "SD", "SMP", "SMA", "MTA", "PDK", "UM"];

export function useDepartemenGroups() {
  return useQuery({
    queryKey: ["departemen_groups"],
    queryFn: async () => {
      const { data } = await supabase
        .from("departemen")
        .select("id, kode, nama")
        .eq("aktif", true);
      const rows = (data as any[]) || [];
      const pendidikanDepts: { id: string; kode: string; nama: string }[] = rows
        .filter(d => UNIT_PENDIDIKAN_KODE.includes(d.kode))
        .sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
      const usahaDepts: { id: string; kode: string; nama: string }[] = rows
        .filter(d => !UNIT_PENDIDIKAN_KODE.includes(d.kode))
        .sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
      const pendidikanIds = pendidikanDepts.map(d => d.id);
      const usahaIds = usahaDepts.map(d => d.id);
      return { pendidikanIds, pendidikanDepts, usahaIds, usahaDepts };
    },
    staleTime: Infinity,
  });
}

interface SaldoAkun {
  akun_id: string;
  kode: string;
  nama: string;
  pos_isak35: string;
  saldo_normal: string;
  urutan_isak35: number;
  saldo: number;
}

async function hitungSaldoAkun(tahun: number, departemenIds?: string[]): Promise<SaldoAkun[]> {
  const { data: akunList, error: akunErr } = await supabase
    .from("akun_rekening")
    .select("id, kode, nama, pos_isak35, saldo_normal, urutan_isak35, saldo_awal")
    .not("pos_isak35", "is", null)
    .eq("aktif", true)
    .order("urutan_isak35");
  if (akunErr) throw akunErr;

  const rpcParams: { p_tahun: number; p_departemen_ids?: string[] } = { p_tahun: tahun };
  if (departemenIds && departemenIds.length > 0) rpcParams.p_departemen_ids = departemenIds;
  const { data: mutasiRows, error: mutasiErr } = await (supabase as any)
    .rpc("hitung_mutasi_akun", rpcParams);
  if (mutasiErr) throw mutasiErr;

  const mutasi: Record<string, { debit: number; kredit: number }> = {};
  for (const d of (mutasiRows as any[]) || []) {
    mutasi[d.akun_id] = {
      debit:  Number(d.total_debit  || 0),
      kredit: Number(d.total_kredit || 0),
    };
  }

  let saldoAwalQuery = supabase
    .from("saldo_awal_isak35" as any)
    .select("akun_id, saldo")
    .eq("tahun", tahun);
  if (departemenIds && departemenIds.length > 0) saldoAwalQuery = (saldoAwalQuery as any).in("departemen_id", departemenIds);
  const { data: saldoAwalData } = await saldoAwalQuery;
  const saldoAwalMap: Record<string, number> = {};
  for (const s of (saldoAwalData as any[]) || []) saldoAwalMap[s.akun_id] = Number(s.saldo || 0);

  // Jika saldo_awal_isak35 kosong untuk tahun ini, gunakan 0 — bukan
  // akun.saldo_awal. Nilai akun.saldo_awal = saldo akhir tahun sebelumnya
  // (diset sebagai pembuka tahun berikutnya), bukan saldo awal tahun ini.
  // Saldo awal tahun ini sudah dicatat lewat jurnal pembuka.
  return (akunList || []).map((akun: any) => {
    const m = mutasi[akun.id] || { debit: 0, kredit: 0 };
    const saldoAwal = saldoAwalMap[akun.id] ?? 0;
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

async function totalDepresiasi(tahun: number, departemenIds?: string[]) {
  let q = supabase.from("aset_tetap" as any).select("*").eq("aktif", true);
  if (departemenIds && departemenIds.length > 0) q = (q as any).in("departemen_id", departemenIds);
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

// ============================================================
// Akun yang di-EXCLUDE dari laporan ISAK 35
// - 1901: Rekening Antar Lembaga → rekening internal, bukan aset riil
// - 1902: Rekening Antar Bagian  → rekening internal, bukan aset riil
// ============================================================
const EXCLUDE_BEBAN_TRANSFER: string[] = [];
const EXCLUDE_ASET_INTERNAL  = ["1901", "1902"];

function byPos(saldo: SaldoAkun[], ...positions: string[]) {
  return saldo.filter(a => positions.includes(a.pos_isak35));
}

function sumSaldo(items: SaldoAkun[]) {
  return items.reduce((s, a) => s + a.saldo, 0);
}

function isAkunKas(kode: string, nama: string): boolean {
  const n = (nama || "").toUpperCase().trim();
  return n.startsWith("KAS ") || n === "KAS" || n.startsWith("BANK ") || n === "BANK";
}

interface AkunMeta { id: string; kode: string; nama: string; pos_isak35: string | null; jenis: string }

async function getAkunMeta(): Promise<Record<string, AkunMeta>> {
  const { data } = await supabase
    .from("akun_rekening")
    .select("id, kode, nama, pos_isak35, jenis")
    .eq("aktif", true);
  const map: Record<string, AkunMeta> = {};
  for (const a of (data as any[]) || []) map[a.id] = a;
  return map;
}

export function useLaporanKomprehensif(tahun: number, departemenIds?: string[]) {
  return useQuery({
    queryKey: ["isak35_komprehensif", tahun, departemenIds],
    queryFn: async () => {
      const saldo = await hitungSaldoAkun(tahun, departemenIds);

      const pendapatan = byPos(saldo, "pendapatan_tidak_terikat");
      const totalPendapatan = sumSaldo(pendapatan);

      const beban = byPos(saldo, "beban_program", "beban_penunjang")
        .filter(a => !EXCLUDE_BEBAN_TRANSFER.includes(a.kode));
      const totalBeban = sumSaldo(beban);

      const surplusDefisit = totalPendapatan - totalBeban;

      const pendapatanTerbatas = byPos(saldo, "pendapatan_terikat_temporer", "pendapatan_terikat_permanen");
      const totalPT = sumSaldo(pendapatanTerbatas);

      const bebanTerbatas = byPos(saldo, "beban_terbatas");
      const totalBT = sumSaldo(bebanTerbatas);

      const surplusTerbatas = totalPT - totalBT;

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
      };
    },
  });
}

export function useLaporanPosisiKeuangan(tahun: number, departemenIds?: string[]) {
  return useQuery({
    queryKey: ["isak35_posisi", tahun, departemenIds],
    queryFn: async () => {
      const saldo = await hitungSaldoAkun(tahun, departemenIds);

      const asetLancarItems = byPos(saldo, "aset_lancar");
      const totalAL = sumSaldo(asetLancarItems);

      const asetTidakLancarItems = byPos(saldo, "aset_tidak_lancar")
        .filter(a => !EXCLUDE_ASET_INTERNAL.includes(a.kode));
      const totalATL = sumSaldo(asetTidakLancarItems);

      const totalAset = totalAL + totalATL;

      const liabJPItems = byPos(saldo, "kewajiban_jangka_pendek");
      const totalLJP = sumSaldo(liabJPItems);

      const liabJGItems = byPos(saldo, "kewajiban_jangka_panjang");
      const totalLJG = sumSaldo(liabJGItems);

      const totalLiabilitas = totalLJP + totalLJG;

      const asetNetoItems = byPos(saldo, "aset_neto_tidak_terikat", "aset_neto_terikat_temporer", "aset_neto_terikat_permanen");
      const totalAsetNetoSaldo = sumSaldo(asetNetoItems);

      const pendapatanTT = sumSaldo(byPos(saldo, "pendapatan_tidak_terikat"));
      const bebanTT = sumSaldo(
        byPos(saldo, "beban_program", "beban_penunjang")
          .filter(a => !EXCLUDE_BEBAN_TRANSFER.includes(a.kode))
      );
      const surplusBerjalan = pendapatanTT - bebanTT;

      const pendapatanTerbatas = sumSaldo(byPos(saldo, "pendapatan_terikat_temporer", "pendapatan_terikat_permanen"));
      const bebanTerbatas = sumSaldo(byPos(saldo, "beban_terbatas"));
      const surplusTerbatasBerjalan = pendapatanTerbatas - bebanTerbatas;

      const totalAsetNeto = totalAsetNetoSaldo + surplusBerjalan + surplusTerbatasBerjalan;

      const selisih = totalAset - totalLiabilitas - totalAsetNeto;

      return {
        asetLancarItems, totalAL,
        asetTidakLancarItems, totalATL,
        totalAset,
        liabJPItems, totalLJP,
        liabJGItems, totalLJG,
        totalLiabilitas,
        asetNetoItems, totalAsetNetoSaldo,
        surplusBerjalan, surplusTerbatasBerjalan,
        totalAsetNeto,
        selisih,
      };
    },
  });
}

// ============================================================
// LAPORAN ARUS KAS — METODE LANGSUNG (ISAK 35)
// ============================================================
export function useLaporanArusKas(tahun: number, departemenIds?: string[]) {
  return useQuery({
    queryKey: ["isak35_arus_kas_direct", tahun, departemenIds],
    queryFn: async () => {
      const akunMeta = await getAkunMeta();

      const akunKasIds = new Set<string>();
      for (const a of Object.values(akunMeta)) {
        if (a.pos_isak35 === "aset_lancar" && isAkunKas(a.kode, a.nama)) {
          akunKasIds.add(a.id);
        }
      }

      const kasIdsArr = Array.from(akunKasIds);

      // kasAwal hanya dari saldo_awal_isak35 (per-tahun, manual).
      // Tidak fallback ke akun.saldo_awal karena saldo awal kas sudah
      // dicatat lewat jurnal pembuka — fallback ke akun.saldo_awal
      // akan double-count nilai yang sama.
      const saldoAwalQ = supabase
        .from("saldo_awal_isak35" as any)
        .select("akun_id, saldo")
        .eq("tahun", tahun)
        .in("akun_id", kasIdsArr.length > 0 ? kasIdsArr : ["00000000-0000-0000-0000-000000000000"]);
      if (departemenIds && departemenIds.length > 0) (saldoAwalQ as any).in("departemen_id", departemenIds);
      const { data: saldoAwalRows } = await saldoAwalQ;
      let kasAwal = 0;
      for (const r of (saldoAwalRows as any[]) || []) kasAwal += Number(r.saldo || 0);

      let allDetails: any[] = [];
      if (kasIdsArr.length > 0) {
        const rpcArusKas: any = { p_tahun: tahun, p_akun_kas_ids: kasIdsArr };
        if (departemenIds && departemenIds.length > 0) rpcArusKas.p_departemen_ids = departemenIds;
        const { data: detailRows, error: detErr } = await (supabase as any)
          .rpc("get_detail_jurnal_kas", rpcArusKas);
        if (detErr) throw detErr;
        allDetails = (detailRows as any[]) || [];
      }

      const perJurnal: Record<string, any[]> = {};
      for (const d of allDetails) {
        if (!perJurnal[d.jurnal_id]) perJurnal[d.jurnal_id] = [];
        perJurnal[d.jurnal_id].push(d);
      }

      const acc = {
        operasiPenerimaan: 0,
        operasiPengeluaran: 0,
        investasiPenerimaan: 0,
        investasiPengeluaran: 0,
        pendanaanPenerimaan: 0,
        pendanaanPengeluaran: 0,
        rincianPenerimaanOperasi: {} as Record<string, number>,
        rincianPengeluaranOperasi: {} as Record<string, number>,
      };

      const klasifikasiByLawan = (lawanPos: string | null | undefined): "operasi" | "investasi" | "pendanaan" => {
        if (lawanPos === "aset_tidak_lancar") return "investasi";
        if (lawanPos === "kewajiban_jangka_panjang") return "pendanaan";
        if (lawanPos === "aset_neto_tidak_terikat" || lawanPos === "aset_neto_terikat_temporer" || lawanPos === "aset_neto_terikat_permanen") return "pendanaan";
        return "operasi";
      };

      const namaPos = (pos: string | null | undefined, fallbackNama: string): string => {
        switch (pos) {
          case "pendapatan_tidak_terikat": return "Penerimaan Kas dari Donasi/Sumbangan & Jasa Pendidikan";
          case "pendapatan_terikat_temporer": return "Penerimaan Kas dari Sumbangan Terikat Temporer";
          case "pendapatan_terikat_permanen": return "Penerimaan Kas dari Sumbangan Terikat Permanen";
          case "beban_program": return "Pembayaran Kas untuk Beban Program";
          case "beban_penunjang": return "Pembayaran Kas untuk Beban Penunjang";
          case "kewajiban_jangka_pendek": return "Pembayaran/Penerimaan Liabilitas Jangka Pendek";
          default: return fallbackNama;
        }
      };

      for (const jId of Object.keys(perJurnal)) {
        const rows = perJurnal[jId];
        const sisiKas = rows.filter(r => akunKasIds.has(r.akun_id));
        if (sisiKas.length === 0) continue;
        const sisiLawan = rows.filter(r => !akunKasIds.has(r.akun_id));

        const totalKasDebit = sisiKas.reduce((s, r) => s + Number(r.debit || 0), 0);
        const totalKasKredit = sisiKas.reduce((s, r) => s + Number(r.kredit || 0), 0);
        const totalLawanDebit = sisiLawan.reduce((s, r) => s + Number(r.debit || 0), 0);
        const totalLawanKredit = sisiLawan.reduce((s, r) => s + Number(r.kredit || 0), 0);

        const netKas = totalKasDebit - totalKasKredit;
        if (netKas === 0) continue;

        const isPenerimaan = netKas > 0;
        const totalLawanRelevan = isPenerimaan ? totalLawanKredit : totalLawanDebit;
        const absKas = Math.abs(netKas);

        for (const lr of sisiLawan) {
          const meta = akunMeta[lr.akun_id];
          if (meta?.kode && (EXCLUDE_BEBAN_TRANSFER.includes(meta.kode) || EXCLUDE_ASET_INTERNAL.includes(meta.kode))) continue;
          const pos = meta?.pos_isak35 ?? null;
          const nilaiLawan = isPenerimaan ? Number(lr.kredit || 0) : Number(lr.debit || 0);
          if (nilaiLawan === 0) continue;
          const porsi = totalLawanRelevan > 0 ? (nilaiLawan / totalLawanRelevan) * absKas : 0;
          const cat = klasifikasiByLawan(pos);
          if (isPenerimaan) {
            if (cat === "operasi") acc.operasiPenerimaan += porsi;
            else if (cat === "investasi") acc.investasiPenerimaan += porsi;
            else acc.pendanaanPenerimaan += porsi;
            if (cat === "operasi") {
              const key = namaPos(pos, meta?.nama || "Penerimaan Lain");
              acc.rincianPenerimaanOperasi[key] = (acc.rincianPenerimaanOperasi[key] || 0) + porsi;
            }
          } else {
            if (cat === "operasi") acc.operasiPengeluaran += porsi;
            else if (cat === "investasi") acc.investasiPengeluaran += porsi;
            else acc.pendanaanPengeluaran += porsi;
            if (cat === "operasi") {
              const key = namaPos(pos, meta?.nama || "Pengeluaran Lain");
              acc.rincianPengeluaranOperasi[key] = (acc.rincianPengeluaranOperasi[key] || 0) + porsi;
            }
          }
        }
      }

      const arusOperasi = acc.operasiPenerimaan - acc.operasiPengeluaran;
      const arusInvestasi = acc.investasiPenerimaan - acc.investasiPengeluaran;
      const arusPendanaan = acc.pendanaanPenerimaan - acc.pendanaanPengeluaran;
      const kenaikanKas = arusOperasi + arusInvestasi + arusPendanaan;

      return {
        penerimaanOperasi: acc.operasiPenerimaan,
        pengeluaranOperasi: acc.operasiPengeluaran,
        arusOperasi,
        arusInvestasi,
        arusPendanaan,
        kenaikanKas,
        kasAwal,
        kasAkhir: kasAwal + kenaikanKas,
        rincianPenerimaanOperasi: acc.rincianPenerimaanOperasi,
        rincianPengeluaranOperasi: acc.rincianPengeluaranOperasi,
        investasiPenerimaan: acc.investasiPenerimaan,
        investasiPengeluaran: acc.investasiPengeluaran,
        pendanaanPenerimaan: acc.pendanaanPenerimaan,
        pendanaanPengeluaran: acc.pendanaanPengeluaran,
      };
    },
  });
}

export function useAsetTetapList(departemenIds?: string[]) {
  return useQuery({
    queryKey: ["aset_tetap", departemenIds],
    queryFn: async () => {
      let q = supabase.from("aset_tetap" as any).select("*").eq("aktif", true).order("tanggal_perolehan");
      if (departemenIds && departemenIds.length > 0) q = (q as any).in("departemen_id", departemenIds);
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
