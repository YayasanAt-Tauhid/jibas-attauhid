import { Link } from "react-router-dom";
import { ArrowLeft, Mail, MessageCircle, Clock, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const contacts = [
  {
    icon: Mail,
    label: "Email",
    value: "support@hijrah-attauhid.or.id",
    href: "mailto:support@hijrah-attauhid.or.id",
  },
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: "+62 812-0000-0000",
    href: "https://wa.me/6281200000000",
    cta: "Chat via WhatsApp",
  },
  {
    icon: Clock,
    label: "Jam Operasional",
    value: "Senin–Jumat, 08.00–17.00 WIB",
  },
  {
    icon: MapPin,
    label: "Catatan",
    value: "Untuk masalah mendesak, hubungi administrator sekolah Anda secara langsung.",
  },
];

const faqs = [
  {
    q: "Bagaimana cara login ke aplikasi?",
    a: "Gunakan email dan password yang diberikan oleh administrator sekolah Anda. Jika belum memiliki akun, hubungi admin sekolah untuk pendaftaran.",
  },
  {
    q: "Saya lupa password, apa yang harus dilakukan?",
    a: 'Klik "Lupa Password" di halaman login, masukkan email Anda, dan ikuti instruksi yang dikirimkan ke email tersebut.',
  },
  {
    q: "Bagaimana cara membayar tagihan SPP secara online?",
    a: 'Login ke Portal Orang Tua, pilih menu "Tagihan", pilih tagihan yang ingin dibayar, lalu klik "Bayar Sekarang". Anda dapat membayar via transfer bank, QRIS, atau dompet digital.',
  },
  {
    q: "Mengapa nilai anak saya belum muncul?",
    a: "Nilai akan muncul setelah guru memasukkan data penilaian. Jika sudah lewat jadwal pengumuman nilai namun belum muncul, hubungi wali kelas.",
  },
  {
    q: "Bagaimana cara melihat absensi anak saya?",
    a: 'Login ke Portal Orang Tua, pilih menu "Presensi" untuk melihat rekap kehadiran bulanan.',
  },
  {
    q: "Aplikasi tidak bisa dibuka, apa yang harus dilakukan?",
    a: "Pastikan koneksi internet Anda stabil. Coba refresh halaman atau bersihkan cache browser. Jika masalah berlanjut, hubungi kami via WhatsApp.",
  },
  {
    q: "Bagaimana cara memperbarui data profil siswa?",
    a: "Hubungi administrator sekolah untuk pembaruan data utama siswa. Orang tua tidak dapat mengubah data siswa secara langsung untuk keamanan data.",
  },
  {
    q: "Apakah data saya aman?",
    a: "Ya. Semua data dienkripsi dan disimpan di server aman. Kami tidak pernah membagikan data ke pihak ketiga selain yang disebutkan di Kebijakan Privasi.",
  },
];

export default function Support() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-lg">
            ?
          </div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Pusat Bantuan</h1>
          <p className="mt-2 text-sm text-muted-foreground">Kami siap membantu Anda</p>
          <Link
            to="/login"
            className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali ke halaman login
          </Link>
        </div>

        {/* Contact Cards */}
        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          {contacts.map((c) => (
            <Card key={c.label}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <c.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                  <p className="text-sm font-medium text-foreground break-words">{c.value}</p>
                  {c.cta && c.href && (
                    <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-xs">
                      <a href={c.href} target="_blank" rel="noopener noreferrer">
                        {c.cta}
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* FAQ */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Pertanyaan yang Sering Diajukan</h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-sm text-left">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Footer links */}
        <div className="mt-8 text-center space-y-2">
          <Link to="/privacy-policy" className="text-sm text-primary hover:underline">
            Kebijakan Privasi
          </Link>
          <p className="text-xs text-muted-foreground">Hijrah At-Tauhid v2.0</p>
        </div>
      </div>
    </div>
  );
}
