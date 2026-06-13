# WoW Train — Documentación completa

> Referencia técnica y de producto de la app. Generada el 2026-06-13.
> Repo app: `github.com/sebas2036/wow-trenes`

---

## 1. Identidad de la app

| Campo | Valor |
|---|---|
| Nombre | **WoW Train** |
| Slug | `wow-trenes` |
| Versión | `1.0.0` |
| Scheme (deep link) | `wowtrenes://` |
| Package Android | `com.wowtrenes.app` |
| Bundle iOS | `com.wowtrenes.app` |
| Color de marca (splash/brand) | `#320079` (violeta) |
| Dominio | **glosx.app** (landing + privacy policy) |
| Qué es | App para turistas: horarios de tren en vivo en Europa, guía GPS a la estación, compra de billetes (afiliados) y traductor de texto/voz. |

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | **Expo SDK 52** (managed) · React Native **0.76.9** · React 18.3.1 |
| Lenguaje | TypeScript (estricto, sin `noUnusedLocals`) |
| Navegación | `expo-router` v4 (file-based, `app/`) |
| Motor JS | Hermes |
| Animación | `react-native-reanimated` ~3.16 |
| Mapas | `react-native-maps` 1.18 (Google en Android, Apple en iOS) |
| DB local | `expo-sqlite` (GTFS por país) |
| Storage | `@react-native-async-storage/async-storage` |
| Notificaciones | `expo-notifications` + geofencing (`expo-location` + `expo-task-manager`) |
| Audio (voz) | `expo-av` (Google TTS) |
| Build/Deploy | **EAS** (projectId `3d3e709c-a745-40b6-a3f1-a359587b7e1c`, owner `sebasjasinsky`) |
| Testing | **Expo Go** sobre Android físico → arrancar con `npx expo start --go` (NO `--android`) |

---

## 3. Sistema de diseño

### 3.1 Tipografía
- **Familia:** `System` (San Francisco en iOS, Roboto en Android) — regular y bold.
- **Tamaños:** xs `11` · sm `13` · base `16` · md `18` · lg `22` · xl `28` · 2xl `36` · 3xl `48`
- **Pesos:** regular `400` · medium `500` · semibold `600` · bold `700` · heavy `800` · black `900`

### 3.2 Colores de marca (modo oscuro — el que usa la app)
| Token | Hex |
|---|---|
| brand.primary | `#8B5CF6` |
| brand.secondary | `#7C3AED` |
| brand.accent / glow | `#A78BFA` |
| text.brand | `#C4B5FD` |

(Modo claro: primary `#7C3AED`, accent `#5B21B6`.)

### 3.3 Fondos (dark)
| Token | Valor |
|---|---|
| bg.base | `#000000` |
| bg.surface / card | `#1C1C1E` |
| bg.elevated | `#2C2C2E` |
| bg.tabBar | `rgba(28,28,30,0.92)` |
| Fondo de pantalla (gradiente) | `#0E0E2E → #0A0820 → #06040F` |

### 3.4 Texto (dark)
| Token | Valor |
|---|---|
| text.primary | `#FFFFFF` |
| text.secondary | `rgba(235,235,245,0.60)` |
| text.muted | `rgba(235,235,245,0.30)` |

### 3.5 Bordes
subtle `rgba(255,255,255,0.05)` · default `0.09` · strong `0.18` · card `0.08`

### 3.6 Radios
sm `8` · md `12` · lg `16` · xl `20` · 2xl `28` · full `9999`

### 3.7 Gradientes
| Nombre | Colores |
|---|---|
| brand | `['#7C3AED', '#4F46E5']` |
| brandVertical (botones) | `['#8B5CF6', '#7C3AED', '#6D28D9']` |
| screenBg | `['#0E0E2E', '#0A0820', '#06040F']` |
| overlay hero (sobre la foto) | `['rgba(10,8,30,0.20)','rgba(14,14,46,0.45)','rgba(14,14,46,0.65)']` |

### 3.8 Sombras
- **glow** (botones/chips premium): color `#7C3AED`, opacity `0.35`, radius `16`, elevation `8`.
- card / glass: sombras suaves para tarjetas.

