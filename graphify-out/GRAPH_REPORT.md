# Graph Report - .  (2026-05-26)

## Corpus Check
- 273 files · ~178,431 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1277 nodes · 4265 edges · 71 communities (65 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 8,200 input · 1,800 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Academic Records & Scheduling|Academic Records & Scheduling]]
- [[_COMMUNITY_Financial Assets & Accounts|Financial Assets & Accounts]]
- [[_COMMUNITY_Academic Reports & Alumni|Academic Reports & Alumni]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_Routing & Navigation|Routing & Navigation]]
- [[_COMMUNITY_Student Management|Student Management]]
- [[_COMMUNITY_Account Ledger Hooks|Account Ledger Hooks]]
- [[_COMMUNITY_Core System Architecture|Core System Architecture]]
- [[_COMMUNITY_UI Notifications & Navigation|UI Notifications & Navigation]]
- [[_COMMUNITY_Balance Sheet Accounting|Balance Sheet Accounting]]
- [[_COMMUNITY_Payment Period Management|Payment Period Management]]
- [[_COMMUNITY_Fiscal Year & Billing|Fiscal Year & Billing]]
- [[_COMMUNITY_Toast Notification System|Toast Notification System]]
- [[_COMMUNITY_Academic Reference Settings|Academic Reference Settings]]
- [[_COMMUNITY_UI Utility Components|UI Utility Components]]
- [[_COMMUNITY_TypeScript App Config|TypeScript App Config]]
- [[_COMMUNITY_Dev Dependencies|Dev Dependencies]]
- [[_COMMUNITY_Login & Auth Forms|Login & Auth Forms]]
- [[_COMMUNITY_Financial Audit Logging|Financial Audit Logging]]
- [[_COMMUNITY_Payment Gateway Integration|Payment Gateway Integration]]
- [[_COMMUNITY_ShadCN UI Config|ShadCN UI Config]]
- [[_COMMUNITY_Journal & Period Locking|Journal & Period Locking]]
- [[_COMMUNITY_Student Billing Hooks|Student Billing Hooks]]
- [[_COMMUNITY_TypeScript Node Config|TypeScript Node Config]]
- [[_COMMUNITY_App Layout & Routing|App Layout & Routing]]
- [[_COMMUNITY_Academic Calendar & Tariffs|Academic Calendar & Tariffs]]
- [[_COMMUNITY_Staff Statistics & Audit|Staff Statistics & Audit]]
- [[_COMMUNITY_Edge Function Auth Utilities|Edge Function Auth Utilities]]
- [[_COMMUNITY_Admin Edge Functions|Admin Edge Functions]]
- [[_COMMUNITY_Package Scripts|Package Scripts]]
- [[_COMMUNITY_Supabase Client Setup|Supabase Client Setup]]
- [[_COMMUNITY_TypeScript Strict Config|TypeScript Strict Config]]
- [[_COMMUNITY_Data Export & Backup|Data Export & Backup]]
- [[_COMMUNITY_Menubar Components|Menubar Components]]
- [[_COMMUNITY_Support Portal|Support Portal]]
- [[_COMMUNITY_Bulk Payment Operations|Bulk Payment Operations]]
- [[_COMMUNITY_Chart Components|Chart Components]]
- [[_COMMUNITY_Command Palette UI|Command Palette UI]]
- [[_COMMUNITY_Supabase Type Definitions|Supabase Type Definitions]]
- [[_COMMUNITY_Context Menu Components|Context Menu Components]]
- [[_COMMUNITY_Auth Testing Utilities|Auth Testing Utilities]]
- [[_COMMUNITY_Role-Based Edge Functions|Role-Based Edge Functions]]
- [[_COMMUNITY_NIS Number Generator|NIS Number Generator]]
- [[_COMMUNITY_Sheet Drawer Components|Sheet Drawer Components]]
- [[_COMMUNITY_Staff Payment Queries|Staff Payment Queries]]
- [[_COMMUNITY_Bulk Payment Edge Function|Bulk Payment Edge Function]]
- [[_COMMUNITY_Breadcrumb Navigation|Breadcrumb Navigation]]
- [[_COMMUNITY_Navigation Menu Components|Navigation Menu Components]]
- [[_COMMUNITY_Student Form Schema|Student Form Schema]]
- [[_COMMUNITY_Integrity & Hash Utilities|Integrity & Hash Utilities]]
- [[_COMMUNITY_Toggle Group Components|Toggle Group Components]]
- [[_COMMUNITY_Dashboard & Visualization|Dashboard & Visualization]]
- [[_COMMUNITY_Login Test Mocks|Login Test Mocks]]
- [[_COMMUNITY_Multi-Lembaga Edge Function|Multi-Lembaga Edge Function]]
- [[_COMMUNITY_Supabase Project Config|Supabase Project Config]]
- [[_COMMUNITY_Print Layout Component|Print Layout Component]]
- [[_COMMUNITY_CORS Utility|CORS Utility]]
- [[_COMMUNITY_Midtrans Type Definitions|Midtrans Type Definitions]]
- [[_COMMUNITY_Generate Tagihan Function|Generate Tagihan Function]]
- [[_COMMUNITY_Journal Data Sync|Journal Data Sync]]
- [[_COMMUNITY_Placeholder Image Asset|Placeholder Image Asset]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 93 edges
2. `supabase` - 88 edges
3. `Card` - 83 edges
4. `CardContent` - 83 edges
5. `Button` - 77 edges
6. `SelectTrigger` - 65 edges
7. `SelectContent` - 65 edges
8. `SelectItem` - 65 edges
9. `useAuth()` - 62 edges
10. `Label` - 60 edges

## Surprising Connections (you probably didn't know these)
- `Domain Separation: Academic Year vs Fiscal Year` --semantically_similar_to--> `Period Locking Mechanism (Block Entries to Closed Periods)`  [INFERRED] [semantically similar]
  SESI_NOTES.md → .lovable/plan.md
- `Period Locking Mechanism (Block Entries to Closed Periods)` --semantically_similar_to--> `RPC: is_periode_ditutup`  [INFERRED] [semantically similar]
  .lovable/plan.md → SESI_NOTES.md
- `Hook: useKeuangan.ts (with useTahunBuku, useTahunBukuAktif)` --references--> `Supabase Backend (Auth, PostgreSQL, Storage)`  [INFERRED]
  SESI_NOTES.md → JIBAS_BLUEPRINT.md
- `index.html — SPA Entry Point (Hijrah At-Tauhid)` --implements--> `JIBAS — School Information Management System`  [EXTRACTED]
  index.html → JIBAS_BLUEPRINT.md
- `Lovable.dev Project Platform` --references--> `JIBAS — School Information Management System`  [EXTRACTED]
  README.md → JIBAS_BLUEPRINT.md

## Hyperedges (group relationships)
- **tahun_buku Migration: DB Tables + RPC/Views + Edge Functions + Frontend Hooks** — sesi_notes_tahun_buku_table, sesi_notes_rpc_proses_pembayaran_atomik, sesi_notes_edge_function_proses_pembayaran, sesi_notes_hook_usekeuangan [EXTRACTED 1.00]
- **JIBAS Multi-Module Architecture with Multi-Lembaga Support** — jibas_blueprint_jibas_system, jibas_blueprint_multi_lembaga, jibas_blueprint_departemen_id, jibas_blueprint_rls, jibas_blueprint_supabase_backend [INFERRED 0.95]
- **Year-End Closing Process: Tutup Buku + Audit Trail + Period Locking** — lovable_plan_tutup_buku_fix, lovable_plan_log_tutup_buku, lovable_plan_period_locking, sesi_notes_tahun_buku_table [EXTRACTED 1.00]

## Communities (71 total, 6 thin omitted)

### Community 0 - "Academic Records & Scheduling"
Cohesion: 0.06
Nodes (108): HARI_LIST, TIME_SLOTS, KATEGORI, JENIS_UJIAN, STATUS_OPTIONS, STATUS_OPTIONS, STATUS_MAP, COLORS (+100 more)

### Community 1 - "Financial Assets & Accounts"
Cohesion: 0.06
Nodes (51): AkunMeta, depresiasiSatuAset(), EXCLUDE_ASET_INTERNAL, EXCLUDE_BEBAN_TRANSFER, filterTahunSaldoAwal(), hitungSaldoAkun(), PeriodeFilter, periodeLabel() (+43 more)

### Community 2 - "Academic Reports & Alumni"
Cohesion: 0.06
Nodes (51): CetakRapor(), DataAlumni(), JadwalPerGuru(), JadwalPerKelas(), KalenderAkademik(), KomentarRapor(), LeggerNilai(), MutasiSiswa() (+43 more)

### Community 3 - "NPM Dependencies"
Cohesion: 0.04
Nodes (52): dependencies, class-variance-authority, clsx, cmdk, date-fns, embla-carousel-react, @hookform/resolvers, input-otp (+44 more)

### Community 4 - "Routing & Navigation"
Cohesion: 0.07
Nodes (36): ProtectedRouteProps, NavLink, NavLinkCompatProps, UserRole, useIsMobile(), AppSidebar(), MenuItem, menuItems (+28 more)

### Community 5 - "Student Management"
Cohesion: 0.09
Nodes (21): DaftarSiswa(), DetailSiswa(), FormSiswa(), SiswaWithRelations, useCreateSiswa(), useDeleteSiswa(), useSiswaDetail(), useSiswaDetailOrangtua() (+13 more)

### Community 6 - "Account Ledger Hooks"
Cohesion: 0.08
Nodes (34): useAkunByJenis(), useAllAkunRekening(), useCreateAkunRekening(), useCreatePengaturanAkun(), useDeleteAkunRekening(), useDeletePengaturanAkun(), useUpdateAkunRekening(), useUpdatePengaturanAkun() (+26 more)

### Community 7 - "Core System Architecture"
Cohesion: 0.07
Nodes (36): index.html — SPA Entry Point (Hijrah At-Tauhid), Midtrans Snap.js Payment Gateway Integration, Authentication & Role-Based Access System, departemen_id Column — Multi-Lembaga Data Filter, JIBAS 32.0 (Legacy PHP System), JIBAS — School Information Management System, Modul Akademik, Modul Buletin (School Announcements) (+28 more)

### Community 8 - "UI Notifications & Navigation"
Cohesion: 0.09
Nodes (24): NotifikasiItem, useNotifikasi(), AppBreadcrumb(), BreadcrumbSegment, buildBreadcrumbs(), routeMap, navItems, PortalLayout() (+16 more)

### Community 9 - "Balance Sheet Accounting"
Cohesion: 0.08
Nodes (20): AkunNeraca, POS_ASET, POS_ASET_NETO, POS_BEBAN, POS_KEWAJIBAN, POS_PENDAPATAN, TabNeracaAkuntansi(), Akun (+12 more)

### Community 10 - "Payment Period Management"
Cohesion: 0.11
Nodes (26): BULAN_NAMES, useCreatePembayaran(), useCreatePengeluaran(), useDeletePengeluaran(), useJenisPengeluaran(), usePembayaranBySiswa(), usePengeluaranList(), useRekapKeuanganPerLembaga() (+18 more)

### Community 11 - "Fiscal Year & Billing"
Cohesion: 0.11
Nodes (26): terbilang(), useTahunBuku(), useTahunBukuAktif(), useTagihanBySiswa(), useTarifSiswa(), FORM_DEFAULT, InputPembayaran(), useProsesPembayaran() (+18 more)

### Community 12 - "Toast Notification System"
Cohesion: 0.11
Nodes (24): Action, ActionType, actionTypes, addToRemoveQueue(), dispatch(), genId(), listeners, memoryState (+16 more)

### Community 13 - "Academic Reference Settings"
Cohesion: 0.10
Nodes (18): ReferensiAkademik(), TabAngkatan(), TabKelas(), TabMapel(), TabTingkat(), useDepartemenPendidikan(), useTingkat(), quickLinks (+10 more)

### Community 14 - "UI Utility Components"
Cohesion: 0.12
Nodes (21): cn(), ButtonProps, buttonVariants, Calendar(), CalendarProps, DrawerContent, DrawerDescription, DrawerFooter() (+13 more)

### Community 15 - "TypeScript App Config"
Cohesion: 0.09
Nodes (22): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+14 more)

