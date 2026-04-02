import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const sections = [
  {
    title: "1. Pendahuluan",
    content:
      "Hijrah At-Tauhid adalah sistem manajemen sekolah Islam yang dikembangkan untuk membantu lembaga pendidikan dalam mengelola data akademik, keuangan, dan kepegawaian. Kami berkomitmen untuk melindungi privasi seluruh pengguna.",
  },
  {
    title: "2. Data yang Kami Kumpulkan",
    list: [
      "Data Identitas: nama lengkap, email, nomor telepon",
      "Data Pendidikan: data siswa, nilai, presensi, jadwal",
      "Data Keuangan: tagihan, riwayat pembayaran (tidak menyimpan detail kartu)",
      "Data Kepegawaian: profil guru dan staf sekolah",
      "Data Teknis: log aktivitas, informasi perangkat",
    ],
  },
  {
    title: "3. Cara Kami Menggunakan Data",
    list: [
      "Menjalankan fungsi sistem manajemen sekolah",
      "Mengirimkan notifikasi tagihan dan informasi akademik",
      "Menghasilkan laporan keuangan dan akademik",
      "Meningkatkan kualitas layanan",
    ],
  },
  {
    title: "4. Pihak Ketiga yang Terlibat",
    list: [
      "Supabase (supabase.com): penyedia database dan autentikasi — data disimpan di server terenkripsi",
      "Midtrans (midtrans.com): pemrosesan pembayaran online — tunduk pada kebijakan privasi Midtrans",
      "Kami tidak menjual data pengguna kepada pihak ketiga manapun",
    ],
  },
  {
    title: "5. Keamanan Data",
    list: [
      "Seluruh transmisi data menggunakan enkripsi HTTPS/TLS",
      "Autentikasi menggunakan sistem Supabase Auth yang aman",
      "Akses data dibatasi berdasarkan peran pengguna (Role-Based Access Control)",
    ],
  },
  {
    title: "6. Hak Pengguna",
    list: [
      "Hak akses: meminta salinan data pribadi Anda",
      "Hak koreksi: memperbarui data yang tidak akurat",
      "Hak penghapusan: meminta penghapusan akun dan data terkait",
      "Untuk menggunakan hak ini, hubungi administrator sekolah atau email kami",
    ],
  },
  {
    title: "7. Penyimpanan Data",
    content:
      "Data disimpan selama akun aktif. Setelah penghapusan akun, data akan dihapus dalam 30 hari kecuali diwajibkan oleh peraturan perundang-undangan.",
  },
  {
    title: "8. Perubahan Kebijakan",
    content:
      "Kami dapat memperbarui kebijakan ini sewaktu-waktu. Pengguna akan diberitahu melalui notifikasi dalam aplikasi.",
  },
  {
    title: "9. Hubungi Kami",
    content:
      "Email: admin@hijrah-attauhid.or.id\nWhatsApp: +62 822-8114-2343\nAlamat: Jerambah Gantung, Jl. Jebung Dalam, RT.005/RW.05, Kec. Gabek, Kota Pangkal Pinang, Kepulauan Bangka Belitung 33116",
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-lg">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Kebijakan Privasi</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Berlaku sejak 1 April 2026
          </p>
          <Link
            to="/login"
            className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali ke halaman login
          </Link>
        </div>

        {/* Content */}
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-6">
            {sections.map((s) => (
              <section key={s.title}>
                <h2 className="text-lg font-semibold text-foreground mb-2">{s.title}</h2>
                {s.content && (
                  <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                    {s.content}
                  </p>
                )}
                {s.list && (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    {s.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Hijrah At-Tauhid — Sistem Manajemen Sekolah
        </p>
      </div>
    </div>
  );
}