### 3.9 Patrón visual común
Todas las pantallas principales (Inicio, Salidas, Traductor, Ajustes) comparten:
**Imagen hero de fondo** (`assets/images/bg-hero.png`, ciudad/tren de noche) + **gradiente overlay** + tarjetas "glass" (`rgba(14,14,46,0.45-0.80)` con borde blanco translúcido) + botones con **degradé de marca + glow**.
Definido en `theme/index.ts`.

---

## 4. Pantallas (rutas en `app/`)

| Ruta | Archivo | Qué hace |
|---|---|---|
| `/` (Inicio) | `index.tsx` | Lista de países y ciudades-metro, detección GPS, acceso a Salidas/Internacional, tarjetas de afiliados. |
| `/salidas` | `salidas.tsx` | Tablero de próximas salidas de tu estación (GPS), en vivo, con botón Comprar. |
| `/split-screen` | `split-screen.tsx` | Tablero + mapa GPS guiando a la estación; modos a pie/bus/Uber; trenes escénicos. |
| `/traductor` | `traductor.tsx` | Traductor de **texto + voz universal** (10 idiomas, Google Translate + Google TTS). |
| `/buscar-viaje` | `buscar-viaje.tsx` | Búsqueda de horarios por origen/destino/fecha. |
| `/favoritos` | `favoritos.tsx` | Países marcados como favoritos. |
| `/ajustes` | `ajustes.tsx` | Toggles Notificaciones/Vibración (persistidos), idioma, links legales. |
| `/legal` | `legal.tsx` | FAQ, términos, privacidad (apunta a glosx.app/privacy-policy). |
| `/onboarding` | `onboarding.tsx` | Primera apertura. |
| `/ticket` | `ticket.tsx` | Ticket/QR de compra. |
| `_layout` | `_layout.tsx` | Root: providers (tema, notificaciones), Stack, init DB/geofence/settings. |

Navegación: las tabs (Inicio/Salidas/Traducir/Ajustes) usan `router.replace` (no apilan); el detalle usa `push`/`back`.

---

## 5. Datos en tiempo real (capa `services/*RealTime.ts`)

La app es **offline-first**: muestra el horario **programado** del GTFS local (SQLite) al instante, y en segundo plano lo **parchea** con el retraso en vivo. Si una fuente RT se cae/cuelga, degrada al programado y reintenta cada 60s. Todas las fuentes tienen **timeout** (`services/fetchWithTimeout.ts`).

| País | Fuente RT | Endpoint / nota |
|---|---|---|
| 🇪🇸 España | Renfe + Madrid CRTM + Barcelona TMB | `crtm.es/widgets/api`, `api.tmb.cat` |
| 🇫🇷 Francia | SNCF Navitia + IDFM (París) | `api.sncf.com`, `prim.iledefrance-mobilites.fr` |
| 🇮🇹 Italia | ViaggiaTreno (vía **proxy Railway**) | `viaggiatreno.it` proxeado |
| 🇩🇪 Alemania | DB | `app.services-bahn.de/mob` |
| 🇦🇹 Austria | ÖBB HAFAS | `fahrplan.oebb.at` |
| 🇧🇪 Bélgica | iRail | `api.irail.be` |
| 🇨🇭 Suiza | transport.opendata.ch | `transport.opendata.ch/v1` |
| 🇵🇹 Portugal | CP | `api.cp.pt/cp-api/siv` |
| 🇳🇱 Holanda | NS | requiere `NS_API_KEY` |

**Watchdog:** `scripts/verify_realtime.py` machea las fuentes por país (detecta keys vencidas).
GTFS: bases por país en `assets/gtfs_*.db` (Git LFS); FR/BE/AT se descargan lazy del Release `v1.0-databases`.

---

## 6. Datos estáticos (`app/index.tsx`, `data/`)

- **Países** (`COUNTRIES`): activos ES, FR, IT, DE, AT, NL, BE, PT, CH. Ocultos (sin datos reales): GB, NO, DK, US, JP.
- **Ciudades-metro** (`METRO_CITIES`): Madrid, Barcelona, París, Roma, Milán, Viena, Ámsterdam, Lisboa, Berlín, Múnich, Bruselas, etc.
- **Trenes escénicos** (`data/scenicTrains.ts`): 15 rutas (Glacier Express, Bernina, etc.).

---

## 7. Backend, dominio y túneles

