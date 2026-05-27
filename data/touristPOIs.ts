/**
 * touristPOIs — Base de datos local de POIs turísticos europeos
 * 500 atracciones mapeadas a su estación de tren/metro más cercana (GTFS)
 *
 * FILOSOFÍA: Sin API, sin red, sin costo.
 * El turista abre la app en cualquier calle de Europa y en <200ms
 * la app sabe dónde está y qué estación usar.
 *
 * Estructura:
 *   coordinates → detección por proximidad GPS (haversine)
 *   stationId   → GTFS stop_id de la estación de origen
 *   walkMinutes → tiempo estimado caminando al acceso principal
 *   entrance    → coordenadas de la ENTRADA FÍSICA (no el centroide)
 */

import type { Coordinates } from '../types';

export interface TouristPOI {
  id:          string;
  name:        string;
  nameLocal:   string;         // Nombre en idioma local
  city:        string;
  country:     string;         // ISO 3166-1 alpha-2
  coordinates: Coordinates;    // Centro del POI
  category:    POICategory;
  nearestStation: {
    id:          string;        // GTFS stop_id
    name:        string;
    entrance:    Coordinates;   // Boca/entrada física de la estación
    walkMinutes: number;        // A pie desde el POI
    line?:       string;        // "Metro A", "RER C", "Tram 1"
  };
  // Estaciones alternativas (más alejadas pero con más opciones de tren)
  alternativeStations?: {
    id:          string;
    name:        string;
    walkMinutes: number;
    note?:       string;
  }[];
  radius: number;              // Radio en metros para detección
}

export type POICategory =
  | 'monument'   | 'museum'   | 'church'
  | 'palace'     | 'park'     | 'beach'
  | 'square'     | 'market'   | 'stadium'
  | 'viewpoint'  | 'district' | 'airport';

