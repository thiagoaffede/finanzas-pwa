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

1. Creá una base en [Neon](https://neon.tech) y pegá la URL en `DATABASE_URL` (`.env.local`, que no se sube al repo).
2. `npm run db:migrate` aplica las migraciones de `drizzle/`.
3. En la app, entrá a **Configuración** y cargá tu saldo, tu puesto, la escala de Comercio vigente y los índices (IPC/ICL).
   El contrato de alquiler se guarda desde **Sueldo y alquiler**.

### Publicar en Vercel

1. Importá el repo en Vercel.
2. En *Settings → Environment Variables* cargá:
   - `DATABASE_URL`: la URL de Neon.
   - `APP_PASSWORD`: la contraseña para entrar. **Sin ella la app queda abierta.**
   - `ANTHROPIC_API_KEY`: para leer boletas y recibos.
   - `AUTH_SECRET` (opcional): cualquier texto largo al azar.
3. El build (`vercel-build`) aplica las migraciones pendientes antes de compilar.

## Estructura

```
src/
├── app/(app)/              # Páginas (Tablero, Movimientos, Sueldo y alquiler, Planificación, Calculadoras, Configuración)
├── app/api/                # API (todas protegidas por el login)
├── app/login/              # Pantalla de ingreso
├── proxy.ts                # Pide sesión en páginas y API
├── components/             # ui/ (botones, cards, inputs), layout/, dashboard/, forms/, charts/
├── lib/
│   ├── finance/            # Lógica pura y testeada (ver docs/domain-rules.md)
│   ├── parsers/            # Normalización de boletas y recibos extraídos
│   ├── schemas/            # Validaciones Zod
│   ├── market/             # Cotizaciones del dólar con caché
│   ├── db/                 # Esquema Drizzle y conexión
│   ├── data/               # Repositorio (consultas) y contexto que alimenta las pantallas
│   ├── extraction/         # Lectura de PDFs/fotos con Claude
│   ├── auth.ts             # Sesión firmada por cookie
│   └── demo-data.ts        # Datos de ejemplo (solo sin base)
└── types/finance.ts
public/sw.js                # Service worker: caché offline del shell
drizzle/                    # Migraciones SQL
docs/                       # Reglas de negocio y esquemas de extracción
```

## Estado

- [x] **Fase 1** — PWA con UI clara, navegación (sidebar en compu, barra inferior en celu), manifest, service worker, esquema de base.
- [x] **Fase 2** — Núcleo financiero puro con tests: cuánto puedo gastar, Auxiliar C, alquiler, contado vs. cuotas, cashflow, anomalías, simulador, objetivos, historial de precios.
- [x] **Fase 3** — Lectura de boletas y recibos con Claude (con revisión antes de guardar), historial de cotizaciones en la base, configuración (supuestos, puesto, escalas, índices), pantallas conectadas a la base y login con contraseña.

## Seguridad y datos

Es una app de un solo usuario protegida por una contraseña (`APP_PASSWORD`). Las credenciales
van solo en `.env.local` o en las variables de Vercel, nunca en el repo.

Los montos se guardan en centavos enteros. Escalas, porcentajes de aportes e índices son
**valores de referencia** hasta que cargues los vigentes: ver `docs/domain-rules.md`.
