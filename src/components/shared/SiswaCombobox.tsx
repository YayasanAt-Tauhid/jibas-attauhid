import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cariSiswaRingkas } from "@/server/siswaRingkas";

export interface SiswaRingkas {
  id: string;
  nama: string;
  nis: string | null;
  departemen_id: string | null;
}

interface SiswaComboboxProps {
  value: SiswaRingkas | null;
  onChange: (siswa: SiswaRingkas | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

function useDebounced(value: string, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function SiswaCombobox({
  value,
  onChange,
  placeholder = "Cari nama atau NIS siswa...",
  disabled = false,
}: SiswaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const debounced = useDebounced(search.trim());
  const { data: results, isFetching } = useQuery({
    queryKey: ["siswa_search", debounced],
    enabled: open && debounced.length >= 2,
    queryFn: async () => {
      const hasil = await cariSiswaRingkas({ data: { search: debounced, limit: 20 } });
      return hasil.items as SiswaRingkas[];
    },
  });

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => setActiveIdx(0), [debounced]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const pick = (siswa: SiswaRingkas) => {
    onChange(siswa);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results?.length) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIdx]) pick(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-9 text-sm",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">
            {value ? `${value.nama} (${value.nis || "-"})` : placeholder}
          </span>
          {value ? (
            <span
              role="button"
              aria-label="Hapus pilihan siswa"
              className="ml-2 shrink-0 rounded-sm opacity-60 hover:opacity-100"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2 gap-2">
          {isFetching
            ? <Loader2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 animate-spin" />
            : <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik nama atau NIS..."
            className="h-7 border-0 p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div ref={listRef} className="max-h-60 overflow-y-auto">
          {debounced.length < 2 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ketik minimal 2 huruf untuk mencari.
            </p>
          ) : isFetching && !results ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Mencari…</p>
          ) : !results || results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Siswa tidak ditemukan.
            </p>
          ) : (
            results.map((siswa, idx) => (
              <button
                key={siswa.id}
                type="button"
                data-idx={idx}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => pick(siswa)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm cursor-pointer text-left",
                  idx === activeIdx && "bg-accent text-accent-foreground"
                )}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    value?.id === siswa.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{siswa.nama}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground shrink-0">
                  {siswa.nis || "-"}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
