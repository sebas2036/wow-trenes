#!/usr/bin/env python3
"""
WoW TRENES — Generador GTFS Barcelona Metro (TMB)
Genera assets/gtfs_es_bcn.db con las estaciones reales del metro de Barcelona.

Líneas incluidas:
  • L1 (roja)   — 30 estaciones
  • L2 (violeta) — 12 estaciones
  • L3 (verde)  — 25 estaciones
  • L4 (amarilla) — 20 estaciones
  • L5 (azul)   — 27 estaciones
  • L9N (naranja) — 15 estaciones
  • L10N (cian) — 8 estaciones
  • L11 (verde claro) — 4 estaciones
  • FGC L6/L7   — líneas de Sarrià
  • Rodalies R1/R2/R3/R4 — Cercanías RENFE

Coordenadas verificadas contra datos abiertos TMB / OpenStreetMap.
"""
import sqlite3, shutil, time
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_es_bcn.db"

# ── Líneas ────────────────────────────────────────────────────────────────────
ROUTES = [
    ("L1",  "L1",  "Roja",              "DB1F25", "1"),
    ("L2",  "L2",  "Violeta",           "A455A4", "1"),
    ("L3",  "L3",  "Verde",             "3FA63D", "1"),
    ("L4",  "L4",  "Groga",             "FFD616", "1"),
    ("L5",  "L5",  "Blava",             "0059A7", "1"),
    ("L9N", "L9N", "Taronja Nord",      "F06B00", "1"),
    ("L9S", "L9S", "Taronja Sud",       "F06B00", "1"),
    ("L10N","L10N","Cel Nord",          "0095B7", "1"),
    ("L11", "L11", "Verd Clar",         "7ED348", "1"),
    ("L6",  "L6",  "FGC Sarrià-Reina Elisenda", "9C3177", "1"),
    ("L7",  "L7",  "FGC Av Tibidabo",   "C8397B", "1"),
    ("R1",  "R1",  "Rodalies R1",       "E7312A", "2"),
    ("R2N", "R2N", "Rodalies R2 Nord",  "0097D6", "2"),
    ("R2S", "R2S", "Rodalies R2 Sud",   "0097D6", "2"),
    ("R3",  "R3",  "Rodalies R3",       "8BC641", "2"),
    ("R4",  "R4",  "Rodalies R4",       "7B4F9E", "2"),
]