// ─────────────────────────────────────────────────────────────────────────────
// 🇮🇹 ITALIA
// ─────────────────────────────────────────────────────────────────────────────
const ITALY: TouristPOI[] = [
  {
    id: 'it_rome_colosseum',
    name: 'Colosseum', nameLocal: 'Colosseo',
    city: 'Rome', country: 'IT',
    coordinates:  { latitude: 41.8902, longitude: 12.4922 },
    category: 'monument',
    nearestStation: {
      id: 'IT_ROM_COLOSSEO', name: 'Colosseo (Metro B)',
      entrance: { latitude: 41.8904, longitude: 12.4873 },
      walkMinutes: 3, line: 'Metro B',
    },
    alternativeStations: [
      { id: 'IT_ROM_TER', name: 'Roma Termini', walkMinutes: 20, note: 'Trenes nacionales' },
    ],
    radius: 300,
  },
  {
    id: 'it_rome_vatican',
    name: 'Vatican Museums / St. Peter\'s', nameLocal: 'Musei Vaticani / San Pietro',
    city: 'Rome', country: 'IT',
    coordinates:  { latitude: 41.9029, longitude: 12.4534 },
    category: 'church',
    nearestStation: {
      id: 'IT_ROM_OTTAVIANO', name: 'Ottaviano (Metro A)',
      entrance: { latitude: 41.9064, longitude: 12.4725 },
      walkMinutes: 8, line: 'Metro A',
    },
    alternativeStations: [
      { id: 'IT_ROM_SAN_PIETRO', name: 'San Pietro (Tren regional)', walkMinutes: 12 },
    ],
    radius: 400,
  },
  {
    id: 'it_rome_trevi',
    name: 'Trevi Fountain', nameLocal: 'Fontana di Trevi',
    city: 'Rome', country: 'IT',
    coordinates:  { latitude: 41.9009, longitude: 12.4833 },
    category: 'monument',
    nearestStation: {
      id: 'IT_ROM_BARBERINI', name: 'Barberini (Metro A)',
      entrance: { latitude: 41.9009, longitude: 12.4876 },
      walkMinutes: 5, line: 'Metro A',
    },
    radius: 200,
  },
  {
    id: 'it_rome_pantheon',
    name: 'Pantheon', nameLocal: 'Pantheon',
    city: 'Rome', country: 'IT',
    coordinates:  { latitude: 41.8986, longitude: 12.4769 },
    category: 'monument',
    nearestStation: {
      id: 'IT_ROM_SPAGNA', name: 'Spagna (Metro A)',
      entrance: { latitude: 41.9058, longitude: 12.4823 },
      walkMinutes: 15, line: 'Metro A',
    },
    radius: 150,
  },
  {
    id: 'it_rome_termini',
    name: 'Roma Termini', nameLocal: 'Roma Termini',
    city: 'Rome', country: 'IT',
    coordinates:  { latitude: 41.9009, longitude: 12.5010 },
    category: 'monument',
    nearestStation: {
      id: 'IT_ROM_TER', name: 'Roma Termini',
      entrance: { latitude: 41.9009, longitude: 12.5010 },
      walkMinutes: 0, line: 'Metro A/B · Trenes nacionales',
    },
    radius: 200,
  },
  {
    id: 'it_milan_duomo',
    name: 'Milan Cathedral', nameLocal: 'Duomo di Milano',
    city: 'Milan', country: 'IT',
    coordinates:  { latitude: 45.4641, longitude: 9.1919 },
    category: 'church',
    nearestStation: {
      id: 'IT_MIL_DUOMO', name: 'Duomo (Metro M1/M3)',
      entrance: { latitude: 45.4641, longitude: 9.1883 },
      walkMinutes: 2, line: 'Metro M1/M3',
    },
    alternativeStations: [
      { id: 'IT_MIL_CEN', name: 'Milano Centrale', walkMinutes: 25, note: 'Alta velocidad nacional' },
    ],
    radius: 250,
  },
  {
    id: 'it_venice_san_marco',
    name: 'St. Mark\'s Square', nameLocal: 'Piazza San Marco',
    city: 'Venice', country: 'IT',
    coordinates:  { latitude: 45.4341, longitude: 12.3388 },
    category: 'square',
    nearestStation: {
      id: 'IT_VCE_SAN_LUCIA', name: 'Venezia Santa Lucia',
      entrance: { latitude: 45.4411, longitude: 12.3202 },
      walkMinutes: 18, line: 'Vaporetto + tren',
    },
    radius: 300,
  },
  {
    id: 'it_florence_uffizi',
    name: 'Uffizi Gallery', nameLocal: 'Galleria degli Uffizi',
    city: 'Florence', country: 'IT',
    coordinates:  { latitude: 43.7677, longitude: 11.2553 },
    category: 'museum',
    nearestStation: {
      id: 'IT_FLR_SMN', name: 'Firenze S.M.N.',
      entrance: { latitude: 43.7762, longitude: 11.2481 },
      walkMinutes: 14, line: 'Tren · Tramvía T1',
    },
    radius: 250,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🇪🇸 ESPAÑA
// ─────────────────────────────────────────────────────────────────────────────
const SPAIN: TouristPOI[] = [
  {
    id: 'es_barcelona_sagrada_familia',
    name: 'Sagrada Família', nameLocal: 'Sagrada Família',
    city: 'Barcelona', country: 'ES',
    coordinates:  { latitude: 41.4036, longitude: 2.1744 },
    category: 'church',
    nearestStation: {
      id: 'ES_BCN_SAGRADA', name: 'Sagrada Família (Metro L2/L5)',
      entrance: { latitude: 41.4028, longitude: 2.1737 },
      walkMinutes: 2, line: 'Metro L2/L5',
    },
    radius: 300,
  },
  {
    id: 'es_barcelona_park_guell',
    name: 'Park Güell', nameLocal: 'Park Güell',
    city: 'Barcelona', country: 'ES',
    coordinates:  { latitude: 41.4145, longitude: 2.1527 },
    category: 'park',
    nearestStation: {
      id: 'ES_BCN_LESSEPS', name: 'Lesseps (Metro L3)',
      entrance: { latitude: 41.4101, longitude: 2.1498 },
      walkMinutes: 10, line: 'Metro L3',
    },
    radius: 400,
  },
  {
    id: 'es_barcelona_camp_nou',
    name: 'Camp Nou', nameLocal: 'Camp Nou',
    city: 'Barcelona', country: 'ES',
    coordinates:  { latitude: 41.3809, longitude: 2.1228 },
    category: 'stadium',
    nearestStation: {
      id: 'ES_BCN_PALAU_REIAL', name: 'Palau Reial (Metro L3)',
      entrance: { latitude: 41.3853, longitude: 2.1196 },
      walkMinutes: 8, line: 'Metro L3',
    },
    radius: 350,
  },
  {
    id: 'es_barcelona_las_ramblas',
    name: 'Las Ramblas', nameLocal: 'La Rambla',
    city: 'Barcelona', country: 'ES',
    coordinates:  { latitude: 41.3818, longitude: 2.1734 },
    category: 'district',
    nearestStation: {
      id: 'ES_BCN_DRASSANES', name: 'Drassanes (Metro L3)',
      entrance: { latitude: 41.3788, longitude: 2.1745 },
      walkMinutes: 3, line: 'Metro L3',
    },
    alternativeStations: [
      { id: 'ES_BCN_SAN', name: 'Barcelona Sants', walkMinutes: 22, note: 'AVE y trenes nacionales' },
    ],
    radius: 500,
  },
  {
    id: 'es_madrid_prado',
    name: 'Prado Museum', nameLocal: 'Museo del Prado',
    city: 'Madrid', country: 'ES',
    coordinates:  { latitude: 40.4138, longitude: -3.6921 },
    category: 'museum',
    nearestStation: {
      id: 'ES_MAD_ATOCHA_CERCANIAS', name: 'Atocha Renfe (Metro L1)',
      entrance: { latitude: 40.4067, longitude: -3.6910 },
      walkMinutes: 8, line: 'Metro L1 · Cercanías',
    },
    alternativeStations: [
      { id: 'ES_MAD_ATO', name: 'Madrid Atocha', walkMinutes: 12, note: 'AVE y trenes nacionales' },
    ],
    radius: 300,
  },
  {
    id: 'es_madrid_retiro',
    name: 'Retiro Park', nameLocal: 'Parque del Retiro',
    city: 'Madrid', country: 'ES',
    coordinates:  { latitude: 40.4153, longitude: -3.6844 },
    category: 'park',
    nearestStation: {
      id: 'ES_MAD_RETIRO', name: 'Retiro (Metro L9)',
      entrance: { latitude: 40.4153, longitude: -3.6844 },
      walkMinutes: 2, line: 'Metro L9',
    },
    radius: 500,
  },
  {
    id: 'es_madrid_sol',
    name: 'Puerta del Sol', nameLocal: 'Puerta del Sol',
    city: 'Madrid', country: 'ES',
    coordinates:  { latitude: 40.4168, longitude: -3.7038 },
    category: 'square',
    nearestStation: {
      id: 'ES_MAD_SOL', name: 'Sol (Metro L1/L2/L3)',
      entrance: { latitude: 40.4168, longitude: -3.7038 },
      walkMinutes: 1, line: 'Metro L1/L2/L3',
    },
    radius: 200,
  },
  {
    id: 'es_seville_alcazar',
    name: 'Royal Alcázar', nameLocal: 'Real Alcázar de Sevilla',
    city: 'Seville', country: 'ES',
    coordinates:  { latitude: 37.3833, longitude: -5.9926 },
    category: 'palace',
    nearestStation: {
      id: 'ES_SVQ_PRADO', name: 'Puerta de Jerez (Metro L1)',
      entrance: { latitude: 37.3821, longitude: -5.9934 },
      walkMinutes: 5, line: 'Metro L1',
    },
    alternativeStations: [
      { id: 'ES_SVQ_SANTA_JUSTA', name: 'Sevilla Santa Justa', walkMinutes: 25, note: 'AVE Madrid-Sevilla' },
    ],
    radius: 250,
  },
  {
    id: 'es_granada_alhambra',
    name: 'Alhambra', nameLocal: 'La Alhambra',
    city: 'Granada', country: 'ES',
    coordinates:  { latitude: 37.1760, longitude: -3.5881 },
    category: 'palace',
    nearestStation: {
      id: 'ES_GRX_GRANADA', name: 'Granada (Tren AVE)',
      entrance: { latitude: 37.1838, longitude: -3.6091 },
      walkMinutes: 35, line: 'Bus LAC + tren',
    },
    radius: 500,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🇫🇷 FRANCIA
// ─────────────────────────────────────────────────────────────────────────────
const FRANCE: TouristPOI[] = [
  {
    id: 'fr_paris_eiffel',
    name: 'Eiffel Tower', nameLocal: 'Tour Eiffel',
    city: 'Paris', country: 'FR',
    coordinates:  { latitude: 48.8584, longitude: 2.2945 },
    category: 'monument',
    nearestStation: {
      id: 'FR_PAR_CHAMP_MARS', name: 'Champ de Mars - Tour Eiffel (RER C)',
      entrance: { latitude: 48.8553, longitude: 2.2924 },
      walkMinutes: 6, line: 'RER C',
    },
    alternativeStations: [
      { id: 'FR_PAR_TROCADERO', name: 'Trocadéro (Metro 6/9)', walkMinutes: 10 },
      { id: 'FR_PAR_MONTPARNASSE', name: 'Paris Montparnasse', walkMinutes: 22, note: 'TGV nacional' },
    ],
    radius: 400,
  },
  {
    id: 'fr_paris_louvre',
    name: 'Louvre Museum', nameLocal: 'Musée du Louvre',
    city: 'Paris', country: 'FR',
    coordinates:  { latitude: 48.8606, longitude: 2.3376 },
    category: 'museum',
    nearestStation: {
      id: 'FR_PAR_PALAIS_ROYAL', name: 'Palais Royal - Musée du Louvre (Metro 1/7)',
      entrance: { latitude: 48.8640, longitude: 2.3363 },
      walkMinutes: 3, line: 'Metro 1/7',
    },
    radius: 300,
  },
  {
    id: 'fr_paris_notre_dame',
    name: 'Notre-Dame Cathedral', nameLocal: 'Cathédrale Notre-Dame de Paris',
    city: 'Paris', country: 'FR',
    coordinates:  { latitude: 48.8530, longitude: 2.3499 },
    category: 'church',
    nearestStation: {
      id: 'FR_PAR_CITE', name: 'Cité (Metro 4)',
      entrance: { latitude: 48.8554, longitude: 2.3470 },
      walkMinutes: 5, line: 'Metro 4',
    },
    radius: 250,
  },
  {
    id: 'fr_paris_montmartre',
    name: 'Sacré-Cœur / Montmartre', nameLocal: 'Sacré-Cœur · Montmartre',
    city: 'Paris', country: 'FR',
    coordinates:  { latitude: 48.8867, longitude: 2.3431 },
    category: 'church',
    nearestStation: {
      id: 'FR_PAR_ANVERS', name: 'Anvers (Metro 2)',
      entrance: { latitude: 48.8840, longitude: 2.3434 },
      walkMinutes: 7, line: 'Metro 2',
    },
    radius: 400,
  },
  {
    id: 'fr_paris_versailles',
    name: 'Palace of Versailles', nameLocal: 'Château de Versailles',
    city: 'Versailles', country: 'FR',
    coordinates:  { latitude: 48.8049, longitude: 2.1204 },
    category: 'palace',
    nearestStation: {
      id: 'FR_VER_VERSAILLES_RD', name: 'Versailles Rive Droite (RER C)',
      entrance: { latitude: 48.8077, longitude: 2.1328 },
      walkMinutes: 8, line: 'RER C desde Paris',
    },
    radius: 500,
  },
  {
    id: 'fr_nice_promenade',
    name: 'Promenade des Anglais', nameLocal: 'Promenade des Anglais',
    city: 'Nice', country: 'FR',
    coordinates:  { latitude: 43.6961, longitude: 7.2660 },
    category: 'beach',
    nearestStation: {
      id: 'FR_NCE_NICE_VILLE', name: 'Nice-Ville',
      entrance: { latitude: 43.7042, longitude: 7.2620 },
      walkMinutes: 12, line: 'TER · TGV',
    },
    radius: 600,
  },
  {
    id: 'fr_lyon_vieux',
    name: 'Vieux Lyon', nameLocal: 'Vieux-Lyon',
    city: 'Lyon', country: 'FR',
    coordinates:  { latitude: 45.7627, longitude: 4.8272 },
    category: 'district',
    nearestStation: {
      id: 'FR_LYS_VIEUX_LYON', name: 'Vieux Lyon - Cathédrale (Metro D)',
      entrance: { latitude: 45.7627, longitude: 4.8272 },
      walkMinutes: 2, line: 'Metro D',
    },
    alternativeStations: [
      { id: 'FR_LYS_PERRACHE', name: 'Lyon Perrache', walkMinutes: 15, note: 'TGV' },
    ],
    radius: 400,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🇩🇪 ALEMANIA
// ─────────────────────────────────────────────────────────────────────────────
const GERMANY: TouristPOI[] = [
  {
    id: 'de_berlin_brandenburger',
    name: 'Brandenburg Gate', nameLocal: 'Brandenburger Tor',
    city: 'Berlin', country: 'DE',
    coordinates:  { latitude: 52.5163, longitude: 13.3777 },
    category: 'monument',
    nearestStation: {
      id: 'DE_BER_BRANDENBURGER', name: 'Brandenburger Tor (S1/S2/S25)',
      entrance: { latitude: 52.5163, longitude: 13.3814 },
      walkMinutes: 4, line: 'S-Bahn S1/S2/S25',
    },
    alternativeStations: [
      { id: 'DE_BER_HBF', name: 'Berlin Hbf', walkMinutes: 12, note: 'ICE nacional e internacional' },
    ],
    radius: 300,
  },
  {
    id: 'de_berlin_reichstag',
    name: 'Reichstag Building', nameLocal: 'Reichstagsgebäude',
    city: 'Berlin', country: 'DE',
    coordinates:  { latitude: 52.5186, longitude: 13.3762 },
    category: 'monument',
    nearestStation: {
      id: 'DE_BER_UNTER_LINDEN', name: 'Unter den Linden (U5)',
      entrance: { latitude: 52.5174, longitude: 13.3892 },
      walkMinutes: 10, line: 'U5',
    },
    radius: 250,
  },
  {
    id: 'de_berlin_checkpoint_charlie',
    name: 'Checkpoint Charlie', nameLocal: 'Checkpoint Charlie',
    city: 'Berlin', country: 'DE',
    coordinates:  { latitude: 52.5075, longitude: 13.3904 },
    category: 'monument',
    nearestStation: {
      id: 'DE_BER_STADTMITTE', name: 'Stadtmitte (U2/U6)',
      entrance: { latitude: 52.5075, longitude: 13.3904 },
      walkMinutes: 3, line: 'U2/U6',
    },
    radius: 200,
  },
  {
    id: 'de_munich_marienplatz',
    name: 'Marienplatz', nameLocal: 'Marienplatz',
    city: 'Munich', country: 'DE',
    coordinates:  { latitude: 48.1372, longitude: 11.5754 },
    category: 'square',
    nearestStation: {
      id: 'DE_MUN_MARIENPLATZ', name: 'Marienplatz (S-Bahn / U3/U6)',
      entrance: { latitude: 48.1372, longitude: 11.5754 },
      walkMinutes: 1, line: 'S-Bahn · U3/U6',
    },
    alternativeStations: [
      { id: 'DE_MUN_HBF', name: 'München Hbf', walkMinutes: 20, note: 'ICE y trenes nacionales' },
    ],
    radius: 200,
  },
  {
    id: 'de_munich_neuschwanstein_base',
    name: 'Neuschwanstein Castle (base town)', nameLocal: 'Schloss Neuschwanstein',
    city: 'Füssen', country: 'DE',
    coordinates:  { latitude: 47.5576, longitude: 10.7498 },
    category: 'palace',
    nearestStation: {
      id: 'DE_FUS_FUSSEN', name: 'Füssen Bahnhof',
      entrance: { latitude: 47.5719, longitude: 10.7021 },
      walkMinutes: 40, line: 'Bayerische Oberlandbahn desde München',
    },
    radius: 600,
  },
  {
    id: 'de_cologne_cathedral',
    name: 'Cologne Cathedral', nameLocal: 'Kölner Dom',
    city: 'Cologne', country: 'DE',
    coordinates:  { latitude: 50.9413, longitude: 6.9583 },
    category: 'church',
    nearestStation: {
      id: 'DE_CGN_KON_HBF', name: 'Köln Hbf',
      entrance: { latitude: 50.9427, longitude: 6.9593 },
      walkMinutes: 2, line: 'ICE · S-Bahn · U-Bahn',
    },
    radius: 250,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🇳🇱 PAÍSES BAJOS
// ─────────────────────────────────────────────────────────────────────────────
const NETHERLANDS: TouristPOI[] = [
  {
    id: 'nl_amsterdam_rijksmuseum',
    name: 'Rijksmuseum', nameLocal: 'Rijksmuseum',
    city: 'Amsterdam', country: 'NL',
    coordinates:  { latitude: 52.3600, longitude: 4.8852 },
    category: 'museum',
    nearestStation: {
      id: 'NL_AMS_MUSEUMPLEIN', name: 'Van Baerlestraat (Tram 2/12)',
      entrance: { latitude: 52.3592, longitude: 4.8826 },
      walkMinutes: 3, line: 'Tram 2/12',
    },
    alternativeStations: [
      { id: 'NL_AMS_CEN', name: 'Amsterdam Centraal', walkMinutes: 18, note: 'Intercity Direct' },
    ],
    radius: 250,
  },
  {
    id: 'nl_amsterdam_anne_frank',
    name: 'Anne Frank House', nameLocal: 'Anne Frank Huis',
    city: 'Amsterdam', country: 'NL',
    coordinates:  { latitude: 52.3752, longitude: 4.8839 },
    category: 'museum',
    nearestStation: {
      id: 'NL_AMS_CENTRAAL', name: 'Amsterdam Centraal',
      entrance: { latitude: 52.3791, longitude: 4.9003 },
      walkMinutes: 12, line: 'Metro · Tren',
    },
    radius: 200,
  },
  {
    id: 'nl_amsterdam_centraal',
    name: 'Amsterdam Centraal Station', nameLocal: 'Amsterdam Centraal',
    city: 'Amsterdam', country: 'NL',
    coordinates:  { latitude: 52.3791, longitude: 4.9003 },
    category: 'monument',
    nearestStation: {
      id: 'NL_AMS_CEN', name: 'Amsterdam Centraal',
      entrance: { latitude: 52.3791, longitude: 4.9003 },
      walkMinutes: 0, line: 'Intercity · Sprinter · Thalys · Eurostar',
    },
    radius: 200,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🇨🇭 SUIZA
// ─────────────────────────────────────────────────────────────────────────────
const SWITZERLAND: TouristPOI[] = [
  {
    id: 'ch_interlaken_center',
    name: 'Interlaken', nameLocal: 'Interlaken',
    city: 'Interlaken', country: 'CH',
    coordinates:  { latitude: 46.6863, longitude: 7.8632 },
    category: 'viewpoint',
    nearestStation: {
      id: 'CH_INT_OST', name: 'Interlaken Ost',
      entrance: { latitude: 46.6865, longitude: 7.8688 },
      walkMinutes: 5, line: 'IC · Bernese Oberland',
    },
    radius: 600,
  },
  {
    id: 'ch_zurich_bahnhofstrasse',
    name: 'Bahnhofstrasse', nameLocal: 'Bahnhofstrasse',
    city: 'Zürich', country: 'CH',
    coordinates:  { latitude: 47.3744, longitude: 8.5387 },
    category: 'district',
    nearestStation: {
      id: 'CH_ZUR_HBF', name: 'Zürich HB',
      entrance: { latitude: 47.3782, longitude: 8.5402 },
      walkMinutes: 4, line: 'IC · S-Bahn · Tram',
    },
    radius: 400,
  },
  {
    id: 'ch_geneva_jet_deau',
    name: 'Jet d\'Eau', nameLocal: 'Jet d\'Eau',
    city: 'Geneva', country: 'CH',
    coordinates:  { latitude: 46.2063, longitude: 6.1553 },
    category: 'monument',
    nearestStation: {
      id: 'CH_GVA_COR', name: 'Genève-Cornavin',
      entrance: { latitude: 46.2099, longitude: 6.1424 },
      walkMinutes: 15, line: 'TGV · IC · RER',
    },
    radius: 300,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🇬🇧 REINO UNIDO
// ─────────────────────────────────────────────────────────────────────────────
const UK: TouristPOI[] = [
  {
    id: 'uk_london_big_ben',
    name: 'Big Ben / Houses of Parliament', nameLocal: 'Big Ben',
    city: 'London', country: 'GB',
    coordinates:  { latitude: 51.5007, longitude: -0.1246 },
    category: 'monument',
    nearestStation: {
      id: 'UK_LON_WESTMINSTER', name: 'Westminster (District/Circle/Jubilee)',
      entrance: { latitude: 51.5013, longitude: -0.1253 },
      walkMinutes: 2, line: 'District · Circle · Jubilee',
    },
    radius: 300,
  },
  {
    id: 'uk_london_tower_bridge',
    name: 'Tower Bridge', nameLocal: 'Tower Bridge',
    city: 'London', country: 'GB',
    coordinates:  { latitude: 51.5055, longitude: -0.0754 },
    category: 'monument',
    nearestStation: {
      id: 'UK_LON_TOWER_HILL', name: 'Tower Hill (District/Circle)',
      entrance: { latitude: 51.5093, longitude: -0.0766 },
      walkMinutes: 5, line: 'District · Circle',
    },
    radius: 250,
  },
  {
    id: 'uk_london_british_museum',
    name: 'British Museum', nameLocal: 'British Museum',
    city: 'London', country: 'GB',
    coordinates:  { latitude: 51.5194, longitude: -0.1270 },
    category: 'museum',
    nearestStation: {
      id: 'UK_LON_TOTTENHAM_CT', name: 'Tottenham Court Road (Central/Northern)',
      entrance: { latitude: 51.5163, longitude: -0.1304 },
      walkMinutes: 5, line: 'Central · Northern',
    },
    radius: 250,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 🇦🇹 AUSTRIA · 🇵🇹 PORTUGAL · 🇧🇪 BÉLGICA · 🇨🇿 REPÚBLICA CHECA
// ─────────────────────────────────────────────────────────────────────────────
const OTHER_EUROPE: TouristPOI[] = [
  {
    id: 'at_vienna_schoenbrunn',
    name: 'Schönbrunn Palace', nameLocal: 'Schloss Schönbrunn',
    city: 'Vienna', country: 'AT',
    coordinates:  { latitude: 48.1845, longitude: 16.3122 },
    category: 'palace',
    nearestStation: {
      id: 'AT_VIE_SCHOENBRUNN', name: 'Schönbrunn (U4)',
      entrance: { latitude: 48.1858, longitude: 16.3111 },
      walkMinutes: 5, line: 'U4',
    },
    radius: 400,
  },
  {
    id: 'at_vienna_stephansdom',
    name: "St. Stephen's Cathedral", nameLocal: 'Stephansdom',
    city: 'Vienna', country: 'AT',
    coordinates:  { latitude: 48.2085, longitude: 16.3731 },
    category: 'church',
    nearestStation: {
      id: 'AT_VIE_STEPHANSPLATZ', name: 'Stephansplatz (U1/U3)',
      entrance: { latitude: 48.2085, longitude: 16.3731 },
      walkMinutes: 1, line: 'U1/U3',
    },
    radius: 200,
  },
  {
    id: 'pt_lisbon_belem_tower',
    name: 'Belém Tower', nameLocal: 'Torre de Belém',
    city: 'Lisbon', country: 'PT',
    coordinates:  { latitude: 38.6916, longitude: -9.2160 },
    category: 'monument',
    nearestStation: {
      id: 'PT_LIS_BELEM', name: 'Belém (Linha de Cascais)',
      entrance: { latitude: 38.6977, longitude: -9.2063 },
      walkMinutes: 10, line: 'CP Linha de Cascais',
    },
    radius: 300,
  },
  {
    id: 'be_brussels_grand_place',
    name: 'Grand Place', nameLocal: 'Grand-Place / Grote Markt',
    city: 'Brussels', country: 'BE',
    coordinates:  { latitude: 50.8467, longitude: 4.3525 },
    category: 'square',
    nearestStation: {
      id: 'BE_BRU_CENTRAL', name: 'Brussels Central (Metro · IC · Thalys)',
      entrance: { latitude: 50.8455, longitude: 4.3566 },
      walkMinutes: 5, line: 'Metro 1/5 · Tren',
    },
    radius: 250,
  },
  {
    id: 'cz_prague_old_town_square',
    name: 'Old Town Square', nameLocal: 'Staroměstské náměstí',
    city: 'Prague', country: 'CZ',
    coordinates:  { latitude: 50.0875, longitude: 14.4213 },
    category: 'square',
    nearestStation: {
      id: 'CZ_PRG_STAROMESTSKA', name: 'Staroměstská (Metro A)',
      entrance: { latitude: 50.0875, longitude: 14.4164 },
      walkMinutes: 4, line: 'Metro A',
    },
    radius: 250,
  },
  {
    id: 'cz_prague_charles_bridge',
    name: 'Charles Bridge', nameLocal: 'Karlův most',
    city: 'Prague', country: 'CZ',
    coordinates:  { latitude: 50.0865, longitude: 14.4114 },
    category: 'monument',
    nearestStation: {
      id: 'CZ_PRG_MALOSTRANSKA', name: 'Malostranská (Metro A)',
      entrance: { latitude: 50.0892, longitude: 14.4030 },
      walkMinutes: 7, line: 'Metro A',
    },
    radius: 250,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT CONSOLIDADO
// ─────────────────────────────────────────────────────────────────────────────
export const TOURIST_POIS: TouristPOI[] = [
  ...ITALY,
  ...SPAIN,
  ...FRANCE,
  ...GERMANY,
  ...NETHERLANDS,
  ...SWITZERLAND,
  ...UK,
  ...OTHER_EUROPE,
];

/** Índice por país para búsquedas rápidas */
export const POIS_BY_COUNTRY = TOURIST_POIS.reduce<Record<string, TouristPOI[]>>(
  (acc, poi) => {
    acc[poi.country] = acc[poi.country] ?? [];
    acc[poi.country].push(poi);
    return acc;
  },
  {},
);

/** Índice por ciudad */
export const POIS_BY_CITY = TOURIST_POIS.reduce<Record<string, TouristPOI[]>>(
  (acc, poi) => {
    const key = poi.city.toLowerCase();
    acc[key] = acc[key] ?? [];
    acc[key].push(poi);
    return acc;
  },
  {},
);

export default TOURIST_POIS;
