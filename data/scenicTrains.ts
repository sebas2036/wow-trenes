/**
 * Trenes escénicos y especiales por país.
 * Aparecen en split-screen (por país) y en la sección Internacional del home.
 */

export interface ScenicTrain {
  id:       string;
  name:     string;
  route:    string;
  origin:   string;
  dest:     string;
  duration: string;
  country:  string;   // código del país donde aparece en split-screen
  colors:   [string, string];
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