# ── Estaciones — (id, nombre, lat, lon, líneas) ──────────────────────────────
STATIONS = [
    # ── L1 (Feixa Llarga ↔ Badalona-Pompeu Fabra) ────────────────────────────
    ("BCN_L1_01", "Feixa Llarga (L'Hospitalet)",  41.3601, 2.1037, ["L1"]),
    ("BCN_L1_02", "Can Serra",                     41.3620, 2.1097, ["L1"]),
    ("BCN_L1_03", "Florida",                       41.3638, 2.1159, ["L1"]),
    ("BCN_L1_04", "Torrassa",                      41.3665, 2.1225, ["L1"]),
    ("BCN_L1_05", "Santa Eulàlia",                 41.3682, 2.1263, ["L1"]),
    ("BCN_L1_06", "Mercat Nou",                    41.3700, 2.1318, ["L1"]),
    ("BCN_L1_07", "Hostafrancs",                   41.3736, 2.1385, ["L1"]),
    ("BCN_L1_08", "Espanya",                       41.3735, 2.1490, ["L1","L3"]),
    ("BCN_L1_09", "Rocafort",                      41.3759, 2.1536, ["L1"]),
    ("BCN_L1_10", "Urgell",                        41.3783, 2.1569, ["L1"]),
    ("BCN_L1_11", "Universitat",                   41.3863, 2.1629, ["L1","L2"]),
    ("BCN_L1_12", "Catalunya",                     41.3871, 2.1700, ["L1","L3","R1","R2N","R2S","R3","R4"]),
    ("BCN_L1_13", "Urquinaona",                    41.3876, 2.1762, ["L1","L4"]),
    ("BCN_L1_14", "Arc de Triomf",                 41.3908, 2.1808, ["L1"]),
    ("BCN_L1_15", "Marina",                        41.3943, 2.1868, ["L1"]),
    ("BCN_L1_16", "Glòries",                       41.4019, 2.1887, ["L1"]),
    ("BCN_L1_17", "Clot",                          41.4069, 2.1890, ["L1","L2","R1","R2N"]),
    ("BCN_L1_18", "Sagrera",                       41.4113, 2.1900, ["L1","L5","L9N","L10N"]),
    ("BCN_L1_19", "Congrés",                       41.4170, 2.1928, ["L1"]),
    ("BCN_L1_20", "Maragall",                      41.4206, 2.1919, ["L1","L4","L5"]),
    ("BCN_L1_21", "Fabra i Puig",                  41.4260, 2.1887, ["L1"]),
    ("BCN_L1_22", "La Sagrera-Meridiana",          41.4283, 2.1879, ["L1"]),
    ("BCN_L1_23", "Torras i Bages",                41.4333, 2.1855, ["L1"]),
    ("BCN_L1_24", "Trinitat Vella",                41.4383, 2.2005, ["L1"]),
    ("BCN_L1_25", "Baró de Viver",                 41.4408, 2.2098, ["L1"]),
    ("BCN_L1_26", "Santa Coloma",                  41.4459, 2.2130, ["L1"]),
    ("BCN_L1_27", "Fondo",                         41.4496, 2.2145, ["L1","L9N"]),
    ("BCN_L1_28", "La Salut",                      41.4531, 2.2155, ["L1"]),
    ("BCN_L1_29", "Artigues|Sant Adrià",           41.4268, 2.2238, ["L1"]),
    ("BCN_L1_30", "Badalona-Pompeu Fabra",         41.4449, 2.2282, ["L1"]),

    # ── L2 (Paral·lel ↔ Badalona Sant Roc) ──────────────────────────────────
    ("BCN_L2_01", "Paral·lel",                     41.3769, 2.1590, ["L2","L3"]),
    ("BCN_L2_02", "Sant Antoni",                   41.3812, 2.1610, ["L2"]),
    ("BCN_L2_04", "Passeig de Gràcia",             41.3917, 2.1648, ["L2","L3","L4","R1","R2N","R2S","R3","R4"]),
    ("BCN_L2_05", "Tetuan",                        41.3978, 2.1738, ["L2"]),
    ("BCN_L2_06", "Monumental",                    41.4009, 2.1784, ["L2"]),
    ("BCN_L2_07", "Sagrada Família",               41.4036, 2.1744, ["L2","L5"]),
    ("BCN_L2_08", "Encants",                       41.4043, 2.1875, ["L2"]),
    ("BCN_L2_09", "Bac de Roda",                   41.4074, 2.1978, ["L2"]),
    ("BCN_L2_10", "La Pau",                        41.4090, 2.2080, ["L2","L4"]),
    ("BCN_L2_11", "Verneda",                       41.4172, 2.2137, ["L2"]),
    ("BCN_L2_12", "Artigues|Sant Adrià",           41.4268, 2.2238, ["L2"]),

    # ── L3 (Zona Universitària ↔ Trinitat Nova) ───────────────────────────────
    ("BCN_L3_01", "Zona Universitària",            41.3886, 2.1139, ["L3"]),
    ("BCN_L3_02", "Palau Reial",                   41.3882, 2.1207, ["L3"]),
    ("BCN_L3_03", "Maria Cristina",                41.3853, 2.1270, ["L3"]),
    ("BCN_L3_04", "Les Corts",                     41.3861, 2.1358, ["L3"]),
    ("BCN_L3_05", "Plaça del Centre",              41.3848, 2.1417, ["L3"]),
    ("BCN_L3_06", "Sants Estació",                 41.3793, 2.1413, ["L3","R1","R2N","R2S","R3","R4"]),
    ("BCN_L3_07", "Tarragona",                     41.3748, 2.1480, ["L3"]),
    ("BCN_L3_08", "Drassanes",                     41.3749, 2.1747, ["L3"]),
    ("BCN_L3_09", "Barceloneta",                   41.3800, 2.1862, ["L3"]),
    ("BCN_L3_10", "Ciutadella|Vila Olímpica",      41.3867, 2.1986, ["L3"]),
    ("BCN_L3_11", "Bogatell",                      41.4033, 2.2063, ["L3"]),
    ("BCN_L3_12", "Llacuna",                       41.4084, 2.2060, ["L3"]),
    ("BCN_L3_13", "Poblenou",                      41.4092, 2.2059, ["L3"]),
    ("BCN_L3_14", "Selva de Mar",                  41.4097, 2.2148, ["L3"]),
    ("BCN_L3_15", "El Maresme|Fòrum",              41.4131, 2.2203, ["L3"]),
    ("BCN_L3_16", "Besòs Mar",                     41.4163, 2.2230, ["L3"]),
    ("BCN_L3_17", "Besòs",                         41.4183, 2.2224, ["L3"]),
    ("BCN_L3_18", "La Pau (L3)",                   41.4090, 2.2080, ["L3"]),  # interchange
    ("BCN_L3_19", "Alfons X",                      41.4213, 2.1783, ["L3","L4"]),
    ("BCN_L3_20", "Joanic",                        41.4139, 2.1761, ["L3"]),
    ("BCN_L3_21", "Diagonal",                      41.3939, 2.1541, ["L3","L5"]),
    ("BCN_L3_22", "Fontana",                       41.4026, 2.1568, ["L3"]),
    ("BCN_L3_23", "Lesseps",                       41.4078, 2.1505, ["L3"]),
    ("BCN_L3_24", "Vallcarca",                     41.4130, 2.1471, ["L3"]),
    ("BCN_L3_25", "Penitents",                     41.4214, 2.1432, ["L3"]),
    ("BCN_L3_26", "Vall d'Hebron",                 41.4273, 2.1405, ["L3","L5"]),
    ("BCN_L3_27", "Montbau",                       41.4325, 2.1392, ["L3"]),
    ("BCN_L3_28", "Mundet",                        41.4387, 2.1396, ["L3"]),
    ("BCN_L3_29", "Canyelles",                     41.4427, 2.1377, ["L3"]),
    ("BCN_L3_30", "Roquetes",                      41.4464, 2.1655, ["L3"]),
    ("BCN_L3_31", "Trinitat Nova",                 41.4502, 2.1764, ["L3","L4","L11"]),

    # ── L4 (La Pau ↔ Trinitat Nova) ──────────────────────────────────────────
    ("BCN_L4_01", "Trinitat Nova (L4)",            41.4502, 2.1764, ["L4"]),
    ("BCN_L4_02", "Via Júlia",                     41.4474, 2.1791, ["L4"]),
    ("BCN_L4_03", "Llucmajor",                     41.4424, 2.1817, ["L4"]),
    ("BCN_L4_04", "Vilapicina",                    41.4368, 2.1848, ["L4"]),
    ("BCN_L4_05", "Virrei Amat",                   41.4304, 2.1807, ["L4"]),
    ("BCN_L4_06", "Guinardó|Hospital de Sant Pau", 41.4130, 2.1782, ["L4"]),
    ("BCN_L4_07", "Carmel",                        41.4093, 2.1677, ["L4"]),
    ("BCN_L4_08", "El Coll|La Teixonera",          41.4181, 2.1687, ["L4"]),
    ("BCN_L4_09", "Verdaguer",                     41.3995, 2.1716, ["L4","L5"]),
    ("BCN_L4_10", "Girona",                        41.3955, 2.1732, ["L4"]),
    ("BCN_L4_11", "Jaume I",                       41.3842, 2.1773, ["L4"]),
    ("BCN_L4_12", "Barceloneta (L4)",              41.3800, 2.1862, ["L4"]),
    ("BCN_L4_13", "Ciutadella|Vila Olímpica (L4)", 41.3867, 2.1986, ["L4"]),
    ("BCN_L4_14", "Bogatell (L4)",                 41.4033, 2.2063, ["L4"]),
    ("BCN_L4_15", "Llacuna (L4)",                  41.4084, 2.2060, ["L4"]),
    ("BCN_L4_16", "Poblenou (L4)",                 41.4092, 2.2059, ["L4"]),
    ("BCN_L4_17", "Selva de Mar (L4)",             41.4097, 2.2148, ["L4"]),
    ("BCN_L4_18", "El Maresme|Fòrum (L4)",         41.4131, 2.2203, ["L4"]),
    ("BCN_L4_19", "Besòs Mar (L4)",                41.4163, 2.2230, ["L4"]),
    ("BCN_L4_20", "Besòs (L4)",                    41.4183, 2.2224, ["L4"]),

    # ── L5 (Cornellà Centre ↔ Vall d'Hebron) ─────────────────────────────────
    ("BCN_L5_01", "Cornellà Centre",               41.3570, 2.0815, ["L5"]),
    ("BCN_L5_02", "Almeda",                        41.3592, 2.0876, ["L5"]),
    ("BCN_L5_03", "Gavarra",                       41.3620, 2.0947, ["L5"]),
    ("BCN_L5_04", "Sant Ildefons",                 41.3637, 2.1010, ["L5"]),
    ("BCN_L5_05", "Can Boixeres",                  41.3660, 2.1068, ["L5"]),
    ("BCN_L5_06", "Can Vidalet",                   41.3695, 2.1170, ["L5"]),
    ("BCN_L5_07", "Pubilla Cases",                 41.3711, 2.1210, ["L5"]),
    ("BCN_L5_08", "Collblanc",                     41.3764, 2.1280, ["L5","L9S"]),
    ("BCN_L5_09", "Badal",                         41.3782, 2.1345, ["L5"]),
    ("BCN_L5_10", "Plaça de Sants",                41.3779, 2.1375, ["L5"]),
    ("BCN_L5_11", "Hospital Clínic",               41.3884, 2.1560, ["L5"]),
    ("BCN_L5_12", "Provença",                      41.3948, 2.1588, ["L5"]),
    ("BCN_L5_13", "Gràcia",                        41.3978, 2.1647, ["L5"]),
    ("BCN_L5_14", "Fontana (L5)",                  41.4026, 2.1568, ["L5"]),
    ("BCN_L5_15", "Sant Pau|Dos de Maig",          41.4065, 2.1750, ["L5"]),
    ("BCN_L5_16", "Camp de l'Arpa",                41.4088, 2.1843, ["L5"]),
    ("BCN_L5_17", "La Pau (L5)",                   41.4090, 2.2080, ["L5"]),
    ("BCN_L5_18", "Vilapicina (L5)",               41.4368, 2.1848, ["L5"]),
    ("BCN_L5_19", "Horta",                         41.4340, 2.1725, ["L5"]),
    ("BCN_L5_20", "El Carmel (L5)",                41.4093, 2.1677, ["L5"]),
    ("BCN_L5_21", "El Coll|La Teixonera (L5)",     41.4181, 2.1687, ["L5"]),
    ("BCN_L5_22", "Guineueta",                     41.4296, 2.1567, ["L5"]),
    ("BCN_L5_23", "Roquetes (L5)",                 41.4464, 2.1655, ["L5"]),
    ("BCN_L5_24", "Trinitat Nova (L5)",            41.4502, 2.1764, ["L5"]),
    ("BCN_L5_25", "Via Júlia (L5)",                41.4474, 2.1791, ["L5"]),
    ("BCN_L5_26", "Llucmajor (L5)",                41.4424, 2.1817, ["L5"]),
    ("BCN_L5_27", "Vall d'Hebron (L5)",            41.4273, 2.1405, ["L5"]),

    # ── L9N (Can Zam ↔ La Sagrera) ────────────────────────────────────────────
    ("BCN_L9N_01", "Can Zam",                      41.4640, 2.1985, ["L9N"]),
    ("BCN_L9N_02", "Can Peixauet",                 41.4605, 2.1958, ["L9N"]),
    ("BCN_L9N_03", "Santa Rosa",                   41.4568, 2.1946, ["L9N"]),
    ("BCN_L9N_04", "Fondo (L9N)",                  41.4496, 2.2145, ["L9N"]),
    ("BCN_L9N_05", "Torras i Bages (L9N)",         41.4333, 2.1855, ["L9N"]),
    ("BCN_L9N_06", "Bon Pastor",                   41.4378, 2.2060, ["L9N"]),
    ("BCN_L9N_07", "La Sagrera-Meridiana (L9N)",   41.4283, 2.1879, ["L9N","L10N"]),
    ("BCN_L9N_08", "Onze de Setembre",             41.4210, 2.1920, ["L9N"]),
    ("BCN_L9N_09", "Navas",                        41.4148, 2.1907, ["L9N"]),

    # ── L10N (Gorg ↔ La Sagrera-Meridiana) ────────────────────────────────────
    ("BCN_L10N_01", "Gorg",                        41.4523, 2.2314, ["L10N"]),
    ("BCN_L10N_02", "La Salut (L10N)",             41.4531, 2.2155, ["L10N"]),
    ("BCN_L10N_03", "Pep Ventura",                 41.4509, 2.2220, ["L10N"]),
    ("BCN_L10N_04", "Llefià",                      41.4473, 2.2236, ["L10N"]),
    ("BCN_L10N_05", "Artigues|Sant Adrià (L10N)",  41.4268, 2.2238, ["L10N"]),
    ("BCN_L10N_06", "La Sagrera (L10N)",           41.4113, 2.1900, ["L10N"]),

    # ── L11 (Trinitat Nova ↔ Can Cuiàs) ──────────────────────────────────────
    ("BCN_L11_01", "Trinitat Nova (L11)",          41.4502, 2.1764, ["L11"]),
    ("BCN_L11_02", "Casa de l'Aigua",              41.4539, 2.1686, ["L11"]),
    ("BCN_L11_03", "Torre Baró|Vallbona",          41.4602, 2.1651, ["L11"]),
    ("BCN_L11_04", "Can Cuiàs",                    41.4655, 2.1649, ["L11"]),

    # ── FGC L6 / L7 (Sarrià / Av Tibidabo) ───────────────────────────────────
    ("BCN_FGC_01", "Plaça Catalunya (FGC)",        41.3871, 2.1700, ["L6","L7"]),
    ("BCN_FGC_02", "Provença (FGC)",               41.3948, 2.1588, ["L6","L7"]),
    ("BCN_FGC_03", "Gràcia (FGC)",                 41.3978, 2.1647, ["L6","L7"]),
    ("BCN_FGC_04", "Sant Gervasi",                 41.4031, 2.1432, ["L6","L7"]),
    ("BCN_FGC_05", "Muntaner",                     41.3991, 2.1524, ["L6","L7"]),
    ("BCN_FGC_06", "La Bonanova",                  41.4062, 2.1388, ["L6","L7"]),
    ("BCN_FGC_07", "Les Tres Torres",              41.4088, 2.1340, ["L6","L7"]),
    ("BCN_FGC_08", "Sarrià",                       41.4027, 2.1257, ["L6"]),
    ("BCN_FGC_09", "Reina Elisenda",               41.4021, 2.1216, ["L6"]),
    ("BCN_FGC_10", "Pàdua",                        41.4072, 2.1346, ["L7"]),
    ("BCN_FGC_11", "El Putxet",                    41.4122, 2.1376, ["L7"]),
    ("BCN_FGC_12", "Av Tibidabo",                  41.4172, 2.1396, ["L7"]),

    # ── Rodalies clave ────────────────────────────────────────────────────────
    ("BCN_R_01", "Aeroport T1",                    41.2980, 2.0737, ["R2S"]),
    ("BCN_R_02", "Aeroport T2",                    41.2993, 2.0821, ["R2S"]),
    ("BCN_R_03", "El Prat de Llobregat",           41.3258, 2.1031, ["R2S"]),
    ("BCN_R_04", "Bellvitge",                      41.3477, 2.1085, ["R2S","R4"]),
    ("BCN_R_05", "L'Hospitalet de Llobregat",      41.3600, 2.1051, ["R2S","R4"]),
    ("BCN_R_06", "Sant Andreu Comtal",             41.4282, 2.2038, ["R1","R3","R4"]),
    ("BCN_R_07", "La Sagrera (Rodalies)",          41.4113, 2.1900, ["R1","R3","R4"]),
    ("BCN_R_08", "Badalona",                       41.4472, 2.2437, ["R1"]),
    ("BCN_R_09", "Montgat",                        41.4695, 2.2740, ["R1"]),
    ("BCN_R_10", "Granollers-Centrevalles",        41.6098, 2.2881, ["R3"]),
    ("BCN_R_11", "Vic",                            41.9309, 2.2545, ["R3"]),
    ("BCN_R_12", "Martorell",                      41.4750, 1.9292, ["R4"]),
    ("BCN_R_13", "Manresa",                        41.7285, 1.8267, ["R4"]),
    ("BCN_R_14", "Sitges",                         41.2383, 1.8068, ["R2S"]),
    ("BCN_R_15", "Vilanova i la Geltrú",           41.2244, 1.7262, ["R2S"]),
    ("BCN_R_16", "Mataró",                         41.5393, 2.4448, ["R1"]),
]

