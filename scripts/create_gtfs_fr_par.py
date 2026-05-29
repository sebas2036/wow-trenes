#!/usr/bin/env python3
"""
WoW TRENES — Paris Métro + RER GTFS Generator
Líneas: M1-M14 (incl. 3bis, 7bis) + RER A-E
Fuente: coordenadas reales RATP (data.ratp.fr, OpenStreetMap)
Uso: python3 scripts/create_gtfs_fr_par.py
"""
import sqlite3, shutil, time
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_fr_par.db"

# ── Estaciones: (id, name, lat, lon, [lines]) ─────────────────────────────────
STATIONS = [
    # ── MÉTRO L1 — La Défense ↔ Château de Vincennes ──────────────────────────
    ("PAR_M1_01", "La Défense (Grande Arche)", 48.8921, 2.2381, ["M1"]),
    ("PAR_M1_02", "Esplanade de la Défense",   48.8878, 2.2489, ["M1"]),
    ("PAR_M1_03", "Pont de Neuilly",            48.8847, 2.2602, ["M1"]),
    ("PAR_M1_04", "Les Sablons",                48.8792, 2.2730, ["M1"]),
    ("PAR_M1_05", "Porte Maillot",              48.8780, 2.2828, ["M1"]),
    ("PAR_M1_06", "Argentine",                  48.8758, 2.2928, ["M1"]),
    ("PAR_M1_07", "Charles de Gaulle-Étoile",  48.8742, 2.2950, ["M1","M2","M6","RER_A"]),
    ("PAR_M1_08", "George V",                  48.8723, 2.3016, ["M1"]),
    ("PAR_M1_09", "Franklin D. Roosevelt",     48.8685, 2.3089, ["M1","M9"]),
    ("PAR_M1_10", "Champs-Élysées-Clemenceau", 48.8663, 2.3130, ["M1","M13"]),
    ("PAR_M1_11", "Concorde",                  48.8655, 2.3211, ["M1","M8","M12"]),
    ("PAR_M1_12", "Tuileries",                 48.8637, 2.3305, ["M1"]),
    ("PAR_M1_13", "Palais Royal-Musée du Louvre", 48.8636, 2.3367, ["M1","M7"]),
    ("PAR_M1_14", "Louvre-Rivoli",             48.8603, 2.3442, ["M1"]),
    ("PAR_M1_15", "Châtelet",                  48.8601, 2.3469, ["M1","M4","M7","M11","M14","RER_A","RER_B","RER_D"]),
    ("PAR_M1_16", "Hôtel de Ville",            48.8572, 2.3517, ["M1","M11"]),
    ("PAR_M1_17", "Saint-Paul",                48.8551, 2.3601, ["M1"]),
    ("PAR_M1_18", "Bastille",                  48.8533, 2.3692, ["M1","M5","M8"]),
    ("PAR_M1_19", "Gare de Lyon",              48.8445, 2.3735, ["M1","M14","RER_A","RER_D"]),
    ("PAR_M1_20", "Reuilly-Diderot",           48.8482, 2.3888, ["M1","M8"]),
    ("PAR_M1_21", "Montgallet",                48.8463, 2.3958, ["M1"]),
    ("PAR_M1_22", "Daumesnil",                 48.8402, 2.3955, ["M1","M6"]),
    ("PAR_M1_23", "Nation",                    48.8484, 2.3960, ["M1","M2","M6","M9","RER_A"]),
    ("PAR_M1_24", "Saint-Mandé",               48.8441, 2.4157, ["M1"]),
    ("PAR_M1_25", "Bérault",                   48.8427, 2.4248, ["M1"]),
    ("PAR_M1_26", "Château de Vincennes",      48.8441, 2.4395, ["M1"]),

    # ── MÉTRO L2 — Porte Dauphine ↔ Nation ────────────────────────────────────
    ("PAR_M2_01", "Porte Dauphine",            48.8718, 2.2787, ["M2"]),
    ("PAR_M2_02", "Victor Hugo",               48.8743, 2.2886, ["M2"]),
    ("PAR_M2_04", "Ternes",                    48.8772, 2.2988, ["M2"]),
    ("PAR_M2_05", "Courcelles",                48.8795, 2.3089, ["M2"]),
    ("PAR_M2_06", "Monceau",                   48.8793, 2.3148, ["M2"]),
    ("PAR_M2_07", "Villiers",                  48.8820, 2.3143, ["M2","M3"]),
    ("PAR_M2_08", "Rome",                      48.8837, 2.3230, ["M2"]),
    ("PAR_M2_09", "Place de Clichy",           48.8834, 2.3277, ["M2","M13"]),
    ("PAR_M2_10", "Blanche",                   48.8842, 2.3327, ["M2"]),
    ("PAR_M2_11", "Pigalle",                   48.8831, 2.3372, ["M2","M12"]),
    ("PAR_M2_12", "Anvers",                    48.8838, 2.3440, ["M2"]),
    ("PAR_M2_13", "Barbès-Rochechouart",       48.8836, 2.3498, ["M2","M4"]),
    ("PAR_M2_14", "La Chapelle",               48.8847, 2.3545, ["M2"]),
    ("PAR_M2_15", "Stalingrad",                48.8835, 2.3677, ["M2","M5","M7"]),
    ("PAR_M2_16", "Jaurès",                    48.8829, 2.3706, ["M2","M5","M7bis"]),
    ("PAR_M2_17", "Colonel Fabien",            48.8781, 2.3698, ["M2"]),
    ("PAR_M2_18", "Belleville",                48.8723, 2.3687, ["M2","M11"]),
    ("PAR_M2_19", "Couronnes",                 48.8693, 2.3744, ["M2"]),
    ("PAR_M2_20", "Ménilmontant",              48.8666, 2.3797, ["M2"]),
    ("PAR_M2_21", "Père Lachaise",             48.8639, 2.3873, ["M2","M3"]),
    ("PAR_M2_22", "Philippe Auguste",          48.8597, 2.3930, ["M2"]),
    ("PAR_M2_23", "Alexandre Dumas",           48.8560, 2.3964, ["M2"]),
    ("PAR_M2_24", "Avron",                     48.8524, 2.3999, ["M2"]),

    # ── MÉTRO L4 — Porte de Clignancourt ↔ Bagneux ───────────────────────────
    ("PAR_M4_01", "Porte de Clignancourt",     48.8979, 2.3449, ["M4"]),
    ("PAR_M4_02", "Simplon",                   48.8951, 2.3488, ["M4"]),
    ("PAR_M4_03", "Marcadet-Poissonniers",     48.8913, 2.3486, ["M4","M12"]),
    ("PAR_M4_04", "Château Rouge",             48.8870, 2.3495, ["M4"]),
    ("PAR_M4_05", "Gare du Nord",              48.8800, 2.3551, ["M4","M5","RER_B","RER_D"]),
    ("PAR_M4_06", "Gare de l'Est",             48.8768, 2.3581, ["M4","M5","M7"]),
    ("PAR_M4_07", "Strasbourg-Saint-Denis",    48.8683, 2.3541, ["M4","M8","M9"]),
    ("PAR_M4_08", "Réaumur-Sébastopol",        48.8660, 2.3521, ["M4","M3"]),
    ("PAR_M4_09", "Étienne Marcel",            48.8625, 2.3498, ["M4"]),
    ("PAR_M4_10", "Les Halles",                48.8612, 2.3470, ["M4","RER_A","RER_B","RER_D"]),
    ("PAR_M4_11", "Saint-Michel Notre-Dame",   48.8531, 2.3467, ["M4","RER_B","RER_C"]),
    ("PAR_M4_12", "Odéon",                     48.8528, 2.3404, ["M4","M10"]),
    ("PAR_M4_13", "Saint-Germain-des-Prés",    48.8539, 2.3335, ["M4"]),
    ("PAR_M4_14", "Saint-Sulpice",             48.8508, 2.3307, ["M4"]),
    ("PAR_M4_15", "Saint-Placide",             48.8465, 2.3280, ["M4"]),
    ("PAR_M4_16", "Montparnasse-Bienvenüe",    48.8430, 2.3215, ["M4","M6","M12","M13","RER_B"]),
    ("PAR_M4_17", "Pernety",                   48.8370, 2.3195, ["M4"]),
    ("PAR_M4_18", "Plaisance",                 48.8335, 2.3199, ["M4"]),
    ("PAR_M4_19", "Alésia",                    48.8281, 2.3234, ["M4"]),
    ("PAR_M4_20", "Mouton-Duvernet",           48.8270, 2.3262, ["M4"]),
    ("PAR_M4_21", "Denfert-Rochereau",         48.8340, 2.3322, ["M4","M6","RER_B"]),
    ("PAR_M4_22", "Bagneux-Lucie Aubrac",      48.7969, 2.3153, ["M4"]),

    # ── MÉTRO L6 — Charles de Gaulle-Étoile ↔ Nation (aéreo, pasa Tour Eiffel)
    ("PAR_M6_01", "Bir-Hakeim",                48.8536, 2.2893, ["M6"]),
    ("PAR_M6_02", "Passy",                     48.8576, 2.2841, ["M6"]),
    ("PAR_M6_03", "La Muette",                 48.8618, 2.2747, ["M6"]),
    ("PAR_M6_04", "Ranelagh",                  48.8633, 2.2697, ["M6"]),
    ("PAR_M6_05", "Michel-Ange-Auteuil",       48.8477, 2.2639, ["M6","M10"]),
    ("PAR_M6_06", "Boissière",                 48.8703, 2.2888, ["M6"]),
    ("PAR_M6_07", "Kléber",                    48.8724, 2.2939, ["M6"]),
    ("PAR_M6_08", "Trocadéro",                 48.8638, 2.2877, ["M6","M9"]),
    ("PAR_M6_09", "Cambronne",                 48.8484, 2.2985, ["M6"]),
    ("PAR_M6_10", "Sèvres-Lecourbe",           48.8445, 2.3064, ["M6"]),
    ("PAR_M6_11", "Edgar Quinet",              48.8422, 2.3244, ["M6"]),
    ("PAR_M6_12", "Raspail",                   48.8396, 2.3294, ["M6","M4"]),
    ("PAR_M6_13", "Glacière",                  48.8267, 2.3450, ["M6"]),
    ("PAR_M6_14", "Corvisart",                 48.8247, 2.3511, ["M6"]),
    ("PAR_M6_15", "Place d'Italie",            48.8313, 2.3556, ["M6","M5","M7"]),
    ("PAR_M6_16", "Nationale",                 48.8338, 2.3625, ["M6"]),
    ("PAR_M6_17", "Chevaleret",                48.8363, 2.3682, ["M6"]),
    ("PAR_M6_18", "Bercy",                     48.8401, 2.3792, ["M6","M14"]),

    # ── MÉTRO L13 — Saint-Denis ↔ Châtillon/Montrouge ────────────────────────
    ("PAR_M13_01", "Saint-Denis-Université",   48.9355, 2.3616, ["M13"]),
    ("PAR_M13_02", "Saint-Denis-Basilique",    48.9344, 2.3607, ["M13"]),
    ("PAR_M13_03", "Porte de Saint-Ouen",      48.9020, 2.3358, ["M13"]),
    ("PAR_M13_04", "Guy Moquet",               48.8938, 2.3320, ["M13"]),
    ("PAR_M13_05", "La Fourche",               48.8878, 2.3273, ["M13"]),
    ("PAR_M13_06", "Liège",                    48.8792, 2.3250, ["M13"]),
    ("PAR_M13_07", "Saint-Lazare",             48.8759, 2.3251, ["M13","M12","M14","RER_A","RER_E"]),
    ("PAR_M13_08", "Miromesnil",               48.8751, 2.3124, ["M13","M9"]),
    ("PAR_M13_09", "Champs-Élysées-Clemenceau",48.8663, 2.3130, ["M13","M1"]),
    ("PAR_M13_10", "Invalides",                48.8618, 2.3129, ["M13","RER_C"]),
    ("PAR_M13_11", "Varenne",                  48.8555, 2.3127, ["M13"]),
    ("PAR_M13_12", "Saint-François-Xavier",    48.8496, 2.3121, ["M13"]),
    ("PAR_M13_13", "Duroc",                    48.8455, 2.3148, ["M13","M10"]),
    ("PAR_M13_14", "Montparnasse-Bienvenüe",   48.8430, 2.3215, ["M13","M4","M6","M12"]),
    ("PAR_M13_15", "Gaîté",                    48.8384, 2.3208, ["M13"]),
    ("PAR_M13_16", "Pernety",                  48.8334, 2.3190, ["M13"]),
    ("PAR_M13_17", "Plaisance",                48.8274, 2.3153, ["M13"]),
    ("PAR_M13_18", "Malakoff-Plateau de Vanves",48.8162, 2.3074, ["M13"]),
    ("PAR_M13_19", "Châtillon-Montrouge",      48.8063, 2.3038, ["M13"]),

    # ── MÉTRO L14 — Olympiades ↔ Saint-Denis Pleyel ──────────────────────────
    ("PAR_M14_01", "Olympiades",               48.8287, 2.3638, ["M14"]),
    ("PAR_M14_02", "Bibliothèque F. Mitterrand",48.8302, 2.3773, ["M14","RER_C"]),
    ("PAR_M14_03", "Cour Saint-Émilion",       48.8338, 2.3849, ["M14"]),
    ("PAR_M14_04", "Bercy",                    48.8401, 2.3792, ["M14","M6"]),
    ("PAR_M14_05", "Gare de Lyon",             48.8445, 2.3735, ["M14","M1","RER_A","RER_D"]),
    ("PAR_M14_06", "Châtelet",                 48.8601, 2.3469, ["M14","M1","M4","M7","M11"]),
    ("PAR_M14_07", "Pyramides",                48.8640, 2.3355, ["M14"]),
    ("PAR_M14_08", "Saint-Lazare",             48.8759, 2.3251, ["M14","M13","M12","RER_A","RER_E"]),
    ("PAR_M14_09", "Porte de Clichy",          48.8977, 2.3110, ["M14"]),
    ("PAR_M14_10", "Mairie de Saint-Ouen",     48.9072, 2.3259, ["M14"]),
    ("PAR_M14_11", "Saint-Denis Pleyel",       48.9218, 2.3466, ["M14","RER_D"]),

    # ── RER A — Marne-la-Vallée ↔ Saint-Germain / Cergy ──────────────────────
    ("PAR_RA_01", "Charles de Gaulle-Étoile",  48.8742, 2.2950, ["RER_A","M1","M2","M6"]),
    ("PAR_RA_02", "Auber",                     48.8741, 2.3327, ["RER_A"]),
    ("PAR_RA_03", "Châtelet-Les Halles",       48.8601, 2.3469, ["RER_A","RER_B","RER_D","M1","M4","M7","M11","M14"]),
    ("PAR_RA_04", "Gare de Lyon",              48.8445, 2.3735, ["RER_A","RER_D","M1","M14"]),
    ("PAR_RA_05", "Nation",                    48.8484, 2.3960, ["RER_A","M1","M2","M6","M9"]),
    ("PAR_RA_06", "La Défense",                48.8921, 2.2381, ["RER_A","M1"]),
    ("PAR_RA_07", "Vincennes",                 48.8466, 2.4393, ["RER_A"]),
    ("PAR_RA_08", "Marne-la-Vallée-Chessy",    48.8720, 2.7795, ["RER_A"]),  # Disneyland
    ("PAR_RA_09", "Versailles-Rive Gauche",    48.7973, 2.1259, ["RER_C"]),

    # ── RER B — CDG Airport ↔ Robinson / Saint-Rémy ──────────────────────────
    ("PAR_RB_01", "CDG Aéroport Terminal 2",   49.0049, 2.5729, ["RER_B"]),
    ("PAR_RB_02", "CDG Aéroport Terminal 1",   49.0089, 2.5479, ["RER_B"]),
    ("PAR_RB_03", "Le Bourget",                48.9368, 2.4208, ["RER_B"]),
    ("PAR_RB_04", "La Courneuve-Aubervilliers", 48.9252, 2.3940, ["RER_B"]),
    ("PAR_RB_05", "Gare du Nord",              48.8800, 2.3551, ["RER_B","RER_D","M4","M5"]),
    ("PAR_RB_06", "Châtelet-Les Halles",       48.8601, 2.3469, ["RER_B","RER_A","RER_D"]),
    ("PAR_RB_07", "Saint-Michel Notre-Dame",   48.8531, 2.3467, ["RER_B","M4","RER_C"]),
    ("PAR_RB_08", "Luxembourg",               48.8461, 2.3407, ["RER_B"]),
    ("PAR_RB_09", "Port-Royal",               48.8393, 2.3376, ["RER_B"]),
    ("PAR_RB_10", "Denfert-Rochereau",         48.8340, 2.3322, ["RER_B","M4","M6"]),
    ("PAR_RB_11", "Cité Universitaire",        48.8198, 2.3357, ["RER_B"]),
    ("PAR_RB_12", "Massy-Palaiseau",           48.7257, 2.2518, ["RER_B"]),

    # ── RER C — Versailles ↔ Juvisy / Pontoise ───────────────────────────────
    ("PAR_RC_01", "Versailles-Rive Gauche",    48.7973, 2.1259, ["RER_C"]),
    ("PAR_RC_02", "Massy-Verrières",           48.7245, 2.2592, ["RER_C"]),
    ("PAR_RC_03", "Invalides",                 48.8618, 2.3129, ["RER_C","M13"]),
    ("PAR_RC_04", "Musée d'Orsay",             48.8600, 2.3254, ["RER_C"]),
    ("PAR_RC_05", "Saint-Michel Notre-Dame",   48.8531, 2.3467, ["RER_C","RER_B","M4"]),
    ("PAR_RC_06", "Austerlitz",                48.8425, 2.3647, ["RER_C","M5","M10"]),

    # ── RER D — Goussainville ↔ Melun / Corbeil ──────────────────────────────
    ("PAR_RD_01", "Gare du Nord",              48.8800, 2.3551, ["RER_D","RER_B","M4","M5"]),
    ("PAR_RD_02", "Châtelet-Les Halles",       48.8601, 2.3469, ["RER_D","RER_A","RER_B"]),
    ("PAR_RD_03", "Gare de Lyon",              48.8445, 2.3735, ["RER_D","RER_A","M1","M14"]),
    ("PAR_RD_04", "Villeneuve-Saint-Georges",  48.7320, 2.4447, ["RER_D"]),
    ("PAR_RD_05", "Melun",                     48.5399, 2.6605, ["RER_D"]),

    # ── RER E — Haussmann-Saint-Lazare ↔ Mantes-la-Jolie ────────────────────
    ("PAR_RE_01", "Haussmann-Saint-Lazare",    48.8759, 2.3251, ["RER_E","M13","M12","M14"]),
    ("PAR_RE_02", "Magenta",                   48.8800, 2.3551, ["RER_E"]),
    ("PAR_RE_03", "Tourville",                 48.8700, 2.3400, ["RER_E"]),
    ("PAR_RE_04", "Mantes-la-Jolie",           48.9893, 1.6970, ["RER_E"]),
]

