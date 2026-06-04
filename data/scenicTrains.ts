/**
 * Trenes escénicos y especiales por país.
 * Aparecen en split-screen (por país) y en la sección Internacional del home.
 */

export interface ScenicTrain {
  id:          string;
  name:        string;
  route:       string;
  origin:      string;
  dest:        string;
  duration:    string;
  description: string;
  country:     string;   // código del país donde aparece en split-screen
  colors:      [string, string];
  originCoords:  { latitude: number; longitude: number };
  destCoords:    { latitude: number; longitude: number };
  originCountry: string;
  destCountry:   string;
}

export const SCENIC_TRAINS: ScenicTrain[] = [
  // ── Suiza ──────────────────────────────────────────────────────────────────
  {
    id: 'glacier-express',
    name: 'Glacier Express',
    route: 'Zermatt → St. Moritz',
    origin: 'Zermatt', dest: 'St. Moritz',
    duration: '7h 45min',
    description: 'El tren más lento del mundo atraviesa 291 puentes y 91 túneles entre los Alpes suizos. Paisajes de glaciares, valles y cumbres nevadas que quitan el aliento.',
    country: 'CH',
    colors: ['#C0392B', '#922B21'],
    originCoords: { latitude: 46.0207, longitude: 7.7491 },
    destCoords:   { latitude: 46.4983, longitude: 9.8394 },
    originCountry: 'CH', destCountry: 'CH',
  },
  {
    id: 'bernina-express',
    name: 'Bernina Express',
    route: 'Chur → Tirano',
    origin: 'Chur', dest: 'Tirano',
    duration: '4h 0min',
    description: 'Patrimonio UNESCO. Cruza el paso de montaña más alto de Europa en tren, con vistas a glaciares, viaductos históricos y paisajes alpinos entre Suiza e Italia.',
    country: 'CH',
    colors: ['#1A5276', '#154360'],
    originCoords: { latitude: 46.8499, longitude: 9.5329 },
    destCoords:   { latitude: 46.2154, longitude: 10.1706 },
    originCountry: 'CH', destCountry: 'IT',
  },
  {
    id: 'goldenpass-express',
    name: 'GoldenPass Express',
    route: 'Montreux → Interlaken',
    origin: 'Montreux', dest: 'Interlaken Ost',
    duration: '3h 19min',
    description: 'Desde las orillas del Lago Lemán hasta las montañas del Oberland bernés. Vagones panorámicos con ventanas extra anchas para no perderse nada del paisaje.',
    country: 'CH',
    colors: ['#B7950B', '#9A7D0A'],
    originCoords: { latitude: 46.4312, longitude: 6.9109 },
    destCoords:   { latitude: 46.6863, longitude: 7.8687 },
    originCountry: 'CH', destCountry: 'CH',
  },
  // ── Italia ─────────────────────────────────────────────────────────────────
  {
    id: 'cinque-terre-express',
    name: 'Cinque Terre Express',
    route: 'La Spezia → Levanto',
    origin: 'La Spezia Centrale', dest: 'Levanto',
    duration: '30min',
    description: 'La forma más cómoda de recorrer las cinco aldeas de colores pegadas al acantilado. Tren local que conecta Riomaggiore, Manarola, Corniglia, Vernazza y Monterosso.',
    country: 'IT',
    colors: ['#1E8449', '#196F3D'],
    originCoords: { latitude: 44.1014, longitude: 9.8227 },
    destCoords:   { latitude: 44.1697, longitude: 9.6128 },
    originCountry: 'IT', destCountry: 'IT',
  },
  {
    id: 'frecciarossa-scenic',
    name: 'Frecciarossa',
    route: 'Roma → Venezia',
    origin: 'Roma Termini', dest: 'Venezia Santa Lucia',
    duration: '3h 45min',
    description: 'El tren de alta velocidad más icónico de Italia. Une la capital con la ciudad de los canales atravesando la llanura del Po a 300 km/h con vistas únicas.',
    country: 'IT',
    colors: ['#C0392B', '#7B241C'],
    originCoords: { latitude: 41.9009, longitude: 12.5012 },
    destCoords:   { latitude: 45.4414, longitude: 12.3210 },
    originCountry: 'IT', destCountry: 'IT',
  },
  // ── Francia ────────────────────────────────────────────────────────────────
  {
    id: 'train-merveilles',
    name: 'Train des Merveilles',
    route: 'Nice → Tende',
    origin: 'Nice Ville', dest: 'Tende',
    duration: '2h 10min',
    description: 'El tren de las maravillas sube desde el Mediterráneo hasta los valles alpinos con grabados rupestres de 5.000 años. Un viaje entre mar, montaña e historia.',
    country: 'FR',
    colors: ['#2471A3', '#1A5276'],
    originCoords: { latitude: 43.7044, longitude: 7.2621 },
    destCoords:   { latitude: 44.0847, longitude: 7.5932 },
    originCountry: 'FR', destCountry: 'FR',
  },
  {
    id: 'tgv-lyria',
    name: 'TGV Lyria',
    route: 'París → Ginebra',
    origin: 'Paris Gare de Lyon', dest: 'Genève',
    duration: '3h 5min',
    description: 'Alta velocidad franco-suiza. Sale de París y en tres horas estás en el corazón de Ginebra, con las últimas vistas de los Alpes antes de llegar al lago.',
    country: 'FR',
    colors: ['#C0392B', '#922B21'],
    originCoords: { latitude: 48.8448, longitude: 2.3739 },
    destCoords:   { latitude: 46.2044, longitude: 6.1432 },
    originCountry: 'FR', destCountry: 'CH',
  },
  // ── Alemania ───────────────────────────────────────────────────────────────
  {
    id: 'rhine-valley',
    name: 'Rhine Valley',
    route: 'Köln → Mainz',
    origin: 'Köln Hauptbahnhof', dest: 'Mainz Hauptbahnhof',
    duration: '1h 55min',
    description: 'El valle del Rin más espectacular. Castillos medievales sobre acantilados, viñedos en terrazas y el legendario peñasco de Loreley a orillas del río.',
    country: 'DE',
    colors: ['#922B21', '#7B241C'],
    originCoords: { latitude: 50.9430, longitude: 6.9590 },
    destCoords:   { latitude: 49.9999, longitude: 8.2718 },
    originCountry: 'DE', destCountry: 'DE',
  },
  {
    id: 'bavaria-alps',
    name: 'Bavaria Alps Express',
    route: 'Múnich → Salzburg',
    origin: 'München Hauptbahnhof', dest: 'Salzburg Hauptbahnhof',
    duration: '1h 30min',
    description: 'De la capital bávara a la ciudad de Mozart bordeando los Alpes. Lagos turquesa, prados verdes y cumbres nevadas en apenas hora y media de viaje.',
    country: 'DE',
    colors: ['#1A5276', '#154360'],
    originCoords: { latitude: 48.1402, longitude: 11.5600 },
    destCoords:   { latitude: 47.8126, longitude: 13.0433 },
    originCountry: 'DE', destCountry: 'AT',
  },
  // ── Austria ────────────────────────────────────────────────────────────────
  {
    id: 'semmering-express',
    name: 'Semmering Express',
    route: 'Viena → Graz',
    origin: 'Wien Hauptbahnhof', dest: 'Graz Hauptbahnhof',
    duration: '2h 39min',
    description: 'Cruza el ferrocarril de montaña más antiguo del mundo, declarado Patrimonio UNESCO. Viaductos de piedra del siglo XIX entre bosques alpinos y prados austríacos.',
    country: 'AT',
    colors: ['#B7950B', '#9A7D0A'],
    originCoords: { latitude: 48.1850, longitude: 16.3763 },
    destCoords:   { latitude: 47.0707, longitude: 15.4210 },
    originCountry: 'AT', destCountry: 'AT',
  },
  {
    id: 'arlberg-express',
    name: 'Arlberg Express',
    route: 'Innsbruck → Bregenz',
    origin: 'Innsbruck Hauptbahnhof', dest: 'Bregenz',
    duration: '2h 15min',
    description: 'Atraviesa el paso de Arlberg, uno de los más imponentes de los Alpes austríacos. Desde el corazón del Tirol hasta el Lago de Constanza en un trayecto de postal.',
    country: 'AT',
    colors: ['#1E8449', '#196F3D'],
    originCoords: { latitude: 47.2634, longitude: 11.4010 },
    destCoords:   { latitude: 47.5031, longitude: 9.7471 },
    originCountry: 'AT', destCountry: 'AT',
  },
  // ── Portugal ───────────────────────────────────────────────────────────────
  {
    id: 'douro-valley',
    name: 'Douro Valley Train',
    route: 'Porto → Pocinho',
    origin: 'Porto Campanhã', dest: 'Pocinho',
    duration: '3h 30min',
    description: 'Sigue el río Duero entre viñedos del Oporto en terrazas de esquisto. Considerado uno de los trayectos en tren más bellos del mundo por la revista Condé Nast.',
    country: 'PT',
    colors: ['#784212', '#6E2C00'],
    originCoords: { latitude: 41.1496, longitude: -8.5855 },
    destCoords:   { latitude: 41.0968, longitude: -7.1204 },
    originCountry: 'PT', destCountry: 'PT',
  },
  // ── Países Bajos ───────────────────────────────────────────────────────────
  {
    id: 'intercity-direct',
    name: 'Intercity Direct',
    route: 'Ámsterdam → Bruselas',
    origin: 'Amsterdam Centraal', dest: 'Brussel-Zuid',
    duration: '1h 51min',
    description: 'Conecta dos capitales europeas atravesando los pólderes holandeses y la campiña belga. La manera más rápida y cómoda de ir de los canales de Ámsterdam al Grand Place.',
    country: 'NL',
    colors: ['#E67E22', '#CA6F1E'],
    originCoords: { latitude: 52.3791, longitude: 4.8997 },
    destCoords:   { latitude: 50.8355, longitude: 4.3360 },
    originCountry: 'NL', destCountry: 'BE',
  },
  // ── Bélgica ────────────────────────────────────────────────────────────────
  {
    id: 'thalys',
    name: 'Thalys',
    route: 'Bruselas → París',
    origin: 'Brussel-Zuid', dest: 'Paris Gare du Nord',
    duration: '1h 22min',
    description: 'El tren rojo más famoso de Europa. En menos de hora y media te planta en el corazón de París desde Bruselas, cruzando la frontera franco-belga a 300 km/h.',
    country: 'BE',
    colors: ['#C0392B', '#7B241C'],
    originCoords: { latitude: 50.8355, longitude: 4.3360 },
    destCoords:   { latitude: 48.8809, longitude: 2.3553 },
    originCountry: 'BE', destCountry: 'FR',
  },
];

export function getScenicByCountry(country: string): ScenicTrain[] {
  return SCENIC_TRAINS.filter(t => t.country === country);
}