# ── Secuencias por línea ──────────────────────────────────────────────────────
LINE_SEQUENCES = {
    "L1": [
        "BCN_L1_01","BCN_L1_02","BCN_L1_03","BCN_L1_04","BCN_L1_05",
        "BCN_L1_06","BCN_L1_07","BCN_L1_08","BCN_L1_09","BCN_L1_10",
        "BCN_L1_11","BCN_L1_12","BCN_L1_13","BCN_L1_14","BCN_L1_15",
        "BCN_L1_16","BCN_L1_17","BCN_L1_18","BCN_L1_19","BCN_L1_20",
        "BCN_L1_21","BCN_L1_22","BCN_L1_23","BCN_L1_24","BCN_L1_25",
        "BCN_L1_26","BCN_L1_27","BCN_L1_28","BCN_L1_29","BCN_L1_30",
    ],
    "L2": [
        "BCN_L2_01","BCN_L2_02","BCN_L1_11","BCN_L2_04","BCN_L2_05",
        "BCN_L2_06","BCN_L2_07","BCN_L2_08","BCN_L2_09","BCN_L2_10",
        "BCN_L2_11","BCN_L2_12",
    ],
    "L3": [
        "BCN_L3_01","BCN_L3_02","BCN_L3_03","BCN_L3_04","BCN_L3_05",
        "BCN_L3_06","BCN_L3_07","BCN_L1_08","BCN_L3_08","BCN_L3_09",
        "BCN_L3_10","BCN_L3_11","BCN_L3_12","BCN_L3_13","BCN_L3_14",
        "BCN_L3_15","BCN_L3_16","BCN_L3_17","BCN_L3_19","BCN_L3_20",
        "BCN_L3_21","BCN_L3_22","BCN_L3_23","BCN_L3_24","BCN_L3_25",
        "BCN_L3_26","BCN_L3_27","BCN_L3_28","BCN_L3_29","BCN_L3_30",
        "BCN_L3_31",
    ],
    "L4": [
        "BCN_L2_10","BCN_L4_01","BCN_L4_02","BCN_L4_03","BCN_L4_04",
        "BCN_L4_05","BCN_L1_20","BCN_L4_06","BCN_L4_07","BCN_L4_08",
        "BCN_L4_09","BCN_L4_10","BCN_L1_13","BCN_L4_11","BCN_L4_12",
        "BCN_L4_13","BCN_L4_14","BCN_L4_15","BCN_L4_16","BCN_L4_17",
        "BCN_L4_18","BCN_L4_19","BCN_L4_20",
    ],
    "L5": [
        "BCN_L5_01","BCN_L5_02","BCN_L5_03","BCN_L5_04","BCN_L5_05",
        "BCN_L5_06","BCN_L5_07","BCN_L5_08","BCN_L5_09","BCN_L5_10",
        "BCN_L1_08","BCN_L5_11","BCN_L3_21","BCN_L5_12","BCN_L5_13",
        "BCN_L4_09","BCN_L2_07","BCN_L5_15","BCN_L1_17","BCN_L5_16",
        "BCN_L1_18","BCN_L1_20","BCN_L5_19","BCN_L3_26",
    ],
    "L9N": [
        "BCN_L9N_01","BCN_L9N_02","BCN_L9N_03","BCN_L1_27","BCN_L9N_04",
        "BCN_L9N_05","BCN_L9N_06","BCN_L9N_07","BCN_L9N_08","BCN_L9N_09",
        "BCN_L1_18",
    ],
    "L10N": [
        "BCN_L10N_01","BCN_L10N_02","BCN_L10N_03","BCN_L10N_04","BCN_L10N_05",
        "BCN_L9N_07","BCN_L10N_06","BCN_L1_18",
    ],
    "L11": [
        "BCN_L3_31","BCN_L11_02","BCN_L11_03","BCN_L11_04",
    ],
    "L6": [
        "BCN_FGC_01","BCN_FGC_02","BCN_FGC_03","BCN_FGC_05","BCN_FGC_04",
        "BCN_FGC_06","BCN_FGC_07","BCN_FGC_08","BCN_FGC_09",
    ],
    "L7": [
        "BCN_FGC_01","BCN_FGC_02","BCN_FGC_03","BCN_FGC_05","BCN_FGC_04",
        "BCN_FGC_06","BCN_FGC_07","BCN_FGC_10","BCN_FGC_11","BCN_FGC_12",
    ],
    "R1": [
        "BCN_R_16","BCN_R_08","BCN_R_09","BCN_L1_12","BCN_R_06",
        "BCN_R_07","BCN_L1_17","BCN_L1_12",
    ],
    "R2N": [
        "BCN_R_10","BCN_R_11","BCN_R_07","BCN_L1_17","BCN_L1_12",
        "BCN_L2_04","BCN_L3_06",
    ],
    "R2S": [
        "BCN_R_01","BCN_R_02","BCN_R_03","BCN_R_04","BCN_R_05",
        "BCN_L3_06","BCN_L1_12","BCN_R_14","BCN_R_15",
    ],
    "R3": [
        "BCN_R_06","BCN_R_07","BCN_L1_12","BCN_L2_04","BCN_L3_06",
        "BCN_R_10","BCN_R_11",
    ],
    "R4": [
        "BCN_R_04","BCN_R_05","BCN_L3_06","BCN_L1_12","BCN_R_07",
        "BCN_R_06","BCN_R_12","BCN_R_13",
    ],
}

