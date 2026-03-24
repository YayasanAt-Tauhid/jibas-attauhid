export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      angkatan: {
        Row: {
          aktif: boolean | null
          departemen_id: string | null
          id: string
          keterangan: string | null
          nama: string
        }
        Insert: {
          aktif?: boolean | null
          departemen_id?: string | null
          id?: string
          keterangan?: string | null
          nama: string
        }
        Update: {
          aktif?: boolean | null
          departemen_id?: string | null
          id?: string
          keterangan?: string | null
          nama?: string
        }
        Relationships: [
          {
            foreignKeyName: "angkatan_departemen_id_fkey"
            columns: ["departemen_id"]
            isOneToOne: false
            referencedRelation: "departemen"
            referencedColumns: ["id"]
          },
        ]
      }
      departemen: {
        Row: {
          aktif: boolean | null
          id: string
          keterangan: string | null
          kode: string | null
          nama: string
        }
        Insert: {
          aktif?: boolean | null
          id?: string
          keterangan?: string | null
          kode?: string | null
          nama: string
        }
        Update: {
          aktif?: boolean | null
          id?: string
          keterangan?: string | null
          kode?: string | null
          nama?: string
        }
        Relationships: []
      }
      jadwal: {
        Row: {
          hari: string | null
          id: string
          jam_mulai: string | null
          jam_selesai: string | null
          kelas_id: string | null
          mapel_id: string | null
          pegawai_id: string | null
          ruangan: string | null
          semester_id: string | null
          tahun_ajaran_id: string | null
        }
        Insert: {
          hari?: string | null
          id?: string
          jam_mulai?: string | null
          jam_selesai?: string | null
          kelas_id?: string | null
          mapel_id?: string | null
          pegawai_id?: string | null
          ruangan?: string | null
          semester_id?: string | null
          tahun_ajaran_id?: string | null
        }
        Update: {
          hari?: string | null
          id?: string
          jam_mulai?: string | null
          jam_selesai?: string | null
          kelas_id?: string | null
          mapel_id?: string | null
          pegawai_id?: string | null
          ruangan?: string | null
          semester_id?: string | null
          tahun_ajaran_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jadwal_kelas_id_fkey"
            columns: ["kelas_id"]
            isOneToOne: false
            referencedRelation: "kelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jadwal_mapel_id_fkey"
            columns: ["mapel_id"]
            isOneToOne: false
            referencedRelation: "mata_pelajaran"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jadwal_pegawai_id_fkey"
            columns: ["pegawai_id"]
            isOneToOne: false
            referencedRelation: "pegawai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jadwal_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semester"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jadwal_tahun_ajaran_id_fkey"
            columns: ["tahun_ajaran_id"]
            isOneToOne: false
            referencedRelation: "tahun_ajaran"
            referencedColumns: ["id"]
          },
        ]
      }
      jenis_pembayaran: {
        Row: {
          aktif: boolean | null
          id: string
          keterangan: string | null
          nama: string
          nominal: number | null
        }
        Insert: {
          aktif?: boolean | null
          id?: string
          keterangan?: string | null
          nama: string
          nominal?: number | null
        }
        Update: {
          aktif?: boolean | null
          id?: string
          keterangan?: string | null
          nama?: string
          nominal?: number | null
        }
        Relationships: []
      }
      kelas: {
        Row: {
          aktif: boolean | null
          departemen_id: string | null
          id: string
          kapasitas: number | null
          nama: string
          tingkat_id: string | null
          wali_kelas_id: string | null
        }
        Insert: {
          aktif?: boolean | null
          departemen_id?: string | null
          id?: string
          kapasitas?: number | null
          nama: string
          tingkat_id?: string | null
          wali_kelas_id?: string | null
        }
        Update: {
          aktif?: boolean | null
          departemen_id?: string | null
          id?: string
          kapasitas?: number | null
          nama?: string
          tingkat_id?: string | null
          wali_kelas_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_wali_kelas"
            columns: ["wali_kelas_id"]
            isOneToOne: false
            referencedRelation: "pegawai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kelas_departemen_id_fkey"
            columns: ["departemen_id"]
            isOneToOne: false
            referencedRelation: "departemen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kelas_tingkat_id_fkey"
            columns: ["tingkat_id"]
            isOneToOne: false
            referencedRelation: "tingkat"
            referencedColumns: ["id"]
          },
        ]
      }
      kelas_siswa: {
        Row: {
          aktif: boolean | null
          id: string
          kelas_id: string | null
          siswa_id: string | null
          tahun_ajaran_id: string | null
        }
        Insert: {
          aktif?: boolean | null
          id?: string
          kelas_id?: string | null
          siswa_id?: string | null
          tahun_ajaran_id?: string | null
        }
        Update: {
          aktif?: boolean | null
          id?: string
          kelas_id?: string | null
          siswa_id?: string | null
          tahun_ajaran_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kelas_siswa_kelas_id_fkey"
            columns: ["kelas_id"]
            isOneToOne: false
            referencedRelation: "kelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kelas_siswa_siswa_id_fkey"
            columns: ["siswa_id"]
            isOneToOne: false
            referencedRelation: "siswa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kelas_siswa_tahun_ajaran_id_fkey"
            columns: ["tahun_ajaran_id"]
            isOneToOne: false
            referencedRelation: "tahun_ajaran"
            referencedColumns: ["id"]
          },
        ]
      }
      mata_pelajaran: {
        Row: {
          aktif: boolean | null
          departemen_id: string | null
          id: string
          keterangan: string | null
          kode: string | null
          nama: string
          tingkat_id: string | null
        }
        Insert: {
          aktif?: boolean | null
          departemen_id?: string | null
          id?: string
          keterangan?: string | null
          kode?: string | null
          nama: string
          tingkat_id?: string | null
        }
        Update: {
          aktif?: boolean | null
          departemen_id?: string | null
          id?: string
          keterangan?: string | null
          kode?: string | null
          nama?: string
          tingkat_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mata_pelajaran_departemen_id_fkey"
            columns: ["departemen_id"]
            isOneToOne: false
            referencedRelation: "departemen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mata_pelajaran_tingkat_id_fkey"
            columns: ["tingkat_id"]
            isOneToOne: false
            referencedRelation: "tingkat"
            referencedColumns: ["id"]
          },
        ]
      }
      pegawai: {
        Row: {
          agama: string | null
          alamat: string | null
          created_at: string | null
          email: string | null
          foto_url: string | null
          id: string
          jabatan: string | null
          jenis_kelamin: string | null
          nama: string
          nip: string | null
          status: string | null
          tanggal_lahir: string | null
          telepon: string | null
          tempat_lahir: string | null
        }
        Insert: {
          agama?: string | null
          alamat?: string | null
          created_at?: string | null
          email?: string | null
          foto_url?: string | null
          id?: string
          jabatan?: string | null
          jenis_kelamin?: string | null
          nama: string
          nip?: string | null
          status?: string | null
          tanggal_lahir?: string | null
          telepon?: string | null
          tempat_lahir?: string | null
        }
        Update: {
          agama?: string | null
          alamat?: string | null
          created_at?: string | null
          email?: string | null
          foto_url?: string | null
          id?: string
          jabatan?: string | null
          jenis_kelamin?: string | null
          nama?: string
          nip?: string | null
          status?: string | null
          tanggal_lahir?: string | null
          telepon?: string | null
          tempat_lahir?: string | null
        }
        Relationships: []
      }
      pegawai_mapel: {
        Row: {
          id: string
          mapel_id: string | null
          pegawai_id: string | null
        }
        Insert: {
          id?: string
          mapel_id?: string | null
          pegawai_id?: string | null
        }
        Update: {
          id?: string
          mapel_id?: string | null
          pegawai_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pegawai_mapel_mapel_id_fkey"
            columns: ["mapel_id"]
            isOneToOne: false
            referencedRelation: "mata_pelajaran"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pegawai_mapel_pegawai_id_fkey"
            columns: ["pegawai_id"]
            isOneToOne: false
            referencedRelation: "pegawai"
            referencedColumns: ["id"]
          },
        ]
      }
      pembayaran: {
        Row: {
          bulan: number | null
          id: string
          jenis_id: string | null
          jumlah: number | null
          keterangan: string | null
          petugas_id: string | null
          siswa_id: string | null
          tahun_ajaran_id: string | null
          tanggal_bayar: string | null
        }
        Insert: {
          bulan?: number | null
          id?: string
          jenis_id?: string | null
          jumlah?: number | null
          keterangan?: string | null
          petugas_id?: string | null
          siswa_id?: string | null
          tahun_ajaran_id?: string | null
          tanggal_bayar?: string | null
        }
        Update: {
          bulan?: number | null
          id?: string
          jenis_id?: string | null
          jumlah?: number | null
          keterangan?: string | null
          petugas_id?: string | null
          siswa_id?: string | null
          tahun_ajaran_id?: string | null
          tanggal_bayar?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pembayaran_jenis_id_fkey"
            columns: ["jenis_id"]
            isOneToOne: false
            referencedRelation: "jenis_pembayaran"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pembayaran_petugas_id_fkey"
            columns: ["petugas_id"]
            isOneToOne: false
            referencedRelation: "pegawai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pembayaran_siswa_id_fkey"
            columns: ["siswa_id"]
            isOneToOne: false
            referencedRelation: "siswa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pembayaran_tahun_ajaran_id_fkey"
            columns: ["tahun_ajaran_id"]
            isOneToOne: false
            referencedRelation: "tahun_ajaran"
            referencedColumns: ["id"]
          },
        ]
      }
      penilaian: {
        Row: {
          id: string
          jenis_ujian: string | null
          kelas_id: string | null
          keterangan: string | null
          mapel_id: string | null
          nilai: number | null
          semester_id: string | null
          siswa_id: string | null
          tahun_ajaran_id: string | null
        }
        Insert: {
          id?: string
          jenis_ujian?: string | null
          kelas_id?: string | null
          keterangan?: string | null
          mapel_id?: string | null
          nilai?: number | null
          semester_id?: string | null
          siswa_id?: string | null
          tahun_ajaran_id?: string | null
        }
        Update: {
          id?: string
          jenis_ujian?: string | null
          kelas_id?: string | null
          keterangan?: string | null
          mapel_id?: string | null
          nilai?: number | null
          semester_id?: string | null
          siswa_id?: string | null
          tahun_ajaran_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "penilaian_kelas_id_fkey"
            columns: ["kelas_id"]
            isOneToOne: false
            referencedRelation: "kelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penilaian_mapel_id_fkey"
            columns: ["mapel_id"]
            isOneToOne: false
            referencedRelation: "mata_pelajaran"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penilaian_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semester"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penilaian_siswa_id_fkey"
            columns: ["siswa_id"]
            isOneToOne: false
            referencedRelation: "siswa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penilaian_tahun_ajaran_id_fkey"
            columns: ["tahun_ajaran_id"]
            isOneToOne: false
            referencedRelation: "tahun_ajaran"
            referencedColumns: ["id"]
          },
        ]
      }
      presensi_siswa: {
        Row: {
          id: string
          kelas_id: string | null
          keterangan: string | null
          pegawai_id: string | null
          semester_id: string | null
          siswa_id: string | null
          status: string | null
          tahun_ajaran_id: string | null
          tanggal: string
        }
        Insert: {
          id?: string
          kelas_id?: string | null
          keterangan?: string | null
          pegawai_id?: string | null
          semester_id?: string | null
          siswa_id?: string | null
          status?: string | null
          tahun_ajaran_id?: string | null
          tanggal: string
        }
        Update: {
          id?: string
          kelas_id?: string | null
          keterangan?: string | null
          pegawai_id?: string | null
          semester_id?: string | null
          siswa_id?: string | null
          status?: string | null
          tahun_ajaran_id?: string | null
          tanggal?: string
        }
        Relationships: [
          {
            foreignKeyName: "presensi_siswa_kelas_id_fkey"
            columns: ["kelas_id"]
            isOneToOne: false
            referencedRelation: "kelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presensi_siswa_pegawai_id_fkey"
            columns: ["pegawai_id"]
            isOneToOne: false
            referencedRelation: "pegawai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presensi_siswa_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semester"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presensi_siswa_siswa_id_fkey"
            columns: ["siswa_id"]
            isOneToOne: false
            referencedRelation: "siswa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presensi_siswa_tahun_ajaran_id_fkey"
            columns: ["tahun_ajaran_id"]
            isOneToOne: false
            referencedRelation: "tahun_ajaran"
            referencedColumns: ["id"]
          },
        ]
      }
      sekolah: {
        Row: {
          akreditasi: string | null
          alamat: string | null
          email: string | null
          id: string
          kepala_sekolah: string | null
          kota: string | null
          logo_url: string | null
          nama: string | null
          npsn: string | null
          telepon: string | null
        }
        Insert: {
          akreditasi?: string | null
          alamat?: string | null
          email?: string | null
          id?: string
          kepala_sekolah?: string | null
          kota?: string | null
          logo_url?: string | null
          nama?: string | null
          npsn?: string | null
          telepon?: string | null
        }
        Update: {
          akreditasi?: string | null
          alamat?: string | null
          email?: string | null
          id?: string
          kepala_sekolah?: string | null
          kota?: string | null
          logo_url?: string | null
          nama?: string | null
          npsn?: string | null
          telepon?: string | null
        }
        Relationships: []
      }
      semester: {
        Row: {
          aktif: boolean | null
          id: string
          nama: string | null
          tahun_ajaran_id: string | null
          urutan: number | null
        }
        Insert: {
          aktif?: boolean | null
          id?: string
          nama?: string | null
          tahun_ajaran_id?: string | null
          urutan?: number | null
        }
        Update: {
          aktif?: boolean | null
          id?: string
          nama?: string | null
          tahun_ajaran_id?: string | null
          urutan?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "semester_tahun_ajaran_id_fkey"
            columns: ["tahun_ajaran_id"]
            isOneToOne: false
            referencedRelation: "tahun_ajaran"
            referencedColumns: ["id"]
          },
        ]
      }
      siswa: {
        Row: {
          agama: string | null
          alamat: string | null
          angkatan_id: string | null
          created_at: string | null
          email: string | null
          foto_url: string | null
          id: string
          jenis_kelamin: string | null
          nama: string
          nis: string | null
          status: string | null
          tanggal_lahir: string | null
          telepon: string | null
          tempat_lahir: string | null
        }
        Insert: {
          agama?: string | null
          alamat?: string | null
          angkatan_id?: string | null
          created_at?: string | null
          email?: string | null
          foto_url?: string | null
          id?: string
          jenis_kelamin?: string | null
          nama: string
          nis?: string | null
          status?: string | null
          tanggal_lahir?: string | null
          telepon?: string | null
          tempat_lahir?: string | null
        }
        Update: {
          agama?: string | null
          alamat?: string | null
          angkatan_id?: string | null
          created_at?: string | null
          email?: string | null
          foto_url?: string | null
          id?: string
          jenis_kelamin?: string | null
          nama?: string
          nis?: string | null
          status?: string | null
          tanggal_lahir?: string | null
          telepon?: string | null
          tempat_lahir?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siswa_angkatan_id_fkey"
            columns: ["angkatan_id"]
            isOneToOne: false
            referencedRelation: "angkatan"
            referencedColumns: ["id"]
          },
        ]
      }
      siswa_detail: {
        Row: {
          alamat_ortu: string | null
          id: string
          nama_ayah: string | null
          nama_ibu: string | null
          pekerjaan_ayah: string | null
          pekerjaan_ibu: string | null
          siswa_id: string | null
          telepon_ortu: string | null
        }
        Insert: {
          alamat_ortu?: string | null
          id?: string
          nama_ayah?: string | null
          nama_ibu?: string | null
          pekerjaan_ayah?: string | null
          pekerjaan_ibu?: string | null
          siswa_id?: string | null
          telepon_ortu?: string | null
        }
        Update: {
          alamat_ortu?: string | null
          id?: string
          nama_ayah?: string | null
          nama_ibu?: string | null
          pekerjaan_ayah?: string | null
          pekerjaan_ibu?: string | null
          siswa_id?: string | null
          telepon_ortu?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siswa_detail_siswa_id_fkey"
            columns: ["siswa_id"]
            isOneToOne: false
            referencedRelation: "siswa"
            referencedColumns: ["id"]
          },
        ]
      }
      tahun_ajaran: {
        Row: {
          aktif: boolean | null
          id: string
          keterangan: string | null
          nama: string
          tanggal_mulai: string | null
          tanggal_selesai: string | null
        }
        Insert: {
          aktif?: boolean | null
          id?: string
          keterangan?: string | null
          nama: string
          tanggal_mulai?: string | null
          tanggal_selesai?: string | null
        }
        Update: {
          aktif?: boolean | null
          id?: string
          keterangan?: string | null
          nama?: string
          tanggal_mulai?: string | null
          tanggal_selesai?: string | null
        }
        Relationships: []
      }
      tingkat: {
        Row: {
          aktif: boolean | null
          departemen_id: string | null
          id: string
          nama: string
          urutan: number | null
        }
        Insert: {
          aktif?: boolean | null
          departemen_id?: string | null
          id?: string
          nama: string
          urutan?: number | null
        }
        Update: {
          aktif?: boolean | null
          departemen_id?: string | null
          id?: string
          nama?: string
          urutan?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tingkat_departemen_id_fkey"
            columns: ["departemen_id"]
            isOneToOne: false
            referencedRelation: "departemen"
            referencedColumns: ["id"]
          },
        ]
      }
      users_profile: {
        Row: {
          aktif: boolean | null
          created_at: string | null
          email: string | null
          id: string
          pegawai_id: string | null
          role: string | null
          siswa_id: string | null
        }
        Insert: {
          aktif?: boolean | null
          created_at?: string | null
          email?: string | null
          id: string
          pegawai_id?: string | null
          role?: string | null
          siswa_id?: string | null
        }
        Update: {
          aktif?: boolean | null
          created_at?: string | null
          email?: string | null
          id?: string
          pegawai_id?: string | null
          role?: string | null
          siswa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_profile_pegawai_id_fkey"
            columns: ["pegawai_id"]
            isOneToOne: false
            referencedRelation: "pegawai"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_profile_siswa_id_fkey"
            columns: ["siswa_id"]
            isOneToOne: false
            referencedRelation: "siswa"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      is_admin_or_kepala: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
