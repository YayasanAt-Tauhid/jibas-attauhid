import { ReactNode } from "react";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; label?: string };
  color?: "primary" | "success" | "warning" | "destructive" | "info";
  onClick?: () => void;
  active?: boolean;
}

const colorMap = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export function StatsCard({ title, value, icon: Icon, trend, color = "primary", onClick, active }: StatsCardProps) {
  return (
    <Card
      className={`hover:shadow-md transition-shadow ${onClick ? "cursor-pointer" : ""} ${active ? "ring-2 ring-warning" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 text-xs">
                {trend.value > 0 ? (
                  <TrendingUp className="h-3 w-3 text-success" />
                ) : trend.value < 0 ? (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                ) : (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={trend.value > 0 ? "text-success" : trend.value < 0 ? "text-destructive" : "text-muted-foreground"}>
                  {trend.value > 0 ? "+" : ""}{trend.value}%
                </span>
                {trend.label && <span className="text-muted-foreground">{trend.label}</span>}
              </div>
            )}
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colorMap[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
