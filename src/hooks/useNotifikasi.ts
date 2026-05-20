import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface NotifikasiItem {
  id: string;
  judul: string;
  pesan: string;
  tipe: "jurnal_draft" | "tagihan_belum_lunas" | "pengumuman";
  url?: string;
  created_at: string;
  dibaca: boolean;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 menit

export function useNotifikasi() {
  const { role } = useAuth();
  const [items, setItems] = useState<NotifikasiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("notif_read_ids");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const isKeuangan = role === "admin" || role === "keuangan";

  const fetchNotifikasi = useCallback(async () => {
    setLoading(true);
    const hasil: NotifikasiItem[] = [];

    // 1. Pengumuman aktif (semua role)
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: pengumuman } = await supabase
        .from("pengumuman")
        .select("id, judul, konten, created_at, tanggal_kadaluarsa")
        .eq("aktif", true)
        .lte("tanggal_tayang", today)
        .or(`tanggal_kadaluarsa.is.null,tanggal_kadaluarsa.gte.${today}`)
        .order("created_at", { ascending: false })
        .limit(10);

      if (pengumuman) {
        for (const p of pengumuman) {
          const id = `pengumuman-${p.id}`;
          hasil.push({
            id,
            judul: p.judul,
            pesan: (p.konten ?? "").slice(0, 80) + ((p.konten?.length ?? 0) > 80 ? "…" : ""),
            tipe: "pengumuman",
            url: "/pengumuman",
            created_at: p.created_at,
            dibaca: readIds.has(id),
          });
        }
      }
    } catch {
      // Tabel pengumuman mungkin belum ada — abaikan
    }

    // 2. Jurnal draft (admin & keuangan saja)
    if (isKeuangan) {
      const { data: jurnal, count } = await supabase
        .from("jurnal")
        .select("id, keterangan, created_at", { count: "exact" })
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(5);

      if (count && count > 0) {
        const id = "jurnal-draft-summary";
        hasil.push({
          id,
          judul: `${count} Jurnal Menunggu Posting`,
          pesan:
            jurnal && jurnal.length > 0
              ? `Terbaru: ${jurnal[0].keterangan}`
              : "Segera posting untuk menutup jurnal.",
          tipe: "jurnal_draft",
          url: "/keuangan/jurnal",
          created_at: jurnal?.[0]?.created_at ?? new Date().toISOString(),
          dibaca: readIds.has(id),
        });
      }
    }

    // 3. Tagihan belum lunas (admin & keuangan saja)
    if (isKeuangan) {
      const { count: countTagihan } = await supabase
        .from("tagihan")
        .select("id", { count: "exact", head: true })
        .not("status", "eq", "lunas");

      if (countTagihan && countTagihan > 0) {
        const id = "tagihan-belum-lunas-summary";
        hasil.push({
          id,
          judul: `${countTagihan} Tagihan Belum Lunas`,
          pesan: "Ada tagihan siswa yang perlu ditindaklanjuti.",
          tipe: "tagihan_belum_lunas",
          url: "/keuangan/pembayaran",
          created_at: new Date().toISOString(),
          dibaca: readIds.has(id),
        });
      }
    }

    // Urutkan: belum dibaca dulu, lalu by created_at desc
    hasil.sort((a, b) => {
      if (a.dibaca !== b.dibaca) return a.dibaca ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setItems(hasil);
    setLoading(false);
  }, [isKeuangan, readIds]);

  // Fetch on mount + auto-refresh tiap 5 menit
  useEffect(() => {
    fetchNotifikasi();

    timerRef.current = setInterval(() => {
      fetchNotifikasi();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchNotifikasi]);

  const tandaiBacaSemua = useCallback(() => {
    const allIds = items.map((i) => i.id);
    const newSet = new Set([...readIds, ...allIds]);
    setReadIds(newSet);
    localStorage.setItem("notif_read_ids", JSON.stringify([...newSet]));
    setItems((prev) => prev.map((i) => ({ ...i, dibaca: true })));
  }, [items, readIds]);

  const tandaiBaca = useCallback(
    (id: string) => {
      const newSet = new Set([...readIds, id]);
      setReadIds(newSet);
      localStorage.setItem("notif_read_ids", JSON.stringify([...newSet]));
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, dibaca: true } : i)));
    },
    [readIds]
  );

  const unreadCount = items.filter((i) => !i.dibaca).length;

  return { items, loading, unreadCount, tandaiBaca, tandaiBacaSemua, refresh: fetchNotifikasi };
}