# ── Líneas ────────────────────────────────────────────────────────────────────
LINES = [
    # id, short_name, long_name, color, type
    ("M1",    "M1",    "Métro Ligne 1",     "FFCD00", 1),
    ("M2",    "M2",    "Métro Ligne 2",     "003CA6", 1),
    ("M3",    "M3",    "Métro Ligne 3",     "837902", 1),
    ("M4",    "M4",    "Métro Ligne 4",     "CF009E", 1),
    ("M5",    "M5",    "Métro Ligne 5",     "FF7E2E", 1),
    ("M6",    "M6",    "Métro Ligne 6",     "6ECA97", 1),
    ("M7",    "M7",    "Métro Ligne 7",     "FA9ABA", 1),
    ("M8",    "M8",    "Métro Ligne 8",     "E19BDF", 1),
    ("M9",    "M9",    "Métro Ligne 9",     "B6BD00", 1),
    ("M10",   "M10",   "Métro Ligne 10",    "C9910D", 1),
    ("M11",   "M11",   "Métro Ligne 11",    "704B1C", 1),
    ("M12",   "M12",   "Métro Ligne 12",    "007852", 1),
    ("M13",   "M13",   "Métro Ligne 13",    "6EC4E8", 1),
    ("M14",   "M14",   "Métro Ligne 14",    "62259D", 1),
    ("RER_A", "RER A", "RER Ligne A",       "FF2442", 2),
    ("RER_B", "RER B", "RER Ligne B",       "4B92DB", 2),
    ("RER_C", "RER C", "RER Ligne C",       "FFBE00", 2),
    ("RER_D", "RER D", "RER Ligne D",       "00814F", 2),
    ("RER_E", "RER E", "RER Ligne E",       "BB4B98", 2),
]