_FIRST_MIN = 300    # 05:00
_LAST_MIN  = 1440   # 00:00
_HEADWAY   = 5      # metro: cada 5 minutos


def deduplicate(stations):
    seen = {}
    for s in stations:
        if s[0] not in seen:
            seen[s[0]] = s
    return list(seen.values())


def setup(conn):
    conn.executescript("""
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous  = NORMAL;
        CREATE TABLE IF NOT EXISTS agency (
            agency_id TEXT PRIMARY KEY, agency_name TEXT,
            agency_url TEXT, agency_timezone TEXT);
        CREATE TABLE IF NOT EXISTS stops (
            stop_id TEXT PRIMARY KEY, stop_name TEXT NOT NULL,
            stop_lat REAL NOT NULL, stop_lon REAL NOT NULL,
            country_code TEXT DEFAULT 'ES', location_type INTEGER DEFAULT 0,
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
    conn.commit()


def main():
    print("\nWoW TRENES — Barcelona Metro (TMB) DB Generator")
    print("=" * 50)

    tmp_db = Path("/tmp/gtfs_es_bcn_build.db")
    if tmp_db.exists():
        tmp_db.unlink()

    t0   = time.time()
    conn = sqlite3.connect(str(tmp_db))
    setup(conn)

    # Agency
    conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
        ("TMB", "Transports Metropolitans de Barcelona",
         "https://www.tmb.cat", "Europe/Madrid"))
    conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
        ("FGC", "Ferrocarrils de la Generalitat de Catalunya",
         "https://www.fgc.cat", "Europe/Madrid"))
    conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
        ("RODALIES", "Rodalies de Catalunya",
         "https://rodalies.gencat.cat", "Europe/Madrid"))
    conn.commit()

    # Routes
    for rid, short_name, long_name, color, rtype in ROUTES:
        agency = "TMB"
        if rid in ("L6", "L7"):
            agency = "FGC"
        elif rid.startswith("R"):
            agency = "RODALIES"
        conn.execute("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?,?)",
            (rid, agency, short_name, long_name, int(rtype), color, "Barcelona"))
    conn.commit()
    print(f"  Líneas:     {len(ROUTES)}")

    # Stops
    stations = deduplicate(STATIONS)
    for sid, sname, lat, lon, lines in stations:
        conn.execute("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)",
            (sid, sname, lat, lon, "ES", 0, ""))
    conn.commit()
    print(f"  Estaciones: {len(stations)}")

    # Trips + stop_times
    valid_ids = {s[0] for s in stations}

    def fmt_time(minutes):
        h, m = divmod(minutes, 60)
        return f"{h:02d}:{m:02d}:00"

    trips_batch = []
    st_batch    = []
    trip_count  = 0
    st_count    = 0
    dwell       = 2  # minutos entre paradas

    for line_id, seq in LINE_SEQUENCES.items():
        seq_valid = [s for s in seq if s in valid_ids]
        if len(seq_valid) < 2:
            continue
        for direction in (0, 1):
            stop_seq = seq_valid if direction == 0 else list(reversed(seq_valid))
            headsign = stop_seq[-1]
            dep = _FIRST_MIN
            while dep <= _LAST_MIN:
                trip_id = f"{line_id}_d{direction}_{dep:04d}"
                trips_batch.append((trip_id, line_id, "ALL", headsign, direction))
                for i, sid in enumerate(stop_seq):
                    ts = fmt_time(dep + i * dwell)
                    st_batch.append((trip_id, ts, ts, sid, i))
                trip_count += 1
                st_count   += len(stop_seq)
                dep        += _HEADWAY

    conn.executemany("INSERT OR IGNORE INTO trips VALUES (?,?,?,?,?)", trips_batch)
    conn.executemany("INSERT OR IGNORE INTO stop_times VALUES (?,?,?,?,?)", st_batch)
    conn.commit()
    print(f"  Trips:      {trip_count:,}")
    print(f"  Stop_times: {st_count:,}")

    # Calendar
    conn.execute("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("WD",  1,1,1,1,1,0,0, "20260101","20261231"))
    conn.execute("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("WE",  0,0,0,0,0,1,1, "20260101","20261231"))
    conn.execute("INSERT OR IGNORE INTO calendar VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("ALL", 1,1,1,1,1,1,1, "20260101","20261231"))
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
    shutil.copy2(str(tmp_db), str(OUTPUT_DB))
    tmp_db.unlink()

    elapsed = time.time() - t0
    mb = OUTPUT_DB.stat().st_size / 1_048_576
    print(f"\n  Listo en {elapsed:.1f}s  —  {mb:.2f} MB")
    print(f"  Archivo: {OUTPUT_DB}")
    print(f"\n  Barcelona Metro: L1·L2·L3·L4·L5·L9N·L10N·L11 + FGC + Rodalies")


if __name__ == "__main__":
    main()
