# WoW TRENES — Contexto para Claude

## Qué es este proyecto

App Expo (React Native + TypeScript) de horarios de trenes y metro en Europa y ciudades de EE.UU.
El usuario la usa como asistente de viaje personal: GPS detecta el país/ciudad y muestra el tablero de salidas sin tocar nada.

**Stack:**
- Expo Router (file-based routing, carpeta `app/`)
- SQLite local con bases GTFS (`assets/gtfs_*.db`) — consultas directas sin servidor
- Servicios real-time por país (`services/*RealTime.ts`)
- `services/gtfsDatabase.ts` — función central `getCountryBoard` y `getCountryBoardGTFS` (fallback genérico para todos los países)
- `services/dbDownloadService.ts` — descarga lazy de DBs grandes (FR, BE, AT)
- `components/DownloadProgressBar.tsx` — barra de progreso de descarga

**Pantallas principales:**
- `app/index.tsx` — Home, selector de país, tarjetas de destinos
- `app/salidas.tsx` — Tablero tipo estación: GPS → detecta país/estación → muestra salidas
- `app/buscar-viaje.tsx` — Búsqueda de viaje origen→destino
- `app/split-screen.tsx` — Split screen

---

## Arquitectura clave

### Países con DB lazy (no están en el bundle)
`FR`, `BE`, `AT` — se descargan al primer uso con `downloadDb()` y `isDbReady()`.

### Función genérica de tablero
`getCountryBoardGTFS(stationId, country, date, time)` en `services/gtfsDatabase.ts` es el fallback genérico que usan todos los países. Devuelve `BoardEntry[]`.

### BoardEntry
```ts
{
  time: string       // hora de salida "HH:MM"
  train: string      // tipo de tren (AVE, ICE, TGV...)
  endpoint: string   // destino FINAL del tren (no la estación de origen)
  platform: string   // vía/andén
  status: string     // estado (en hora, retrasado...)
  station: string    // nombre de la estación actual
}
```

### GPS y detección de país
`useLocation` → coords → `detectCountryFromCoords` → `findNearestStation` → `loadBoard`.
Timeout global de 12s: si el GPS no responde, cae a España por defecto y muestra el tablero.

---

## Historial de fixes recientes (últimas 48hs)

### Fix crítico: destino final del tren
**Problema:** El tablero mostraba la estación de ORIGEN (ej. "Madrid Puerta de Atocha") como destino en vez del destino real del tren (ej. "Sevilla-Santa Justa").

**Causa raíz:** La query SQL en `getCountryBoardGTFS` usaba `COALESCE(t.trip_headsign, ...)` pero muchos trips no tienen `trip_headsign` → caía a vacío → el campo `endpoint` mostraba el `train` (tipo).

**Fix aplicado:** La query ahora hace un subquery para obtener el `stop_name` de la última parada del viaje (`MAX(stop_sequence)`):
```sql
LEFT JOIN stop_times dest_st ON dest_st.trip_id = st.trip_id
  AND dest_st.stop_sequence = (
    SELECT MAX(s2.stop_sequence) FROM stop_times s2 WHERE s2.trip_id = st.trip_id
  )
LEFT JOIN stops dest_s ON dest_s.stop_id = dest_st.stop_id
```
Y en el SELECT usa `dest_s.stop_name` directamente como destino final.

**Cobertura:** Todos los países que usan `getCountryBoardGTFS` (España, Francia, Italia, Alemania, Austria, Bélgica, Países Bajos, Portugal, Suiza).

### Fix: GROUP BY inválido en SQLite
`GROUP BY MIN(departure_time)` — SQLite no permite funciones de agregado en GROUP BY. Corregido a `GROUP BY departure_time`.

### Fix: GPS no respondía / pantalla colgada
Timeout global de 12s que cubre todo el flujo incluyendo `requestForegroundPermissionsAsync()`. Si expira → `gpsStatus = 'notfound'` → carga tablero de España.

### Fix: deduplicar salidas
Salidas duplicadas por múltiples stop_times del mismo trip → resuelto con `LEFT JOIN` a subquery agrupada.

---

## Convenciones

- Comentarios en español
- No agregar features fuera del scope pedido
- Antes de editar SQL, verificar con `sqlite3 assets/gtfs_*.db "..."` que la query devuelve lo esperado
- Siempre pushear con `git push` después de cada fix confirmado

---

## Tarea en curso / próximo paso

> Actualizar esta sección al inicio de cada sesión con lo que se está trabajando.

**Último estado conocido (2026-06-04) — sesión 3 (monetización):**

Sistema afiliado multi-red implementado:
- Proxy Railway `backend/src/routes/affiliate.ts` con soporte simultáneo Awin + TravelPayouts
- `resolveAffiliateUrl()` con prioridad configurable y fallback automático
- Variable `AFFILIATE_PREFERRED='awin'` (default) — cuando Awin apruebe, switch automático
- Marker TravelPayouts `534570` activo en Railway (proyecto **intelligent-forgiveness**, servicio `voxa`)

Endpoints del proxy:
- `/affiliate/redirect` — trenes Europa → Omio, Asia → Trip.com
- `/affiliate/scenic` — trenes escénicos → Trainline (mejor inventario)
- `/affiliate/klook` — City Cards y experiencias (2-5%)
- `/affiliate/kiwitaxi` — transfers aeropuerto (9-11%)
- `/affiliate/yesim` — eSIM internacional (18%)
- `/affiliate/health` — estado de redes configuradas

Frontend integraciones:
- `services/affiliateEngine.ts` con `buildScenicTrainUrl`, `buildKlookUrl`, `buildKiwitaxiUrl`, `buildYesimUrl`
- `components/PartnerCard.tsx` — componente reutilizable de upsell con gradiente
- `data/partnerOffers.ts` — catálogo de ofertas por ciudad (Madrid, Barcelona, París, Roma, London, Berlin)
- `app/index.tsx` muestra eSIM Yesim en pestaña Internacional
- `app/split-screen.tsx` muestra City Card + Transfer según ciudad detectada

Estado afiliados:
- **Awin** — application received, esperando aprobación (3-5 días) — email `glosx@outlook.com`
- **TravelPayouts/Glosx** — marker 534570 activo, Klook/Kiwitaxi/Yesim auto-conectados
- **TravelPayouts/Mobile app** — requiere app publicada en Play Store para Omio
- Cuando Awin apruebe, agregar 3 variables en Railway: `AWIN_PUBLISHER_ID`, `AWIN_TRAINLINE_MID`, `AWIN_OMIO_MID`

Setup Railway CLI:
- Logueado como `sebasmza@hotmail.com`
- Proyecto activo del proxy: **intelligent-forgiveness** → service `voxa` → URL `voxa-production-dc15.up.railway.app`
- Existe otro proyecto **powerful-consideration** (sin uso, glosx.app va a GitHub Pages)

Próximos pasos:
- Esperar email de Awin → configurar 3 variables Railway → switch automático a Awin
- Publicar app en Google Play Internal Testing para destrabar Omio en TravelPayouts
- Autocompletar "Ciudad de origen" en Internacional con ciudad GPS
