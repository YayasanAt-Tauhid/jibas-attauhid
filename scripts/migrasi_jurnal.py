#!/usr/bin/env python3
"""
Migrasi delta jurnal: MariaDB jbsfina → Supabase
Jalankan di VPS: python3 migrasi_jurnal.py

Dependensi:
    pip install pymysql requests

Env vars (bisa di .env atau export langsung):
    SUPABASE_URL              https://rumdeqkrtfjxckqgokoy.supabase.co
    SUPABASE_SERVICE_ROLE_KEY eyJ...
    DB_HOST                   localhost
    DB_PORT                   3306 (default)
    DB_NAME                   jbsfina
    DB_USER                   ...
    DB_PASS                   ...
"""

import os
import sys
import json
import math
import pymysql
import requests

# ── Konfigurasi ──────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://rumdeqkrtfjxckqgokoy.supabase.co")
SERVICE_ROLE  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = int(os.environ.get("DB_PORT", 3306))
DB_NAME = os.environ.get("DB_NAME", "jbsfina")
DB_USER = os.environ.get("DB_USER", "")
DB_PASS = os.environ.get("DB_PASS", "")

BATCH_JURNAL  = 100
BATCH_DETAIL  = 200

# ── Supabase helpers ──────────────────────────────────────────────────────────

HEADERS = {
    "apikey":        SERVICE_ROLE,
    "Authorization": f"Bearer {SERVICE_ROLE}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=ignore-duplicates,return=minimal",
}


def supa_get(path, params=None):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def supa_post(path, rows):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, data=json.dumps(rows))
    if r.status_code not in (200, 201):
        print(f"  ERROR {r.status_code}: {r.text[:300]}")
        r.raise_for_status()


# ── Langkah 1: cari max replid di Supabase ───────────────────────────────────

def get_max_replid():
    rows = supa_get("jurnal", {
        "select":    "referensi",
        "referensi": "like.MIGRASI-jurnalumum-%",
        "order":     "referensi.desc",
        "limit":     1,
    })
    if not rows:
        return 0
    # format: MIGRASI-jurnalumum-14799
    return int(rows[0]["referensi"].split("-")[-1])


# ── Langkah 2: ambil delta dari MariaDB ──────────────────────────────────────

JURNAL_SQL = """
SELECT
    j.uid          AS id,
    j.nomor        AS nomor,
    j.tanggal      AS tanggal,
    COALESCE(j.keterangan, '') AS keterangan,
    CONCAT('MIGRASI-jurnalumum-', j.replid) AS referensi,
    d.uid          AS departemen_id,
    j.total_debit  AS total_debit,
    j.total_kredit AS total_kredit,
    'posted'       AS status,
    'umum'         AS tipe,
    NULL           AS jurnal_asal_id,
    NULL           AS program_dana_id
FROM jurnalumum j
LEFT JOIN departemen d ON d.id = j.departemen_id
WHERE j.replid > %s
ORDER BY j.replid
"""

DETAIL_SQL = """
SELECT
    j.uid   AS jurnal_id,
    a.uid   AS akun_id,
    jd.debit,
    jd.kredit,
    jd.keterangan,
    jd.urutan
FROM jurnalumumdetail jd
INNER JOIN jurnalumum j  ON j.id  = jd.jurnal_id
INNER JOIN akun       a  ON a.id  = jd.akun_id
WHERE j.replid > %s
ORDER BY j.replid, jd.urutan
"""


def fetch_delta(conn, max_replid):
    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(JURNAL_SQL, (max_replid,))
        jurnal = cur.fetchall()

    with conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute(DETAIL_SQL, (max_replid,))
        detail = cur.fetchall()

    # konversi tanggal ke string ISO
    for row in jurnal:
        if hasattr(row["tanggal"], "isoformat"):
            row["tanggal"] = row["tanggal"].isoformat()

    return jurnal, detail


# ── Langkah 3: insert batch ───────────────────────────────────────────────────

def insert_batches(table, rows, batch_size, label):
    total   = len(rows)
    batches = math.ceil(total / batch_size) if total else 0
    print(f"  {label}: {total} baris → {batches} batch")
    for i in range(batches):
        chunk = rows[i * batch_size : (i + 1) * batch_size]
        print(f"    batch {i+1}/{batches} ({len(chunk)} baris) ...", end=" ", flush=True)
        supa_post(table, chunk)
        print("OK")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    if not SERVICE_ROLE:
        sys.exit("ERROR: SUPABASE_SERVICE_ROLE_KEY belum di-set")
    if not DB_USER:
        sys.exit("ERROR: DB_USER belum di-set")

    print("=== Migrasi Delta Jurnal ===")

    # 1. max replid
    print("Cek max replid di Supabase ...", end=" ", flush=True)
    max_replid = get_max_replid()
    print(f"replid terakhir = {max_replid}")

    # 2. koneksi MariaDB
    print("Koneksi ke MariaDB ...", end=" ", flush=True)
    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT,
        db=DB_NAME, user=DB_USER, password=DB_PASS,
        charset="utf8mb4",
    )
    print("OK")

    # 3. ambil delta
    print("Ambil delta dari MariaDB ...")
    jurnal, detail = fetch_delta(conn, max_replid)
    conn.close()

    if not jurnal:
        print("Tidak ada jurnal baru. Selesai.")
        return

    new_max = int(jurnal[-1]["referensi"].split("-")[-1])
    print(f"  jurnal baru : {len(jurnal)} baris (replid {max_replid+1} – {new_max})")
    print(f"  detail baru : {len(detail)} baris")

    # 4. insert
    print("Insert ke Supabase ...")
    insert_batches("jurnal",        jurnal, BATCH_JURNAL, "jurnal")
    insert_batches("jurnal_detail", detail, BATCH_DETAIL, "jurnal_detail")

    # 5. verifikasi
    print("Verifikasi ...", end=" ", flush=True)
    total_jurnal = supa_get("jurnal", {"select": "id", "referensi": "like.MIGRASI-jurnalumum-%"})
    print(f"total jurnal migrasi di Supabase = {len(total_jurnal)}")

    print("=== SELESAI ===")


if __name__ == "__main__":
    main()
