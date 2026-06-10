#!/usr/bin/env python3
"""
Migrasi komprehensif jbsfina (MariaDB VPS) → Supabase
Jalankan di VPS: python3 scripts/migrasi_jbsfina.py

Dependensi:
    pip install pymysql requests python-dotenv

Env vars (export atau simpan di .env):
    SUPABASE_URL              https://leyfwwmroijwnkrcblxe.supabase.co
    SUPABASE_SERVICE_ROLE_KEY eyJ...
    DB_HOST                   localhost
    DB_PORT                   3306 (default)
    DB_NAME                   jbsfina
    DB_USER                   ...
    DB_PASS                   ...

Mode:
    python3 migrasi_jbsfina.py           # migrasi semua (delta untuk jurnal)
    python3 migrasi_jbsfina.py --reset   # hapus semua data migrasi & mulai ulang
    python3 migrasi_jbsfina.py --akun    # hanya sync rekakun
    python3 migrasi_jbsfina.py --jurnal  # hanya sync jurnal (delta)
"""

import os, sys, json, math, argparse
import pymysql, requests
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── Konfigurasi ───────────────────────────────────────────────────────────────

SUPABASE_URL  = os.environ.get("SUPABASE_URL", "https://leyfwwmroijwnkrcblxe.supabase.co")
SERVICE_ROLE  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

DB_HOST   = os.environ.get("DB_HOST", "localhost")
DB_PORT   = int(os.environ.get("DB_PORT", 3306))
DB_NAME   = os.environ.get("DB_NAME", "jbsfina")
DB_USER   = os.environ.get("DB_USER", "root")
DB_PASS   = os.environ.get("DB_PASS", "")
# unix socket dipakai otomatis jika root tanpa password (seperti sudo mariadb)
DB_SOCKET = os.environ.get("DB_SOCKET", "/var/run/mysqld/mysqld.sock")

BATCH = 200

# ── Supabase REST helpers ─────────────────────────────────────────────────────

HEADERS = {
    "apikey":        SERVICE_ROLE,
    "Authorization": f"Bearer {SERVICE_ROLE}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=ignore-duplicates,return=minimal",
}

HEADERS_UPSERT = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}


def supa_get(path, params=None):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def supa_post(path, rows, upsert=False):
    h = HEADERS_UPSERT if upsert else HEADERS
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=h, data=json.dumps(rows))
    if r.status_code not in (200, 201):
        print(f"\n  ERROR {r.status_code}: {r.text[:400]}")
        r.raise_for_status()


def supa_delete(path, params):
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params)
    if r.status_code not in (200, 204):
        print(f"\n  DELETE ERROR {r.status_code}: {r.text[:200]}")


def insert_batches(table, rows, label, upsert=False):
    total = len(rows)
    if total == 0:
        print(f"  {label}: tidak ada data baru")
        return
    batches = math.ceil(total / BATCH)
    print(f"  {label}: {total} baris → {batches} batch", end="", flush=True)
    for i in range(batches):
        chunk = rows[i * BATCH:(i + 1) * BATCH]
        supa_post(table, chunk, upsert=upsert)
        print(".", end="", flush=True)
    print(f" OK")


# ── Kategori mapping jbsfina → Supabase ──────────────────────────────────────

KATEGORI_TO_JENIS = {
    "HARTA":      "aset",
    "AKTIVA":     "aset",
    "KEWAJIBAN":  "liabilitas",
    "HUTANG":     "liabilitas",
    "MODAL":      "ekuitas",
    "EKUITAS":    "ekuitas",
    "PENDAPATAN": "pendapatan",
    "PENERIMAAN": "pendapatan",
    "BIAYA":      "beban",
    "BEBAN":      "beban",
    "PENGELUARAN":"beban",
}

JENIS_TO_SALDO_NORMAL = {
    "aset":       "D",
    "beban":      "D",
    "liabilitas": "K",
    "ekuitas":    "K",
    "pendapatan": "K",
}

# Mapping kode jbsfina → (nama, kategori)
DEPT_MAP_JBSFINA = {
    "TK":             ("TK",               "unit_pendidikan"),
    "SD":             ("SD",               "unit_pendidikan"),
    "SMP":            ("SMP",              "unit_pendidikan"),
    "SMA":            ("SMA",              "unit_pendidikan"),
    "MTA":            ("MTA",              "unit_pendidikan"),
    "KEPONDOKAN":     ("Kepondokan",       "unit_pendidikan"),
    "UMUM":           ("Umum",             "unit_pendidikan"),
    "DAPOER ATTAUHID":("Dapoer Attauhid",  "unit_usaha"),
    "KANTIN ATTAUHID":("Kantin Attauhid",  "unit_usaha"),
    "MART ATTAUHID":  ("Mart Attauhid",    "unit_usaha"),
    "MART ICT":       ("Mart ICT",         "unit_usaha"),
    "MASJID ICT":     ("Masjid ICT",       "unit_dana_terikat"),
    "AYO BERSEDEKAH": ("Ayo Bersedekah",   "unit_dana_terikat"),
    "PALESTINA":      ("Palestina",        "unit_dana_terikat"),
    "SOSIAL":         ("Sosial",           "unit_dana_terikat"),
    "SUBSIDI SILANG": ("Subsidi Silang",   "unit_yayasan"),
    "LAINNYA":        ("Lainnya",          "unit_yayasan"),
}