### Community 16 - "Dev Dependencies"
Cohesion: 0.09
Nodes (22): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, jsdom (+14 more)

### Community 17 - "Login & Auth Forms"
Cohesion: 0.16
Nodes (16): LoginForm, loginSchema, LoginForm, loginSchema, PasswordForm, passwordSchema, FormControl, FormDescription (+8 more)

### Community 18 - "Financial Audit Logging"
Cohesion: 0.14
Nodes (18): logAuditKeuangan(), usePengaturanAkun(), PengakuanPendapatan(), currentYear, now, PiutangManajemen(), usePenyisihanList(), useTagihanBelumLunas() (+10 more)

### Community 19 - "Payment Gateway Integration"
Cohesion: 0.11
Nodes (18): authHeader, authString, corsHeaders, CreatePaymentBody, dateStr, itemsToInsert, kelasInfo, kelasMap (+10 more)

### Community 20 - "ShadCN UI Config"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 21 - "Journal & Period Locking"
Cohesion: 0.24
Nodes (13): useAkunRekening(), useBukuBesar(), useCreateJurnal(), useDeleteJurnal(), useJurnalDetail(), useJurnalList(), useKoreksiJurnal(), usePostJurnal() (+5 more)

### Community 22 - "Student Billing Hooks"
Cohesion: 0.24
Nodes (11): useAngkatan(), useAllJenisPembayaran(), useGenerateTagihan(), useTagihanList(), useAllTarifTagihan(), useCreateTarifTagihan(), useDeleteTarifTagihan(), useUpdateTarifTagihan() (+3 more)

