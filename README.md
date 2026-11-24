# Mis Finanzas · PWA de finanzas personales

App personal para saber **cuánto puedo gastar**, ver **vencimientos** (EDES, Camuzzi, BVC, Personal,
tarjeta, alquiler), **estimar el sueldo** por convenio de Empleados de Comercio, calcular el
**aumento del alquiler** (ICL / IPC / fijo), comparar **contado vs. cuotas** con inflación,
proyectar el **flujo de caja** a 6 meses y simular escenarios. Se instala en el celu y en la
compu como app.

**Stack:** Next.js (App Router) + TypeScript · Tailwind CSS v4 + componentes estilo shadcn/ui ·
Recharts · Drizzle ORM + PostgreSQL (Neon) · Zod · Vitest.

## Empezar

```bash
npm install
cp .env.example .env.local   # opcional: sin DATABASE_URL la app usa datos de ejemplo
npm run dev                  # http://localhost:3000
npm test                     # tests de la lógica financiera
```

### Base de datos (Neon)

1. Creá una base en [Neon](https://neon.tech) y pegá la URL en `DATABASE_URL` (`.env.local`).
2. `npm run db:migrate` aplica `drizzle/0000_init.sql`.
3. Cargá la escala de Comercio vigente (`payroll_scales`) y los índices (`index_values`).

## Estructura

```
src/
├── app/                    # Páginas (Tablero, Movimientos, Sueldo y alquiler, Planificación, Calculadoras) y API
├── components/             # ui/ (botones, cards, inputs), layout/, dashboard/, forms/, charts/
├── lib/
│   ├── finance/            # Lógica pura y testeada (ver docs/domain-rules.md)
│   ├── parsers/            # Normalización de boletas y recibos extraídos
│   ├── schemas/            # Validaciones Zod
│   ├── market/             # Cotizaciones del dólar con caché
│   ├── db/                 # Esquema Drizzle y conexión
│   └── demo-data.ts        # Datos de ejemplo (se reemplazan al conectar la base)
└── types/finance.ts
public/sw.js                # Service worker: caché offline del shell
drizzle/                    # Migraciones SQL
docs/                       # Reglas de negocio y esquemas de extracción
```

## Estado

- [x] **Fase 1** — PWA con UI clara, navegación (sidebar en compu, barra inferior en celu), manifest, service worker, esquema de base.
- [x] **Fase 2** — Núcleo financiero puro con tests: cuánto puedo gastar, Auxiliar C, alquiler, contado vs. cuotas, cashflow, anomalías, simulador, objetivos, historial de precios.
- [ ] **Fase 3** — Lectura de boletas y recibos con LLM, historial de cotizaciones en la base, carga de escalas e índices desde la UI, pantallas conectadas a la base.

## Antes de publicarla

Es una app de un solo usuario y **todavía no tiene login**. Antes de desplegarla en una URL
pública (por ejemplo Vercel) hay que agregar autenticación o, como mínimo, protección por
contraseña.

Los montos se guardan en centavos enteros. Escalas, porcentajes de aportes e índices son
**valores de referencia** hasta que cargues los vigentes: ver `docs/domain-rules.md`.