def dept_info(kode):
    """Return (nama, kategori) untuk kode departemen dari jbsfina."""
    k = (kode or "").strip().upper()
    if k in DEPT_MAP_JBSFINA:
        return DEPT_MAP_JBSFINA[k]
    return kode, None  # kategori null → perlu diset manual di Supabase


# ── 1. Sync rekakun → akun_rekening ──────────────────────────────────────────

def sync_akun(conn):
    print("\n[1] Sync rekakun → akun_rekening ...")
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT replid, kode, kategori, nama, keterangan FROM rekakun ORDER BY kode")
        rows = cur.fetchall()

    # Ambil kode yang sudah ada di Supabase
    existing = supa_get("akun_rekening", {"select": "kode", "limit": "10000"})
    existing_kodes = {r["kode"] for r in existing}
    print(f"  Existing di Supabase: {len(existing_kodes)} akun")

    records = []
    for r in rows:
        kode = str(r["kode"]).strip()
        if kode in existing_kodes:
            continue  # skip yang sudah ada
        raw_kat = (r["kategori"] or "").strip().upper()
        jenis = KATEGORI_TO_JENIS.get(raw_kat, "beban")
        saldo_normal = JENIS_TO_SALDO_NORMAL.get(jenis, "D")
        records.append({
            "kode":         kode,
            "nama":         r["nama"] or "-",
            "jenis":        jenis,
            "saldo_normal": saldo_normal,
            "keterangan":   r["keterangan"] or None,
            "aktif":        True,
        })

    insert_batches("akun_rekening", records, "akun_rekening baru")
    return records


# ── 2. Sync departemen dari tahunbuku ─────────────────────────────────────────

def sync_departemen(conn):
    print("\n[2] Sync departemen dari tahunbuku ...")
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("SELECT DISTINCT departemen FROM tahunbuku WHERE departemen IS NOT NULL ORDER BY departemen")
        rows = cur.fetchall()

    existing = supa_get("departemen", {"select": "kode", "limit": "1000"})
    existing_kodes = {r["kode"] for r in existing}
    print(f"  Existing di Supabase: {len(existing_kodes)} departemen")

    records = []
    for r in rows:
        kode = (r["departemen"] or "").strip()
        if not kode or kode in existing_kodes:
            continue
        nama, kategori = dept_info(kode)
        rec = {"kode": kode, "nama": nama, "aktif": True}
        if kategori:
            rec["kategori"] = kategori
        records.append(rec)

    insert_batches("departemen", records, "departemen baru")


# ── 3. Sync tahunbuku → tahun_ajaran ─────────────────────────────────────────

def sync_tahun_ajaran(conn, dept_map):
    print("\n[3] Sync tahunbuku → tahun_ajaran ...")
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        # Ambil unik per nama tahun ajaran (karena 1 tahun bisa ada di banyak departemen)
        cur.execute("""
            SELECT tahunbuku, MIN(tanggalmulai) AS tanggalmulai,
                   MAX(aktif) AS aktif, MIN(keterangan) AS keterangan
            FROM tahunbuku
            GROUP BY tahunbuku ORDER BY tahunbuku
        """)
        rows = cur.fetchall()

    existing = supa_get("tahun_ajaran", {"select": "nama", "limit": "1000"})
    existing_nama = {r["nama"] for r in existing}
    print(f"  Existing di Supabase: {len(existing_nama)} tahun_ajaran")

    records = []
    for r in rows:
        nama = r["tahunbuku"] or "-"
        if nama in existing_nama:
            continue
        tgl_mulai = r["tanggalmulai"].isoformat() if r["tanggalmulai"] else None
        records.append({
            "nama":          nama,
            "tanggal_mulai": tgl_mulai,
            "aktif":         bool(r["aktif"]),
            "keterangan":    r["keterangan"] or None,
        })

    insert_batches("tahun_ajaran", records, "tahun_ajaran baru")


# ── 4. Sync jurnal + jurnaldetail (delta) ────────────────────────────────────

def get_max_replid_jurnal():
    rows = supa_get("jurnal", {
        "select":    "referensi",
        "referensi": "like.MIGR-jbsfina-%",
        "limit":     "50000",
    })
    if not rows:
        return 0
    try:
        return max(int(r["referensi"].split("-")[-1]) for r in rows)
    except Exception:
        return 0


