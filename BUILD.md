# WoW Train — Guía de Build y Publicación

## Requisitos previos

1. **Cuenta Expo** (gratis) → https://expo.dev/signup
2. **Google Play Console** ($25 único) → https://play.google.com/console
3. **Apple Developer** ($99/año, opcional) → https://developer.apple.com

---

## Paso 1 — Login en EAS

```bash
cd "/Users/sebastianjasinsky/Documents/Claude/Projects/WoW Train"
npx eas login
```

---

## Paso 2 — Build Android (APK para testing)

```bash
npx eas build --platform android --profile preview
```

- Genera un `.apk` instalable directo en el teléfono
- No requiere Google Play Console
- EAS compila en la nube (~15-20 min)
- Te manda el link de descarga por email

---

## Paso 3 — Build Android (AAB para Play Store)

```bash
npx eas build --platform android --profile production
```

- Genera un `.aab` para subir a Google Play
- Requiere Google Play Console activa

---

## Paso 4 — Subir a Google Play

1. Crear app en Play Console con package `com.wowtrenes.app`
2. Completar ficha: descripción, capturas, política de privacidad
3. Subir el `.aab` a track "Internal testing"
4. Añadir testers → probá en tu teléfono
5. Cuando esté listo → promover a "Production"

---

## Paso 5 — Build iOS (cuando tengas Apple Developer)

```bash
npx eas build --platform ios --profile production
```

---

## Variables de entorno en producción

Las keys sensibles van en EAS Secrets (no en el código):

```bash
npx eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value "AIzaSyDmuX0_mdkwyyzHnlPXYr9xb7erUzRsc2M"
npx eas secret:create --scope project --name TMB_APP_KEY --value "b3dcfc04e044118a01bb73c920da537a"
npx eas secret:create --scope project --name EXPO_PUBLIC_SNCF_KEY --value "66478354-83d5-4c9f-a5ee-d9ec31a21af7"
```

---

## Bundle ID / Package Name

- Android: `com.wowtrenes.app`
- iOS: `com.wowtrenes.app`
- TravelPayouts Marker: `734304`

---

## Checklist antes de publicar

- [ ] Cuenta Expo creada y login hecho
- [ ] `npx eas build` exitoso
- [ ] Probado en dispositivo físico
- [ ] Google Play Console activa
- [ ] TravelPayouts proyecto "Mobile app" aprobado
- [ ] Capturas de pantalla preparadas (mínimo 2 por dispositivo)
- [ ] Política de privacidad publicada en URL pública
- [ ] Descripción de la app escrita
