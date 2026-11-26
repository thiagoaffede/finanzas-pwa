import { GraduationCap, BarChart3, DatabaseBackup, LayoutDashboard, ListOrdered, Briefcase, Target, Calculator, Settings, PiggyBank, MoreHorizontal, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Aparece en la barra de abajo del celu (el resto, en "Más"). */
  bottom?: boolean;
  /** Descripción para la página "Más". */
  hint?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Tablero", short: "Inicio", icon: LayoutDashboard, bottom: true },
  { href: "/movimientos", label: "Movimientos y servicios", short: "Movim.", icon: ListOrdered, bottom: true },
  { href: "/presupuesto", label: "Presupuesto y vencimientos", short: "Presup.", icon: PiggyBank, bottom: true },
  { href: "/planificacion", label: "Objetivos y planificación", short: "Planes", icon: Target, bottom: true },
  { href: "/estudio", label: "Estudio", short: "Estudio", icon: GraduationCap, hint: "Tus ATI: temas, ritmo hasta el examen, fechas y pomodoro" },
  { href: "/reporte", label: "Reporte mensual", short: "Reporte", icon: BarChart3, hint: "Ingresos, gastos e inflación: cuánto te rinde la plata" },
  { href: "/sueldo-alquiler", label: "Sueldo y alquiler", short: "Sueldo", icon: Briefcase, hint: "Recibos, historial de sueldos y ajuste del alquiler" },
  { href: "/calculadoras", label: "Calculadoras", short: "Calcular", icon: Calculator, hint: "Cuotas vs. contado, plazo fijo y más" },
  { href: "/backup", label: "Backup y exportar", short: "Backup", icon: DatabaseBackup, hint: "Bajar una copia, restaurarla o exportar a Excel" },
];

/** Solo en la barra lateral (en el celu se llega desde el ícono del encabezado o desde "Más"). */
export const SETTINGS_ITEM: NavItem = { href: "/configuracion", label: "Configuración", short: "Ajustes", icon: Settings, hint: "Sueldo, avisos, escalas e índices" };

export const MORE_ITEM: NavItem = { href: "/mas", label: "Más", short: "Más", icon: MoreHorizontal };
