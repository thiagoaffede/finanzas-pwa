import { LayoutDashboard, ListOrdered, Briefcase, Target, Calculator, type LucideIcon } from "lucide-react";

export const NAV_ITEMS: { href: string; label: string; short: string; icon: LucideIcon }[] = [
  { href: "/", label: "Tablero", short: "Inicio", icon: LayoutDashboard },
  { href: "/movimientos", label: "Movimientos y servicios", short: "Movim.", icon: ListOrdered },
  { href: "/sueldo-alquiler", label: "Sueldo y alquiler", short: "Sueldo", icon: Briefcase },
  { href: "/planificacion", label: "Objetivos y planificación", short: "Planes", icon: Target },
  { href: "/calculadoras", label: "Calculadoras", short: "Calcular", icon: Calculator },
];