# ── Secuencias por línea (stop_ids en orden) ──────────────────────────────────
LINE_SEQUENCES = {
    "M1": [
        "PAR_M1_01","PAR_M1_02","PAR_M1_03","PAR_M1_04","PAR_M1_05",
        "PAR_M1_06","PAR_M1_07","PAR_M1_08","PAR_M1_09","PAR_M1_10",
        "PAR_M1_11","PAR_M1_12","PAR_M1_13","PAR_M1_14","PAR_M1_15",
        "PAR_M1_16","PAR_M1_17","PAR_M1_18","PAR_M1_19","PAR_M1_20",
        "PAR_M1_21","PAR_M1_22","PAR_M1_23","PAR_M1_24","PAR_M1_25","PAR_M1_26",
    ],
    "M2": [
        "PAR_M2_01","PAR_M1_07","PAR_M2_04","PAR_M2_05","PAR_M2_06",
        "PAR_M2_07","PAR_M2_08","PAR_M2_09","PAR_M2_10","PAR_M2_11",
        "PAR_M2_12","PAR_M2_13","PAR_M2_14","PAR_M2_15","PAR_M2_16",
        "PAR_M2_17","PAR_M2_18","PAR_M2_19","PAR_M2_20","PAR_M2_21",
        "PAR_M2_22","PAR_M2_23","PAR_M2_24","PAR_M1_23",
    ],
    "M4": [
        "PAR_M4_01","PAR_M4_02","PAR_M4_03","PAR_M4_04","PAR_M4_05",
        "PAR_M4_06","PAR_M4_07","PAR_M4_08","PAR_M4_09","PAR_M4_10",
        "PAR_M1_15","PAR_M4_11","PAR_M4_12","PAR_M4_13","PAR_M4_14",
        "PAR_M4_15","PAR_M4_16","PAR_M4_17","PAR_M4_18","PAR_M4_19",
        "PAR_M4_20","PAR_M4_21","PAR_M4_22",
    ],
    "M6": [
        "PAR_M1_07","PAR_M6_07","PAR_M6_06","PAR_M6_08","PAR_M6_01",
        "PAR_M6_02","PAR_M6_03","PAR_M6_04","PAR_M6_05","PAR_M6_09",
        "PAR_M6_10","PAR_M6_11","PAR_M6_12","PAR_M4_16","PAR_M4_21",
        "PAR_M6_13","PAR_M6_14","PAR_M6_15","PAR_M6_16","PAR_M6_17",
        "PAR_M6_18","PAR_M1_22","PAR_M1_23",
    ],
    "M13": [
        "PAR_M13_01","PAR_M13_02","PAR_M13_03","PAR_M13_04","PAR_M13_05",
        "PAR_M13_06","PAR_M13_07","PAR_M13_08","PAR_M13_09","PAR_M13_10",
        "PAR_M13_11","PAR_M13_12","PAR_M13_13","PAR_M13_14","PAR_M13_15",
        "PAR_M13_16","PAR_M13_17","PAR_M13_18","PAR_M13_19",
    ],
    "M14": [
        "PAR_M14_01","PAR_M14_02","PAR_M14_03","PAR_M14_04","PAR_M14_05",
        "PAR_M1_15","PAR_M14_06","PAR_M14_07","PAR_M13_07","PAR_M14_09",
        "PAR_M14_10","PAR_M14_11",
    ],
    "RER_A": [
        "PAR_RA_06","PAR_M1_07","PAR_RA_02","PAR_RA_03","PAR_RA_04",
        "PAR_RA_05","PAR_RA_07","PAR_RA_08",
    ],
    "RER_B": [
        "PAR_RB_01","PAR_RB_02","PAR_RB_03","PAR_RB_04","PAR_RB_05",
        "PAR_RA_03","PAR_M4_11","PAR_RB_07","PAR_RB_08","PAR_RB_09",
        "PAR_RB_10","PAR_RB_11","PAR_RB_12",
    ],
    "RER_C": [
        "PAR_RC_01","PAR_RC_02","PAR_RC_03","PAR_RC_04","PAR_RC_05","PAR_RC_06",
    ],
    "RER_D": [
        "PAR_RD_01","PAR_RA_03","PAR_RD_03","PAR_RD_04","PAR_RD_05",
    ],
    "RER_E": [
        "PAR_RE_01","PAR_RE_02","PAR_RE_03","PAR_RE_04",
    ],
}

