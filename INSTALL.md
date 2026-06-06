# WoW Train — Setup & Install Guide

## 1. Prerequisites
- Node.js ≥ 20
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- Xcode 15+ (iOS) / Android Studio Flamingo+ (Android)

## 2. Install dependencies

```bash
cd "WoW Train"
npm install
```

Then install native Expo modules:

```bash
npx expo install \
  react-native-maps \
  expo-location \
  expo-brightness \
  expo-task-manager \
  expo-notifications \
  expo-secure-store \
  expo-sqlite \
  expo-crypto \
  expo-file-system \
  expo-keep-awake \
  expo-web-browser \
  expo-linear-gradient \
  expo-blur \
  expo-haptics \
  @expo/vector-icons \
  react-native-webview \
  react-native-qrcode-svg \
  react-native-svg \
  @gorhom/bottom-sheet \
  react-native-reanimated \
  react-native-gesture-handler \
  react-native-safe-area-context \
  react-native-screens
```

Also install babel path resolver:
```bash
npm install --save-dev babel-plugin-module-resolver
```

## 3. Configure environment

```bash
cp .env.example .env.local
# Fill in your API keys in .env.local
```

## 4. Run (development)

```bash
npx expo start
# Press 'i' for iOS simulator, 'a' for Android emulator
```

## 5. Production build (EAS)

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

## 6. GTFS Data — Base de datos estática offline

Todos los feeds GTFS se convierten a SQLite y se empaquetan en `assets/`.
La app los copia al sistema de archivos del dispositivo en el primer acceso.

### Datos ya importados (listos en assets/)
| País | DB | Fuente | Estaciones |
|------|----|--------|------------|
| Suiza | gtfs_switzerland.db | SBB Open Data | 905 |
| Francia | gtfs_france.db | SNCF Open Data | 1.864 |
| España | gtfs_spain.db | Renfe / ADIF | 1.017 |
| Alemania | gtfs_germany.db | DB Fernverkehr | 620 |
| Italia | gtfs_italy.db | Trenord + Toscana | 822 |
| Países Bajos | gtfs_netherlands.db | openov.nl (CC0) | 1.156 |
| Austria | gtfs_austria.db | ÖBB open GTFS | 2.169 |
| USA (Amtrak) | gtfs_usa.db | content.amtrak.com | 534 |
| NYC (MTA) | gtfs_usa_nyc.db | MTA Developers | 511 |

### Placeholders (ejecutar scripts para importar datos reales)

**Países / metros pendientes:**
```bash
# Bélgica (SNCB via iRail)
# Descargar: https://gtfs.irail.be/nmbs/gtfs/latest.zip → ~/Downloads/Wow trains Belgium/
python3 scripts/import_gtfs_be.py

# Noruega (Entur feed nacional)
# Descargar: https://storage.googleapis.com/marduk-production/outbound/gtfs/rb_norway-aggregated-gtfs.zip
# → ~/Downloads/Wow trains Norway/
python3 scripts/import_gtfs_no.py

# Portugal (CP — datos no públicos, placeholder permanente)
# Alternativa: Transporlis con registro en https://www.transporlis.pt/
```

### Metros urbanos — SETUP ÚNICO

Primero crear los placeholder DBs (15 estaciones seed por ciudad):
```bash
python3 scripts/create_metro_placeholders.py
```

Esto genera los archivos en `assets/`. Luego descomentar las líneas correspondientes
en `services/gtfsDatabase.ts` (buscar "# Descomentar las líneas de abajo").

Luego importar datos reales de cada ciudad:

```bash
# Madrid Metro (Comunidad de Madrid — free)
# Descargar: https://datos.comunidad.madrid/catalogo/dataset/gtfs_metro_madrid
# → ~/Downloads/Madrid Metro/
python3 scripts/import_gtfs_es_mad.py

# Barcelona Metro TMB (requiere API key gratuita)
# Registrarse en: https://developer.tmb.cat/
# Alternativa sin registro: https://www.transit.land/feeds/f-sp3-tmb
# → ~/Downloads/Barcelona Metro/
python3 scripts/import_gtfs_es_bcn.py

# Chicago CTA L (no requiere registro)
# Descargar: https://www.transitchicago.com/downloads/sch_data/google_transit.zip
# → ~/Downloads/Chicago CTA/
python3 scripts/import_gtfs_us_chi.py

# LA Metro Rail (no requiere registro)
# Descargar: https://developer.metro.net/gtfs/google_transit.zip
# → ~/Downloads/LA Metro/
python3 scripts/import_gtfs_us_lax.py
```

## 7. Apple Pay / Google Pay

In `CheckoutSheet.tsx`, the payment integration is currently mocked.
To go live:
1. Install Stripe Expo SDK: `npx expo install @stripe/stripe-react-native`
2. Configure your Stripe publishable key
3. Enable Apple Pay / Google Pay in your Stripe dashboard
4. Replace the mock `await new Promise()` with `stripe.presentPaymentSheet()`

## 8. Compliance Checklist

- ✅ No user accounts / registration (RGPD Art. 5)
- ✅ No card data storage (PCI-DSS out-of-scope)
- ✅ Merchant of Record: Trainline / Rail Europe
- ✅ Affiliate ID injected client-side (2-5% commission)
- ✅ Ticket data local-only (SecureStore + FileSystem)
- ✅ Background location with explicit user consent flow
- ✅ WCAG 2.2 Level AA/AAA contrast ratios throughout