### Community 23 - "TypeScript Node Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 24 - "App Layout & Routing"
Cohesion: 0.13
Nodes (6): AppLayout(), subModules, sections, queryClient, Toaster(), ToasterProps

### Community 25 - "Academic Calendar & Tariffs"
Cohesion: 0.27
Nodes (11): BULAN_ORDER_AKADEMIK, namaBulan(), useJenisPembayaran(), useTahunAjaranAktif(), getTarifBatch(), LaporanBayarKelas(), TabArusKas(), TunggakanPembayaran() (+3 more)

### Community 26 - "Staff Statistics & Audit"
Cohesion: 0.15
Nodes (13): useAuditKeuangan(), useLembaga(), DUK(), StatistikPegawai(), AuditPerubahanData(), AuditTrail(), LaporanBayarSiswa(), LaporanKeuangan() (+5 more)

### Community 27 - "Edge Function Auth Utilities"
Cohesion: 0.14
Nodes (11): authHeader, corsHeaders, kodeRombel, npsn4, rombelCode, supabase, supabaseAnon, tahun2 (+3 more)

### Community 28 - "Admin Edge Functions"
Cohesion: 0.14
Nodes (12): admin, authHeader, corsHeaders, dimukaAkunId, jumlahValid, kasAkunId, NAMA_BULAN, periodeLocked (+4 more)