def fetch_periode_ditutup():
    """Ambil daftar (tgl_mulai, tgl_selesai) tahun buku yang sudah ditutup unit_pendidikan."""
    rows = supa_get("v_status_tutup_buku", {
        "select": "tanggal_mulai,tanggal_selesai,ditutup_unit_pendidikan,ditutup_unit_usaha_dana",
        "limit":  "100",
    })
    locked = []
    for r in rows:
        if r.get("ditutup_unit_pendidikan") or r.get("ditutup_unit_usaha_dana"):
            locked.append((r["tanggal_mulai"], r["tanggal_selesai"]))
    return locked  # list of (tgl_mulai_str, tgl_selesai_str)


def is_periode_locked(tanggal_str, locked_periodes):
    """Return True jika tanggal jatuh dalam periode yang sudah ditutup."""
    if not tanggal_str or not locked_periodes:
        return False
    from datetime import date
    tgl = date.fromisoformat(str(tanggal_str)[:10])
    for tgl_mulai, tgl_selesai in locked_periodes:
        if date.fromisoformat(tgl_mulai) <= tgl <= date.fromisoformat(tgl_selesai):
            return True
    return False


def sync_jurnal(conn, akun_map, dept_map):
    print("\n[4] Sync jurnal + jurnaldetail (delta) ...")

    max_replid = get_max_replid_jurnal()
    print(f"  max replid di Supabase = {max_replid}")

    locked_periodes = fetch_periode_ditutup()
    if locked_periodes:
        print(f"  Periode terkunci (skip): {locked_periodes}")

    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("""
            SELECT j.replid, j.tanggal, j.transaksi, j.keterangan,
                   j.nokas, j.sumber, j.idtahunbuku,
                   tb.departemen
            FROM jurnal j
            LEFT JOIN tahunbuku tb ON tb.replid = j.idtahunbuku
            WHERE j.replid > %s
            ORDER BY j.replid
        """, (max_replid,))
        jurnal_rows = cur.fetchall()

    if not jurnal_rows:
        print("  Tidak ada jurnal baru.")
        return

    replid_list = [r["replid"] for r in jurnal_rows]
    fmt = ",".join(["%s"] * len(replid_list))

    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(f"""
            SELECT jd.idjurnal, jd.koderek, jd.debet, jd.kredit, jd.replid AS dreplid
            FROM jurnaldetail jd
            WHERE jd.idjurnal IN ({fmt})
            ORDER BY jd.idjurnal, jd.replid
        """, replid_list)
        detail_rows = cur.fetchall()

    # Hitung total debit/kredit per jurnal
    totals = {}
    for d in detail_rows:
        key = d["idjurnal"]
        if key not in totals:
            totals[key] = {"debit": 0, "kredit": 0}
        totals[key]["debit"]  += float(d["debet"]  or 0)
        totals[key]["kredit"] += float(d["kredit"] or 0)

    # Build jurnal records — gunakan UUID baru (gen via Supabase default)
    # Kita butuh mapping replid → uuid untuk insert detail
    # Cara: insert jurnal satu-satu dan baca id-nya (terlalu lambat)
    # Alternatif: generate UUID di Python, sertakan dalam insert
    import uuid as uuidlib

    replid_to_uuid = {}
    jurnal_records = []
    skipped_locked = 0
    for r in jurnal_rows:
        tanggal = r["tanggal"].isoformat() if r["tanggal"] else None
        if is_periode_locked(tanggal, locked_periodes):
            skipped_locked += 1
            continue

        uid = str(uuidlib.uuid4())
        replid_to_uuid[r["replid"]] = uid
        kode_dept = (r["departemen"] or "").strip()
        dept_id = dept_map.get(kode_dept)
        keterangan = r["transaksi"] or r["keterangan"] or "-"
        tot = totals.get(r["replid"], {"debit": 0, "kredit": 0})

        jurnal_records.append({
            "id":            uid,
            "nomor":         f"JBSFINA-{r['replid']}",
            "tanggal":       tanggal,
            "keterangan":    keterangan,
            "referensi":     f"MIGR-jbsfina-{r['replid']}",
            "departemen_id": dept_id,
            "total_debit":   tot["debit"],
            "total_kredit":  tot["kredit"],
            "status":        "posted",
        })

    # Build detail records
    detail_records = []
    skipped_akun = set()
    for d in detail_rows:
        kode = str(d["koderek"] or "").strip()
        akun_id = akun_map.get(kode)
        if not akun_id:
            skipped_akun.add(kode)
            continue
        jurnal_uuid = replid_to_uuid.get(d["idjurnal"])
        if not jurnal_uuid:
            continue
        detail_records.append({
            "jurnal_id": jurnal_uuid,
            "akun_id":   akun_id,
            "debit":     float(d["debet"]  or 0),
            "kredit":    float(d["kredit"] or 0),
            "urutan":    1,
        })

    if skipped_akun:
        print(f"  PERINGATAN: kode akun tidak ditemukan di Supabase: {sorted(skipped_akun)}")

    insert_batches("jurnal",        jurnal_records,  "jurnal")
    insert_batches("jurnal_detail", detail_records,  "jurnal_detail")

    new_max = jurnal_rows[-1]["replid"]
    if skipped_locked:
        print(f"  Skip {skipped_locked} jurnal (periode sudah ditutup buku)")
    print(f"  Selesai: {len(jurnal_records)} jurnal, {len(detail_records)} detail (replid s/d {new_max})")


