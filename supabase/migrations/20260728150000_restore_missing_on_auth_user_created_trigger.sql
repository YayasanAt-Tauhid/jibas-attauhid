-- ─────────────────────────────────────────────────────────────────────────────
-- Perbaikan bug: "Tambah Pengguna" tidak muncul di halaman /pengaturan/pengguna
--
-- Root cause (ditemukan lewat MCP Supabase di project live cmvzcpeiuompqgdvflky):
-- trigger `on_auth_user_created` pada `auth.users` HILANG dari database live --
-- fungsinya (`handle_new_user`) tetap ada, tapi tidak ada trigger yang
-- memanggilnya. Akibatnya setiap akun baru (lewat `adminCreateUser` maupun
-- signup biasa) hanya membuat baris di `auth.users`, TANPA baris pendamping
-- di `public.users_profile`. `adminCreateUser` lalu melakukan
-- `.update().eq("id", newId)` pada `users_profile` yang berasumsi baris itu
-- sudah dibuat trigger -- update pada baris yang tidak ada tidak
-- menghasilkan error di Supabase JS (0 rows affected, tidak dianggap gagal),
-- jadi server function tetap sukses & toast "akun berhasil dibuat" muncul,
-- padahal tidak ada baris users_profile sama sekali untuk user itu. Halaman
-- Manajemen Pengguna hanya menampilkan data dari `users_profile`, jadi akun
-- baru itu tidak pernah terlihat di tabel.
--
-- Ditemukan 7 akun di `auth.users` project live yang tidak punya pasangan di
-- `users_profile` (termasuk akun uji coba admin saat melaporkan bug ini).
-- Sudah di-backfill langsung di project live lewat MCP; migrasi ini
-- mereplikasi perbaikan yang sama supaya project lain (staging/local) yang
-- migrasinya dijalankan dari awal juga punya trigger ini.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill idempoten: baris users_profile untuk akun auth.users yang
-- terlanjur dibuat sebelum trigger ini ada.
INSERT INTO public.users_profile (id, email, role)
SELECT u.id, u.email, 'siswa'
FROM auth.users u
LEFT JOIN public.users_profile p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