### Community 29 - "Package Scripts"
Cohesion: 0.15
Nodes (12): name, private, scripts, build, build:dev, dev, lint, preview (+4 more)

### Community 30 - "Supabase Client Setup"
Cohesion: 0.15
Nodes (12): adminClient, anonClient, authHeader, corsHeaders, errors, existingQuery, existingSet, kelasIds (+4 more)

### Community 31 - "TypeScript Strict Config"
Cohesion: 0.17
Nodes (11): compilerOptions, allowJs, noImplicitAny, noUnusedLocals, noUnusedParameters, paths, skipLibCheck, strictNullChecks (+3 more)

### Community 32 - "Data Export & Backup"
Cohesion: 0.21
Nodes (7): TableKey, TABLES, formatRupiah(), NAMA_BULAN, PortalTagihan(), TagihanItem, Checkbox

### Community 33 - "Menubar Components"
Cohesion: 0.17
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 34 - "Support Portal"
Cohesion: 0.26
Nodes (7): contacts, faqs, PortalRiwayat(), statusConfig, AccordionContent, AccordionItem, AccordionTrigger

### Community 35 - "Bulk Payment Operations"
Cohesion: 0.17
Nodes (11): authHeader, BulkPayload, cleanPhone, corsHeaders, headers, results, supabase, supabaseAdmin (+3 more)

### Community 36 - "Chart Components"
Cohesion: 0.18
Nodes (7): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, THEMES

### Community 37 - "Command Palette UI"
Cohesion: 0.18
Nodes (9): Command, CommandDialogProps, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator (+1 more)

### Community 38 - "Supabase Type Definitions"
Cohesion: 0.18
Nodes (10): CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables (+2 more)

### Community 39 - "Context Menu Components"
Cohesion: 0.20
Nodes (9): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut(), ContextMenuSubContent (+1 more)

### Community 40 - "Auth Testing Utilities"
Cohesion: 0.22
Nodes (6): ProtectedRoute(), { container }, mockUseAuth, AuthContext, AuthContextType, AuthProvider()

### Community 41 - "Role-Based Edge Functions"
Cohesion: 0.20
Nodes (8): allowedRoles, authHeader, corsHeaders, grouped, predikat, supabase, supabaseAnon, weights

### Community 42 - "NIS Number Generator"
Cohesion: 0.33
Nodes (7): NISPreview(), NISPreviewProps, generateNISPreview(), generateNISViaEdgeFunction(), getKodeRombel(), NISComponents, parseNISComponents()

### Community 43 - "Sheet Drawer Components"
Cohesion: 0.22
Nodes (8): SheetContent, SheetContentProps, SheetDescription, SheetFooter(), SheetHeader(), SheetOverlay, SheetTitle, sheetVariants