# ── Ambil lookup maps dari Supabase ──────────────────────────────────────────

def fetch_akun_map():
    """kode → id"""
    print("  Mengambil akun_rekening dari Supabase ...", end=" ", flush=True)
    rows = supa_get("akun_rekening", {"select": "id,kode", "limit": "10000"})
    m = {r["kode"]: r["id"] for r in rows}
    print(f"{len(m)} akun")
    return m


def fetch_dept_map():
    """kode → id"""
    print("  Mengambil departemen dari Supabase ...", end=" ", flush=True)
    rows = supa_get("departemen", {"select": "id,kode", "limit": "1000"})
    m = {r["kode"]: r["id"] for r in rows}
    print(f"{len(m)} departemen")
    return m


# ── Reset ─────────────────────────────────────────────────────────────────────

def reset_migrasi():
    print("\n[RESET] Menghapus data migrasi jbsfina dari Supabase ...")
    # hapus jurnal_detail terlebih dahulu (FK)
    rows = supa_get("jurnal", {
        "select":    "id",
        "referensi": "like.MIGR-jbsfina-%",
        "limit":     "50000",
    })
    if rows:
        ids = [r["id"] for r in rows]
        print(f"  Hapus {len(ids)} jurnal_detail ...", end=" ", flush=True)
        for i in range(0, len(ids), 500):
            chunk = ids[i:i+500]
            # hapus detail by jurnal_id IN (...)
            for jid in chunk:
                supa_delete("jurnal_detail", {"jurnal_id": f"eq.{jid}"})
        print("OK")
        print(f"  Hapus {len(ids)} jurnal ...", end=" ", flush=True)
        supa_delete("jurnal", {"referensi": "like.MIGR-jbsfina-%"})
        print("OK")
    else:
        print("  Tidak ada jurnal migrasi.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Migrasi jbsfina → Supabase")
    parser.add_argument("--reset",   action="store_true", help="Hapus semua data migrasi & mulai ulang")
    parser.add_argument("--akun",    action="store_true", help="Hanya sync rekakun")
    parser.add_argument("--jurnal",  action="store_true", help="Hanya sync jurnal (delta)")
    args = parser.parse_args()

    if not SERVICE_ROLE:
        sys.exit("ERROR: SUPABASE_SERVICE_ROLE_KEY belum di-set")

    if args.reset:
        reset_migrasi()
        print("Reset selesai. Jalankan ulang tanpa --reset untuk migrasi ulang.")
        return

    print("=== Migrasi jbsfina → Supabase ===")
    print(f"  DB   : {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}")
    print(f"  Supa : {SUPABASE_URL}")

    # Gunakan unix socket jika MariaDB tidak listen TCP (default di Ubuntu)
    use_socket = os.path.exists(DB_SOCKET)
    if use_socket:
        conn = pymysql.connect(
            unix_socket=DB_SOCKET,
            db=DB_NAME, user=DB_USER, password=DB_PASS,
            charset="utf8mb4",
        )
        print(f"  Koneksi MariaDB: OK (unix socket: {DB_SOCKET})")
    else:
        conn = pymysql.connect(
            host=DB_HOST, port=DB_PORT,
            db=DB_NAME, user=DB_USER, password=DB_PASS,
            charset="utf8mb4",
        )
        print(f"  Koneksi MariaDB: OK (TCP {DB_HOST}:{DB_PORT})")

    try:
        if args.akun:
            sync_akun(conn)
        elif args.jurnal:
            akun_map = fetch_akun_map()
            dept_map = fetch_dept_map()
            sync_jurnal(conn, akun_map, dept_map)
        else:
            # Full migration
            sync_akun(conn)
            sync_departemen(conn)
            akun_map = fetch_akun_map()
            dept_map = fetch_dept_map()
            sync_tahun_ajaran(conn, {})
            sync_jurnal(conn, akun_map, dept_map)
    finally:
        conn.close()

    print("\n=== SELESAI ===")


if __name__ == "__main__":
    main()
