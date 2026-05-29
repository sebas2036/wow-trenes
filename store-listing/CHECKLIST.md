# WoW TRENES — Checklist de publicación

## ANTES DE PUBLICAR

### Cuentas (una sola vez)
- [ ] Apple Developer Program — https://developer.apple.com/enroll/ ($99/año)
- [ ] Google Play Console — https://play.google.com/console ($25 único)

### EAS Build (requiere cuenta Expo)
```bash
npm install -g eas-cli
eas login
eas init                          # vincula el proyecto, genera projectId
npx expo prebuild                 # genera ios/ y android/ nativos
npm run build:preview             # APK + IPA para testing interno
npm run build:all                 # build de producción
```

### iOS — App Store Connect
1. Crear app en https://appstoreconnect.apple.com
   - Bundle ID: `com.wowtrenes.app`
   - Name: `WoW TRENES`
   - Primary Language: Spanish
2. Pegar contenido de `store-listing/app-store-ios.md`
3. Subir capturas de pantalla (6.7" + 6.1" + iPad si aplica)
4. `npm run submit:ios` (tras build de producción)
5. Enviar a revisión → Apple tarda 1-3 días hábiles

### Android — Google Play Console
1. Crear app en https://play.google.com/console
   - Package name: `com.wowtrenes.app`
   - Default language: es-ES
2. Pegar contenido de `store-listing/play-store-android.md`
3. Completar Data Safety (ver sección en play-store-android.md)
4. Subir capturas de pantalla (Phone + Tablet)
5. Subir Feature Graphic 1024×500
6. `npm run submit:android` (tras build de producción)
7. Enviar a Internal Testing → promover a Production

---

## DATOS NECESARIOS

### App Store Connect
- Apple ID: jasinskysebastian@gmail.com
- Team ID: (se asigna al comprar Developer Program)
- App Store Connect App ID: (se genera al crear la app)

### Google Play
- Service account JSON: `google-play-service-account.json` (generar en Play Console → Setup → API access)

### URLs a crear antes de publicar
- [ ] https://wowtrenes.app/privacy  — Política de privacidad (obligatoria para ambas stores)
- [ ] https://wowtrenes.app/support  — Página de soporte (obligatoria App Store)
- [ ] https://wowtrenes.app          — Web de marketing (opcional pero recomendada)

---

## POLÍTICA DE PRIVACIDAD (mínimo necesario)

```
WoW TRENES no recopila ni almacena datos personales en servidores propios.

DATOS DE UBICACIÓN: Tu ubicación GPS se usa únicamente en el dispositivo
para detectar la estación más cercana y activar alertas de geofencing.
No se transmite a servidores externos.

BILLETES: Los billetes QR se almacenan localmente en el dispositivo
mediante cifrado estándar del sistema operativo (SecureStore).

PAGOS: Los pagos son procesados por Trainline Ltd como Merchant of Record.
WoW TRENES no recibe ni almacena datos de tarjeta de crédito.

ANÁLISIS: No usamos herramientas de analítica de terceros.

Contacto: jasinskysebastian@gmail.com
```

---

## ORDEN RECOMENDADO

1. Comprar Apple Developer ($99) + crear cuenta Play Console ($25)
2. Ejecutar `eas init` para vincular el proyecto
3. Obtener las API keys de SNCF, DB, NS (ver .env.example)
4. Registrarse como afiliado en Partnerize/Impact (ver .env.example)
5. `npm run build:preview` — probar en dispositivo real
6. Descargar GTFS GB y Portugal (`bash scripts/setup_gtfs.sh`)
7. `npm run build:all` — builds de producción
8. Subir a TestFlight (iOS) e Internal Testing (Android)
9. Probar en dispositivo real 1-2 días
10. `npm run submit:all` — enviar a revisión