### Community 44 - "Staff Payment Queries"
Cohesion: 0.22
Nodes (8): authHeader, corsHeaders, paid, query, staffRoles, supabase, supabaseAnon, tunggakan

### Community 45 - "Bulk Payment Edge Function"
Cohesion: 0.22
Nodes (8): authHeader, BulkPayload, corsHeaders, results, supabase, supabaseAdmin, TELEGRAM_BOT_TOKEN, TelegramPayload

### Community 46 - "Breadcrumb Navigation"
Cohesion: 0.25
Nodes (7): Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator()

### Community 47 - "Navigation Menu Components"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 48 - "Student Form Schema"
Cohesion: 0.29
Nodes (6): agamaOptions, pekerjaanOptions, SiswaForm, siswaSchema, FormSection(), FormSectionProps

### Community 49 - "Integrity & Hash Utilities"
Cohesion: 0.25
Nodes (6): details, existing, itemsByJenis, supabase, tahunBayar, totalAmount

### Community 50 - "Toggle Group Components"
Cohesion: 0.33
Nodes (5): ToggleGroup, ToggleGroupContext, ToggleGroupItem, Toggle, toggleVariants

### Community 51 - "Dashboard & Visualization"
Cohesion: 0.29
Nodes (4): COLORS, HARI_SINGKAT, STATUS_COLORS, STATUS_LABELS

### Community 52 - "Login Test Mocks"
Cohesion: 0.29
Nodes (5): eyeButton, mockNavigate, mockSignIn, passwordInput, toggleButtons

### Community 53 - "Multi-Lembaga Edge Function"
Cohesion: 0.40
Nodes (4): corsHeaders, departemen_id, nama, supabase

### Community 54 - "Supabase Project Config"
Cohesion: 0.40
Nodes (4): name, organization_id, organization_slug, ref

## Knowledge Gaps
- **564 isolated node(s):** `allowImportingTsExtensions`, `isolatedModules`, `jsx`, `lib`, `module` (+559 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `UI Utility Components` to `Academic Records & Scheduling`, `Financial Assets & Accounts`, `Routing & Navigation`, `Student Management`, `UI Notifications & Navigation`, `Balance Sheet Accounting`, `Fiscal Year & Billing`, `Toast Notification System`, `Academic Reference Settings`, `Login & Auth Forms`, `Financial Audit Logging`, `Student Billing Hooks`, `Data Export & Backup`, `Menubar Components`, `Support Portal`, `Chart Components`, `Command Palette UI`, `Context Menu Components`, `Sheet Drawer Components`, `Breadcrumb Navigation`, `Navigation Menu Components`, `Toggle Group Components`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `Button` connect `Financial Assets & Accounts` to `Academic Records & Scheduling`, `Academic Reports & Alumni`, `Routing & Navigation`, `Student Management`, `Account Ledger Hooks`, `UI Notifications & Navigation`, `Balance Sheet Accounting`, `Payment Period Management`, `Fiscal Year & Billing`, `Academic Reference Settings`, `Login & Auth Forms`, `Financial Audit Logging`, `Journal & Period Locking`, `Student Billing Hooks`, `Academic Calendar & Tariffs`, `Staff Statistics & Audit`, `Data Export & Backup`, `Support Portal`, `Student Form Schema`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `supabase` connect `Academic Records & Scheduling` to `Financial Assets & Accounts`, `Academic Reports & Alumni`, `Student Management`, `Account Ledger Hooks`, `UI Notifications & Navigation`, `Balance Sheet Accounting`, `Payment Period Management`, `Fiscal Year & Billing`, `Academic Reference Settings`, `Login & Auth Forms`, `Financial Audit Logging`, `Journal & Period Locking`, `Student Billing Hooks`, `Academic Calendar & Tariffs`, `Staff Statistics & Audit`, `Data Export & Backup`, `Support Portal`, `Auth Testing Utilities`, `Student Form Schema`, `Dashboard & Visualization`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `allowImportingTsExtensions`, `isolatedModules`, `jsx` to the rest of the system?**
  _567 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Academic Records & Scheduling` be split into smaller, more focused modules?**
  _Cohesion score 0.05680119581464873 - nodes in this community are weakly interconnected._
- **Should `Financial Assets & Accounts` be split into smaller, more focused modules?**
  _Cohesion score 0.061828952239911146 - nodes in this community are weakly interconnected._
- **Should `Academic Reports & Alumni` be split into smaller, more focused modules?**
  _Cohesion score 0.05974025974025974 - nodes in this community are weakly interconnected._