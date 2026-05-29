// metro.config.js — WoW TRENES
// Necesario para SDK 52 + expo-router:
//   1. Habilita resolución del módulo virtual "expo/virtual/env"
//   2. Registra .db como asset para los archivos SQLite GTFS
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Permitir importar archivos .db como assets (GTFS SQLite)
config.resolver.assetExts.push('db');

module.exports = config;
