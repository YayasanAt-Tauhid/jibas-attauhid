import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface Akun {
  id: string;
  kode: string;
  nama: string;
}

interface AkunComboboxProps {
  value: string;
  onChange: (value: string) => void;
  akunList: Akun[];
  placeholder?: string;
  disabled?: boolean;
}

export function AkunCombobox({
  value,
  onChange,
  akunList,
  placeholder = "Pilih akun...",
  disabled = false,
}: AkunComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = akunList.find((a) => a.id === value);

  const filtered = akunList.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.kode.toLowerCase().includes(q) || a.nama.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

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
            !selected && "text-muted-foreground"
          )}
        >
          <span className="truncate">
            {selected ? `${selected.kode} - ${selected.nama}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode atau nama akun..."
            className="h-7 border-0 p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Akun tidak ditemukan.
            </p>
          ) : (
            filtered.map((akun) => (
              <button
                key={akun.id}
                type="button"
                onClick={() => {
                  onChange(akun.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                  value === akun.id && "bg-accent text-accent-foreground"
                )}
              >
                <Check
                  className={cn("h-3.5 w-3.5 shrink-0", value === akun.id ? "opacity-100" : "opacity-0")}
                />
                <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                  {akun.kode}
                </span>
                <span className="truncate">{akun.nama}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