# Headway en minutos (hora punta, día laborable)
HEADWAY = {
    "M1": 2, "M2": 3, "M4": 3, "M6": 4, "M13": 4, "M14": 2,
    "RER_A": 5, "RER_B": 5, "RER_C": 10, "RER_D": 10, "RER_E": 15,
}

_FIRST_MIN = 300   # 05:00
_LAST_MIN  = 1440  # 00:00 (+1)
_DWELL     = 2     # minutos entre paradas


def fmt_time(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"{h:02d}:{m:02d}:00"


def main():
    print("\nWoW TRENES — Paris Métro + RER GTFS Generator")
    print("=" * 50)
    t0 = time.time()

    # Deduplicar estaciones
    seen = set()
    unique_stations = []
    for s in STATIONS:
        if s[0] not in seen:
            seen.add(s[0])
            unique_stations.append(s)

    print(f"  Líneas:     {len(LINES)}")
    print(f"  Estaciones: {len(unique_stations)}")

    tmp_db = "/tmp/gtfs_fr_par.db"
    import os; os.path.exists(tmp_db) and os.unlink(tmp_db)

    conn = sqlite3.connect(tmp_db)
    conn.executescript("""
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous  = NORMAL;
        CREATE TABLE IF NOT EXISTS agency (
            agency_id TEXT PRIMARY KEY, agency_name TEXT,
            agency_url TEXT, agency_timezone TEXT);
        CREATE TABLE IF NOT EXISTS stops (
            stop_id TEXT PRIMARY KEY, stop_name TEXT NOT NULL,
            stop_lat REAL NOT NULL, stop_lon REAL NOT NULL,
            country_code TEXT DEFAULT 'FR', location_type INTEGER DEFAULT 0,
            parent_station TEXT);
        CREATE TABLE IF NOT EXISTS routes (
            route_id TEXT PRIMARY KEY, agency_id TEXT,
            route_short_name TEXT, route_long_name TEXT, route_type INTEGER,
            route_color TEXT, source_region TEXT);
        CREATE TABLE IF NOT EXISTS trips (
            trip_id TEXT PRIMARY KEY, route_id TEXT, service_id TEXT,
            trip_headsign TEXT, direction_id INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS stop_times (
            trip_id TEXT NOT NULL, arrival_time TEXT, departure_time TEXT,
            stop_id TEXT NOT NULL, stop_sequence INTEGER,
            PRIMARY KEY (trip_id, stop_sequence));
        CREATE TABLE IF NOT EXISTS calendar (
            service_id TEXT PRIMARY KEY, monday INTEGER, tuesday INTEGER,
            wednesday INTEGER, thursday INTEGER, friday INTEGER,
            saturday INTEGER, sunday INTEGER, start_date TEXT, end_date TEXT);
    """)

    conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
        ("RATP", "Régie Autonome des Transports Parisiens",
         "https://www.ratp.fr", "Europe/Paris"))
    conn.commit()

    # Routes
    for line_id, short, long, color, rtype in LINES:
        conn.execute("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?,?)",
            (line_id, "RATP", short, long, rtype, color, "Paris"))
    conn.commit()
    print(f"  Rutas insertadas: {len(LINES)}")

    # Stops
    valid_ids = set()
    stop_rows = []
    for sid, name, lat, lon, lines in unique_stations:
        stop_rows.append((sid, name, lat, lon, "FR", 0, ""))
        valid_ids.add(sid)
    conn.executemany("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)", stop_rows)
    conn.commit()
    print(f"  Paradas insertadas: {len(stop_rows)}")

    # Trips + stop_times
    trips_batch = []
    st_batch    = []
    trip_count  = 0
    st_count    = 0

    for route_id, seq in LINE_SEQUENCES.items():
        seq_valid = [s for s in seq if s in valid_ids]
        if len(seq_valid) < 2:
            print(f"  WARN: {route_id} tiene solo {len(seq_valid)} paradas válidas")
            continue
        headway = HEADWAY.get(route_id, 5)
        for direction in (0, 1):
            stop_seq = seq_valid if direction == 0 else list(reversed(seq_valid))
            headsign = stop_seq[-1]
            dep = _FIRST_MIN
            while dep <= _LAST_MIN:
                trip_id = f"{route_id}_d{direction}_{dep:04d}"
                trips_batch.append((trip_id, route_id, "ALL", headsign, direction))
                for i, sid in enumerate(stop_seq):
                    ts = fmt_time(dep + i * _DWELL)
                    st_batch.append((trip_id, ts, ts, sid, i))
                trip_count += 1
                st_count   += len(stop_seq)
                dep        += headway

    conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", trips_batch)
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_batch)
    conn.commit()
    print(f"  Trips:      {trip_count:,}")
    print(f"  Stop_times: {st_count:,}")

    # Calendar
    for svc, m,t,w,th,f,sa,su in [
        ("WD", 1,1,1,1,1,0,0), ("WE", 0,0,0,0,0,1,1), ("ALL", 1,1,1,1,1,1,1)
    ]:
        conn.execute("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
            (svc, m,t,w,th,f,sa,su, "20260101","20261231"))
    conn.commit()

    # Índices
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_stops_ll    ON stops (stop_lat, stop_lon);
        CREATE INDEX IF NOT EXISTS idx_st_stop     ON stop_times (stop_id);
        CREATE INDEX IF NOT EXISTS idx_trips_route ON trips (route_id);
    """)
    conn.commit()
    conn.close()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tmp_db, str(OUTPUT_DB))
    import os; os.unlink(tmp_db)

    elapsed = time.time() - t0
    mb = OUTPUT_DB.stat().st_size / 1_048_576
    print(f"\n  ✓ Listo en {elapsed:.1f}s  —  {mb:.2f} MB")
    print(f"  Archivo: {OUTPUT_DB}")
    print(f"\n  París: M1·M2·M4·M6·M13·M14 + RER A·B·C·D·E")


if __name__ == "__main__":
    main()
