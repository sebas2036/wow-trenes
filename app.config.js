/**
 * app.config.js — config dinámica de Expo.
 *
 * Inyecta la Google Maps API key desde el .env (process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY)
 * en vez de hardcodearla en app.json. Así la key NO se commitea al repo.
 *
 * Expo carga app.json y nos lo pasa como `config`; lo extendemos con la key del entorno.
 * La key vieja quedó en el git history → hay que ROTARLA en Google Cloud Console y
 * restringirla por package (com.wowtrenes.app) + SHA-1.
 */
module.exports = ({ config }) => {
  config.android = config.android || {};
  config.android.config = {
    ...config.android.config,
    googleMaps: {
      apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '',
    },
  };
  return config;
};
