

## Plan: Auto-Generate Tagihan on Tarif Save

### Problem
Currently, saving a tarif only creates a price override record. Generating actual tagihan + jurnal piutang requires a separate tab and button. The user wants this combined into one action.

### Approach

**1. Enhance "Tambah Tarif" Dialog** (`TabTarifTagihan.tsx`)
- Add bulan selection to the dialog (same UI as current Generate dialog): month checkboxes for `bulanan` type, auto-skip for `sekali` type
- Add a checkbox "Juga generate tagihan & jurnal piutang otomatis" (default checked)
- On save: first insert tarif_tagihan record, then call `generate-tagihan` edge function with the same parameters (jenis_id, tahun_ajaran_id, bulan_list, etc.)
- The edge function already handles: fetching active students, checking duplicates, creating jurnal piutang entries

**2. Remove "Generate & Daftar Tagihan" Tab**
- Remove the `<Tabs>` wrapper and `GenerateTagihanSection` component entirely
- Move the "Daftar Tagihan" table (with filters) below the Tarif table in the same view, so admins can still see generated tagihan status

**3. No Backend Changes**
- The `generate-tagihan` edge function already supports all needed parameters
- No DB migration needed

### Files Modified
- `src/pages/keuangan/TabTarifTagihan.tsx` — Merge generate into save flow, remove separate tab, add tagihan list below tarif table

### UI Layout After Change
```text
┌──────────────────────────────────────────┐
│ Alert: tarif priority explanation         │
│ Filter: Jenis Pembayaran                 │
│ [+ Tambah Tarif]                         │
│ ┌── Tarif Table ──────────────────────┐  │
│ └─────────────────────────────────────┘  │
│                                          │
│ ── Daftar Tagihan ─────────────────────  │
│ Alert: jurnal piutang otomatis info      │
│ Filters: Tahun | Jenis | Status          │
│ ┌── Tagihan Table ────────────────────┐  │
│ └─────────────────────────────────────┘  │
└──────────────────────────────────────────┘

Dialog "Tambah Tarif":
  - Jenis Pembayaran
  - Siswa (opsional)
  - Kelas (opsional)
  - Tahun Ajaran (wajib untuk generate)
  - Nominal Override
  - Keterangan
  - ☑ Generate tagihan & jurnal piutang
  - [Bulan selection - if bulanan & generate checked]
  - [Simpan]
```

### Logic on Save
1. Insert `tarif_tagihan` record (existing behavior)
2. If "generate tagihan" checked AND `tahun_ajaran_id` is set:
   - Call `generate-tagihan` edge function
   - For `sekali` type: no bulan needed
   - For `bulanan` type: use selected months
3. Show combined success toast with tarif + tagihan counts