| Componente | Detalle |
|---|---|
| **Backend (proxy)** | **Railway** → `https://voxa-production-dc15.up.railway.app` |
| · `/affiliate/redirect` | Redirige a Trainline/partner con el tag de afiliado (oculta credenciales). |
| · `/viaggiatreno/*` | Proxy HTTPS para ViaggiaTreno (Trenitalia, que es HTTP). |
| **Repo backend** | `github.com/sebas2036/voxa` (Node, deploy en Railway) |
| **Dominio** | **glosx.app** → landing del proyecto + `/privacy-policy` |
| **Repo landing** | `glosx-app` (GitHub Pages) |
| **Afiliados** | Partnerize (`prf.hn/click/camref:…`), Awin, TravelPayouts, Trainline. **Estado: pendiente de aprobación** (los tags están en `.env` con fallback demo). |

---

## 8. Cuentas y credenciales

> ⚠️ Los **valores** de las keys NO van en este doc ni en el repo: viven en `.env` (gitignored) y respaldados en `.env.enc` + gestor de contraseñas. Acá solo los **nombres de variables** y las cuentas.

### 8.1 Variables de entorno (`.env`)
```
EXPO_PUBLIC_GOOGLE_MAPS_KEY     → Google Maps SDK + Geocoding
EXPO_PUBLIC_PARTNERIZE_TAG      → tag afiliado Partnerize (camref)
EXPO_PUBLIC_TP_MARKER           → marker TravelPayouts
EXPO_PUBLIC_SNCF_API_KEY / _KEY → SNCF Navitia (Francia)
EXPO_PUBLIC_DB_API_KEY          → Deutsche Bahn (Alemania)
EXPO_PUBLIC_NS_API_KEY          → NS (Holanda)
EXPO_PUBLIC_IDFM_API_KEY        → Île-de-France Mobilités (París)
EXPO_PUBLIC_SWIFTLY_API_KEY     → Swiftly (transit)
EXPO_PUBLIC_AFFILIATE_PROXY     → URL del proxy Railway
TMB_APP_ID / TMB_APP_KEY        → TMB (metro Barcelona)
```

### 8.2 Cuentas
| Servicio | Cuenta / dato |
|---|---|
| **GitHub** | `sebas2036` (app, backend) |
| **Expo / EAS** | owner `sebasjasinsky` · projectId `3d3e709c-a745-40b6-a3f1-a359587b7e1c` |
| **Railway** | hosting del backend `voxa` |
| **Google Cloud** | (email a confirmar — candidatos: jasinskysebastian@gmail.com / sebasmza@hotmail.com / Glosx@outlook.com) |
| **Dominio glosx.app** | GitHub Pages |
| **Afiliados** | Partnerize / Awin / TravelPayouts (pendiente aprobación) |
| **Soporte** | Glosx@outlook.com |
| **Emails del dueño** | jasinskysebastian@gmail.com, sebasmza@hotmail.com |

### 8.3 Backup
- `scripts/backup-env.sh` → cifra `.env` → `.env.enc` (AES-256, passphrase). Guardar en nube privada.
- `scripts/restore-env.sh` → restaura.

---

## 9. Build / Deploy

- **Testing:** Expo Go (`npx expo start --go -c`). Maps/cámara nativos NO andan en Expo Go (placeholders).
- **Producción:** EAS Build (`eas build -p android`). La **Google Maps key** se inyecta desde `.env` vía `app.config.js` (NO hardcodeada).
- **SHA-1** (para restringir la Maps key): `npx eas credentials` → Android.

---

## 10. Pendientes conocidos (al 2026-06-13)

| Item | Estado |
|---|---|
| 🔴 Rotar Google Maps key | La key vieja quedó en git history → ROTAR + restringir (package + SHA-1) en Cloud Console. |
| 🟡 Campana/geofence de destino | No se registra (la compra es externa → `onPurchaseSuccess` no dispara). Resolver post-Partnerize. |
| 🟡 i18n del traductor | Textos en español hardcodeado (el resto de la app tiene 10 idiomas con `t()`). |
| 🟢 Afiliados | Tags placeholder hasta aprobación de Partnerize. |
| 🟢 console.log en prod | 28 logs de diagnóstico; opcional stripear en build de producción. |

---

*Documento mantenido manualmente. Ante cambios grandes (nueva pantalla, fuente RT, color de marca), actualizar las secciones correspondientes.*
