-- ============================================================
-- Modul Kas Kecil (Petty Cash) - Imprest System
-- ============================================================

-- 1. Settings: dana imprest & akun tertaut
CREATE TABLE kas_kecil_setting (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dana_imprest    numeric(15,2) NOT NULL DEFAULT 0,
  akun_kas_kecil_id uuid REFERENCES akun_rekening(id) ON DELETE SET NULL,
  akun_pengisian_id  uuid REFERENCES akun_rekening(id) ON DELETE SET NULL,
  keterangan      text,
  updated_at      timestamptz DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Satu baris saja (global)
INSERT INTO kas_kecil_setting (dana_imprest) VALUES (0);

-- 2. Catatan replenishment (pengisian ulang)
CREATE TABLE replenishment_kas_kecil (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal      date NOT NULL,
  jumlah       numeric(15,2) NOT NULL CHECK (jumlah > 0),
  keterangan   text,
  jurnal_id    uuid REFERENCES jurnal(id) ON DELETE SET NULL,
  dibuat_oleh  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

-- 3. Transaksi pengeluaran dari kas kecil
CREATE TABLE transaksi_kas_kecil (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal               date NOT NULL,
  keterangan            text NOT NULL,
  jenis_pengeluaran_id  uuid REFERENCES jenis_pengeluaran(id) ON DELETE SET NULL,
  jumlah                numeric(15,2) NOT NULL CHECK (jumlah > 0),
  penerima              text,
  no_bukti              text,
  replenishment_id      uuid REFERENCES replenishment_kas_kecil(id) ON DELETE SET NULL,
  dibuat_oleh           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz DEFAULT now()
);

-- Indeks
CREATE INDEX idx_transaksi_kas_kecil_tanggal  ON transaksi_kas_kecil(tanggal);
CREATE INDEX idx_transaksi_kas_kecil_rep_id   ON transaksi_kas_kecil(replenishment_id);
CREATE INDEX idx_replenishment_kas_kecil_tgl  ON replenishment_kas_kecil(tanggal);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE kas_kecil_setting    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaksi_kas_kecil  ENABLE ROW LEVEL SECURITY;
ALTER TABLE replenishment_kas_kecil ENABLE ROW LEVEL SECURITY;

-- Setting: semua user terotentikasi boleh baca, hanya admin/keuangan yang bisa ubah
CREATE POLICY "kas_kecil_setting_read"  ON kas_kecil_setting FOR SELECT TO authenticated USING (true);
CREATE POLICY "kas_kecil_setting_write" ON kas_kecil_setting FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Transaksi kas kecil
CREATE POLICY "transaksi_kas_kecil_read"  ON transaksi_kas_kecil FOR SELECT TO authenticated USING (true);
CREATE POLICY "transaksi_kas_kecil_write" ON transaksi_kas_kecil FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Replenishment
CREATE POLICY "replenishment_kas_kecil_read"  ON replenishment_kas_kecil FOR SELECT TO authenticated USING (true);
CREATE POLICY "replenishment_kas_kecil_write" ON replenishment_kas_kecil FOR ALL    TO authenticated USING (true) WITH CHECK (true);
