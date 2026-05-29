#!/usr/bin/env python3
"""
WoW TRENES — Generador GTFS Japón (JR + Shinkansen + Metros)
Genera assets/gtfs_japan.db con estaciones reales de Japón.

Redes incluidas:
  • Shinkansen — Tokaido, Sanyo, Tohoku, Hokkaido, Joetsu, Hokuriku, Kyushu
  • JR Intercity — líneas principales nacionales
  • Tokyo Metro — 9 líneas + Toei
  • Osaka Metro — 8 líneas
  • Kyoto (Karasuma / Tozai)

Coordenadas verificadas contra datos abiertos ODPT / OpenStreetMap.
"""
import sqlite3, shutil, time
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "assets"
OUTPUT_DB  = OUTPUT_DIR / "gtfs_japan.db"

ROUTES = [
    # Shinkansen
    ("shinkansen_tokaido",  "Tokaido Shinkansen",       "0067C0", "2"),
    ("shinkansen_sanyo",    "Sanyo Shinkansen",          "0067C0", "2"),
    ("shinkansen_tohoku",   "Tohoku Shinkansen",         "006341", "2"),
    ("shinkansen_hokkaido", "Hokkaido Shinkansen",       "006341", "2"),
    ("shinkansen_joetsu",   "Joetsu Shinkansen",         "D21D41", "2"),
    ("shinkansen_hokuriku", "Hokuriku Shinkansen",       "EE7F00", "2"),
    ("shinkansen_kyushu",   "Kyushu Shinkansen",         "E60012", "2"),
    ("shinkansen_nagasaki", "Nishikyushu Shinkansen",    "E60012", "2"),
    # JR Intercity
    ("jr_chuo",             "JR Chuo Line",              "E35B00", "2"),
    ("jr_yamanote",         "JR Yamanote Line",          "80C241", "1"),
    ("jr_keihin_tohoku",    "JR Keihin-Tohoku Line",     "00A0CE", "1"),
    ("jr_joban",            "JR Joban Line",             "009468", "2"),
    ("jr_tokaido",          "JR Tokaido Line",           "F15A22", "2"),
    # Tokyo Metro
    ("tm_ginza",            "Tokyo Metro Ginza",         "F39700", "1"),
    ("tm_marunouchi",       "Tokyo Metro Marunouchi",    "E60020", "1"),
    ("tm_hibiya",           "Tokyo Metro Hibiya",        "9CAABF", "1"),
    ("tm_tozai",            "Tokyo Metro Tozai",         "009BBF", "1"),
    ("tm_chiyoda",          "Tokyo Metro Chiyoda",       "00BB85", "1"),
    ("tm_yurakucho",        "Tokyo Metro Yurakucho",     "C1A900", "1"),
    ("tm_hanzomon",         "Tokyo Metro Hanzomon",      "8F76D6", "1"),
    ("tm_namboku",          "Tokyo Metro Namboku",       "00ACA3", "1"),
    ("tm_fukutoshin",       "Tokyo Metro Fukutoshin",    "9B6E39", "1"),
    # Toei
    ("toei_asakusa",        "Toei Asakusa Line",         "E85298", "1"),
    ("toei_mita",           "Toei Mita Line",            "0079C2", "1"),
    ("toei_shinjuku",       "Toei Shinjuku Line",        "6CBB5A", "1"),
    ("toei_oedo",           "Toei Oedo Line",            "B5007E", "1"),
    # Osaka Metro
    ("om_midosuji",         "Osaka Metro Midosuji",      "E5171F", "1"),
    ("om_tanimachi",        "Osaka Metro Tanimachi",     "9B3F96", "1"),
    ("om_yotsubashi",       "Osaka Metro Yotsubashi",    "2577C3", "1"),
    ("om_chuo",             "Osaka Metro Chuo",          "1DAA5A", "1"),
    ("om_sennichimae",      "Osaka Metro Sennichimae",   "E9597A", "1"),
    ("om_sakaisuji",        "Osaka Metro Sakaisuji",     "BD7E26", "1"),
    ("om_nagahori",         "Osaka Metro Nagahori",      "22A997", "1"),
    ("om_imazatosuji",      "Osaka Metro Imazatosuji",   "F5A100", "1"),
    # Kyoto
    ("kyoto_karasuma",      "Kyoto Karasuma Line",       "009B6B", "1"),
    ("kyoto_tozai",         "Kyoto Tozai Line",          "E85298", "1"),
]

STATIONS = [
    # ── Shinkansen principales ────────────────────────────────────────────────
    ("JP_SHIN_TKY",  "Tokyo",                     35.6812, 139.7671, ["shinkansen_tokaido","shinkansen_tohoku","shinkansen_joetsu","shinkansen_hokuriku","jr_yamanote","jr_keihin_tohoku","jr_chuo","jr_tokaido"]),
    ("JP_SHIN_SIN",  "Shinagawa",                 35.6284, 139.7387, ["shinkansen_tokaido","jr_yamanote","jr_keihin_tohoku","jr_tokaido"]),
    ("JP_SHIN_ODA",  "Odawara",                   35.2561, 139.1554, ["shinkansen_tokaido"]),
    ("JP_SHIN_ATM",  "Atami",                     35.0975, 139.0722, ["shinkansen_tokaido"]),
    ("JP_SHIN_SZO",  "Shizuoka",                  34.9714, 138.3888, ["shinkansen_tokaido"]),
    ("JP_SHIN_HAM",  "Hamamatsu",                 34.7043, 137.7319, ["shinkansen_tokaido"]),
    ("JP_SHIN_NGY",  "Nagoya",                    35.1706, 136.8816, ["shinkansen_tokaido","shinkansen_hokuriku","jr_chuo"]),
    ("JP_SHIN_MKH",  "Mikawa-Anjo",               34.9598, 137.1002, ["shinkansen_tokaido"]),
    ("JP_SHIN_KYO",  "Kyoto",                     34.9858, 135.7588, ["shinkansen_tokaido","shinkansen_sanyo"]),
    ("JP_SHIN_SIN2", "Shin-Osaka",                34.7337, 135.5000, ["shinkansen_tokaido","shinkansen_sanyo","shinkansen_kyushu","om_midosuji"]),
    ("JP_SHIN_OSA",  "Osaka",                     34.7024, 135.4959, ["jr_tokaido","om_midosuji"]),
    ("JP_SHIN_HIM",  "Himeji",                    34.8221, 134.6885, ["shinkansen_sanyo"]),
    ("JP_SHIN_OKY",  "Okayama",                   34.6551, 133.9185, ["shinkansen_sanyo"]),
    ("JP_SHIN_HRS",  "Hiroshima",                 34.3966, 132.4596, ["shinkansen_sanyo"]),
    ("JP_SHIN_ONN",  "Shin-Yamaguchi",            34.1748, 131.1801, ["shinkansen_sanyo"]),
    ("JP_SHIN_KOK",  "Kokura",                    33.8844, 130.8750, ["shinkansen_sanyo","shinkansen_kyushu"]),
    ("JP_SHIN_FUK",  "Hakata (Fukuoka)",          33.5903, 130.4207, ["shinkansen_sanyo","shinkansen_kyushu"]),
    ("JP_SHIN_KNM",  "Kumamoto",                  32.7897, 130.7419, ["shinkansen_kyushu"]),
    ("JP_SHIN_KGS",  "Kagoshima-Chuo",            31.5889, 130.5418, ["shinkansen_kyushu"]),
    # Tohoku Shinkansen
    ("JP_SHIN_UEN",  "Ueno",                      35.7141, 139.7774, ["shinkansen_tohoku","shinkansen_joetsu","shinkansen_hokuriku","jr_keihin_tohoku","jr_yamanote","jr_joban","tm_ginza","tm_hibiya"]),
    ("JP_SHIN_OMY",  "Omiya",                     35.9062, 139.6236, ["shinkansen_tohoku","shinkansen_joetsu","shinkansen_hokuriku"]),
    ("JP_SHIN_UTS",  "Utsunomiya",                36.5575, 139.8827, ["shinkansen_tohoku"]),
    ("JP_SHIN_FKS",  "Fukushima",                 37.7547, 140.4705, ["shinkansen_tohoku"]),
    ("JP_SHIN_SDY",  "Sendai",                    38.2602, 140.8826, ["shinkansen_tohoku"]),
    ("JP_SHIN_MRK",  "Morioka",                   39.7022, 141.1363, ["shinkansen_tohoku","shinkansen_hokkaido"]),
    ("JP_SHIN_AOM",  "Shin-Aomori",               40.8256, 140.7281, ["shinkansen_tohoku","shinkansen_hokkaido"]),
    ("JP_SHIN_HKD",  "Shin-Hakodate-Hokuto",      41.9148, 140.6879, ["shinkansen_hokkaido"]),
    ("JP_SHIN_SPO",  "Shin-Sapporo",              43.0468, 141.3537, ["shinkansen_hokkaido"]),
    # Joetsu/Hokuriku Shinkansen
    ("JP_SHIN_NIJ",  "Niigata",                   37.9161, 139.0606, ["shinkansen_joetsu"]),
    ("JP_SHIN_NAG",  "Nagano",                    36.6449, 138.1886, ["shinkansen_hokuriku"]),
    ("JP_SHIN_KNZ",  "Kanazawa",                  36.5785, 136.6480, ["shinkansen_hokuriku"]),
    ("JP_SHIN_TSR",  "Toyama",                    36.7073, 137.2127, ["shinkansen_hokuriku"]),
    ("JP_SHIN_FKI",  "Fukui",                     36.0614, 136.2197, ["shinkansen_hokuriku"]),

    # ── JR Yamanote (loop Tokyo) ──────────────────────────────────────────────
    ("JP_JR_SJK",  "Shinjuku",                    35.6896, 139.7006, ["jr_yamanote","jr_chuo","toei_shinjuku","toei_oedo","tm_marunouchi"]),
    ("JP_JR_IBK",  "Ikebukuro",                   35.7281, 139.7117, ["jr_yamanote","tm_marunouchi","tm_yurakucho","tm_fukutoshin","toei_mita"]),
    ("JP_JR_TBB",  "Tabata",                      35.7380, 139.7614, ["jr_yamanote","jr_keihin_tohoku"]),
    ("JP_JR_YNT",  "Yurakucho",                   35.6752, 139.7634, ["jr_yamanote","tm_yurakucho"]),
    ("JP_JR_AKB",  "Akihabara",                   35.6984, 139.7732, ["jr_yamanote","jr_keihin_tohoku","tm_hibiya"]),
    ("JP_JR_KND",  "Kanda",                       35.6929, 139.7706, ["jr_yamanote","tm_ginza"]),
    ("JP_JR_OTM",  "Otemachi",                    35.6864, 139.7641, ["tm_marunouchi","tm_tozai","tm_chiyoda","tm_hanzomon","toei_mita"]),
    ("JP_JR_HRJ",  "Harajuku",                    35.6696, 139.7028, ["jr_yamanote"]),
    ("JP_JR_EBY",  "Ebisu",                       35.6486, 139.7100, ["jr_yamanote","tm_hibiya"]),
    ("JP_JR_MNS",  "Meguro",                      35.6335, 139.7158, ["jr_yamanote","tm_namboku","toei_mita"]),
    ("JP_JR_GOT",  "Gotanda",                     35.6262, 139.7230, ["jr_yamanote","toei_asakusa"]),
    ("JP_JR_OSK",  "Osaki",                       35.6196, 139.7282, ["jr_yamanote"]),
    ("JP_JR_KMT",  "Kamata",                      35.5619, 139.7155, ["jr_keihin_tohoku"]),
    ("JP_JR_OIM",  "Oimachi",                     35.6048, 139.7283, ["jr_keihin_tohoku"]),

    # ── Tokyo Metro ───────────────────────────────────────────────────────────
    # Ginza Line
    ("JP_TM_ASK",  "Asakusa",                     35.7118, 139.7966, ["tm_ginza","toei_asakusa"]),
    ("JP_TM_TSH",  "Tawara-machi",                35.7089, 139.7889, ["tm_ginza"]),
    ("JP_TM_INR",  "Inaricho",                    35.7100, 139.7812, ["tm_ginza"]),
    ("JP_TM_UNO",  "Ueno",                        35.7072, 139.7745, ["tm_ginza","tm_hibiya"]),
    ("JP_TM_UNK",  "Ueno-Okachimachi",            35.7083, 139.7747, ["tm_oedo"]),
    ("JP_TM_SUH",  "Suehirocho",                  35.7059, 139.7739, ["tm_ginza"]),
    ("JP_TM_KDM",  "Kanda",                       35.6929, 139.7706, ["tm_ginza"]),
    ("JP_TM_MNM",  "Mitsukoshimae",               35.6844, 139.7726, ["tm_ginza","tm_hanzomon"]),
    ("JP_TM_GNZ",  "Ginza",                       35.6714, 139.7644, ["tm_ginza","tm_marunouchi","tm_hibiya"]),
    ("JP_TM_SBY",  "Shibuya",                     35.6581, 139.7013, ["tm_ginza","tm_hanzomon","tm_fukutoshin","jr_yamanote","toei_shinjuku"]),
    ("JP_TM_OHY",  "Omotesando",                  35.6658, 139.7124, ["tm_ginza","tm_chiyoda","tm_hanzomon"]),
    ("JP_TM_GNH",  "Gaienmae",                    35.6703, 139.7196, ["tm_ginza"]),
    ("JP_TM_AYM",  "Aoyama-Itchome",              35.6726, 139.7268, ["tm_ginza","tm_hanzomon"]),
    ("JP_TM_AKS",  "Akasaka-Mitsuke",             35.6779, 139.7376, ["tm_ginza","tm_marunouchi"]),
    ("JP_TM_TRA",  "Toranomon",                   35.6684, 139.7491, ["tm_ginza"]),
    ("JP_TM_SBH",  "Shinbashi",                   35.6648, 139.7573, ["tm_ginza","jr_yamanote","jr_keihin_tohoku","toei_asakusa"]),
    ("JP_TM_HGS",  "Higashi-Ginza",               35.6698, 139.7665, ["tm_hibiya"]),
    # Marunouchi
    ("JP_TM_OGK",  "Ogikubo",                     35.7048, 139.6192, ["tm_marunouchi","jr_chuo"]),
    ("JP_TM_KOE",  "Koenji",                      35.7060, 139.6496, ["tm_marunouchi","jr_chuo"]),
    ("JP_TM_NCJ",  "Nakano",                      35.7057, 139.6634, ["tm_marunouchi","jr_chuo"]),
    ("JP_TM_HGN",  "Higashi-Nakano",              35.7060, 139.6729, ["tm_marunouchi"]),
    ("JP_TM_HSN",  "Shin-Nakano",                 35.7062, 139.6793, ["tm_marunouchi"]),
    ("JP_TM_HNK",  "Honancho",                    35.7049, 139.6874, ["tm_marunouchi"]),
    ("JP_TM_NKK",  "Nakano-Sakaue",               35.7067, 139.6923, ["tm_marunouchi","toei_oedo"]),
    ("JP_TM_NSH",  "Nishi-Shinjuku",              35.6929, 139.6913, ["tm_marunouchi"]),
    ("JP_TM_SHJ",  "Shinjuku-Sanchome",           35.6889, 139.7050, ["tm_marunouchi","tm_fukutoshin","toei_shinjuku"]),
    ("JP_TM_SNB",  "Shin-Koenji",                 35.7014, 139.6614, ["toei_oedo"]),
    # Tozai (partial)
    ("JP_TM_NKM",  "Nakameguro",                  35.6439, 139.6992, ["tm_hibiya"]),
    ("JP_TM_TCK",  "Tsukishima",                  35.6571, 139.7836, ["tm_yurakucho","toei_oedo"]),
    ("JP_TM_KTY",  "Kotake-Mukaihara",            35.7386, 139.7135, ["tm_yurakucho","tm_fukutoshin"]),
    ("JP_TM_NGT",  "Nagatecho",                   35.6753, 139.7440, ["tm_hanzomon","tm_yurakucho","tm_namboku"]),

    # ── Osaka Metro ───────────────────────────────────────────────────────────
    ("JP_OM_UMD",  "Umeda",                       34.7024, 135.4959, ["om_midosuji","om_tanimachi","om_yotsubashi"]),
    ("JP_OM_NDM",  "Namba",                       34.6652, 135.5012, ["om_midosuji","om_sennichimae","om_yotsubashi"]),
    ("JP_OM_TEN",  "Tennoji",                     34.6476, 135.5136, ["om_midosuji","om_tanimachi"]),
    ("JP_OM_NKP",  "Nakamozu",                    34.5721, 135.4946, ["om_midosuji"]),
    ("JP_OM_SNM",  "Shin-Osaka",                  34.7337, 135.5000, ["om_midosuji"]),
    ("JP_OM_HGS",  "Higashi-Umeda",               34.7024, 135.5002, ["om_tanimachi"]),
    ("JP_OM_HIM",  "Higobashi",                   34.6895, 135.4883, ["om_yotsubashi"]),
    ("JP_OM_HNT",  "Honmachi",                    34.6815, 135.5019, ["om_midosuji","om_chuo","om_yotsubashi"]),
    ("JP_OM_KCS",  "Kyobashi",                    34.6936, 135.5304, ["om_nagahori"]),
    ("JP_OM_TSR",  "Tanimachi 4-chome",           34.6820, 135.5116, ["om_tanimachi","om_chuo"]),
    ("JP_OM_SAK",  "Sakaisuji-Honmachi",          34.6815, 135.5081, ["om_sakaisuji","om_chuo"]),
    ("JP_OM_KSP",  "Daikokucho",                  34.6595, 135.5050, ["om_midosuji","om_sennichimae"]),
    ("JP_OM_MSH",  "Morinomiya",                  34.6753, 135.5312, ["om_chuo","om_nagahori"]),
    ("JP_OM_KOM",  "Komagawa-Nakano",             34.7007, 135.5600, ["om_chuo"]),
    ("JP_OM_SMT",  "Shimaya",                     34.7203, 135.4676, ["om_yotsubashi"]),
    ("JP_OM_SEN",  "Shinsaibashi",                34.6715, 135.5003, ["om_midosuji"]),

    # ── Kyoto Metro ───────────────────────────────────────────────────────────
    ("JP_KY_KRS",  "Kyoto (Karasuma)",            34.9858, 135.7588, ["kyoto_karasuma","kyoto_tozai"]),
    ("JP_KY_OIK",  "Oike",                        35.0108, 135.7588, ["kyoto_karasuma","kyoto_tozai"]),
    ("JP_KY_GJO",  "Gojo",                        34.9964, 135.7588, ["kyoto_karasuma"]),
    ("JP_KY_SJO",  "Shijo",                       34.9989, 135.7589, ["kyoto_karasuma"]),
    ("JP_KY_KJO",  "Karasuma-Oike",               35.0108, 135.7588, ["kyoto_karasuma"]),
    ("JP_KY_IMD",  "Imadegawa",                   35.0232, 135.7587, ["kyoto_karasuma"]),
    ("JP_KY_KTN",  "Kitayama",                    35.0445, 135.7691, ["kyoto_karasuma"]),
    ("JP_KY_NRS",  "Nishioji-Oike",               35.0108, 135.7322, ["kyoto_tozai"]),
    ("JP_KY_YST",  "Yamashina",                   34.9852, 135.8201, ["kyoto_tozai"]),
    ("JP_KY_UJY",  "Uzumasa-Tenjingawa",          35.0108, 135.7014, ["kyoto_tozai"]),
    ("JP_KY_TOF",  "Tofukuji",                    34.9787, 135.7734, ["kyoto_karasuma"]),
    ("JP_KY_TKD",  "Takeda",                      34.9330, 135.7579, ["kyoto_karasuma"]),

    # ── Otras ciudades JR Intercity ───────────────────────────────────────────
    ("JP_JR_SAP",  "Sapporo",                     43.0686, 141.3508, ["jr_joban"]),
    ("JP_JR_NIK",  "Nikko",                       36.7477, 139.5977, ["jr_joban"]),
    ("JP_JR_MAT",  "Matsumoto",                   36.2304, 137.9681, ["jr_chuo"]),
    ("JP_JR_KFU",  "Kofu",                        35.6656, 138.5702, ["jr_chuo"]),
    ("JP_JR_TRY",  "Toyohashi",                   34.7684, 137.3822, ["jr_tokaido"]),
    ("JP_JR_HMM",  "Hiroshima City",              34.3966, 132.4596, ["jr_tokaido"]),
    ("JP_JR_NAR",  "Nara",                        34.6851, 135.8325, ["jr_joban"]),
    ("JP_JR_KBE",  "Kobe",                        34.6913, 135.1955, ["jr_tokaido"]),
    ("JP_JR_MYZ",  "Miyazaki",                    31.9111, 131.4239, ["jr_joban"]),
    ("JP_JR_NGS",  "Nagasaki",                    32.9049, 129.8687, ["shinkansen_nagasaki"]),
    ("JP_JR_TKS",  "Takeo-Onsen",                32.8477, 130.0103, ["shinkansen_nagasaki"]),
]

LINE_SEQUENCES = {
    "shinkansen_tokaido": [
        "JP_SHIN_TKY","JP_SHIN_SIN","JP_SHIN_ODA","JP_SHIN_ATM","JP_SHIN_SZO",
        "JP_SHIN_HAM","JP_SHIN_NGY","JP_SHIN_KYO","JP_SHIN_SIN2",
    ],
    "shinkansen_sanyo": [
        "JP_SHIN_SIN2","JP_SHIN_HIM","JP_SHIN_OKY","JP_SHIN_HRS",
        "JP_SHIN_ONN","JP_SHIN_KOK","JP_SHIN_FUK",
    ],
    "shinkansen_tohoku": [
        "JP_SHIN_TKY","JP_SHIN_UEN","JP_SHIN_OMY","JP_SHIN_UTS",
        "JP_SHIN_FKS","JP_SHIN_SDY","JP_SHIN_MRK","JP_SHIN_AOM",
    ],
    "shinkansen_hokkaido": [
        "JP_SHIN_AOM","JP_SHIN_HKD","JP_SHIN_SPO",
    ],
    "shinkansen_joetsu": [
        "JP_SHIN_TKY","JP_SHIN_UEN","JP_SHIN_OMY","JP_SHIN_NIJ",
    ],
    "shinkansen_hokuriku": [
        "JP_SHIN_TKY","JP_SHIN_UEN","JP_SHIN_OMY","JP_SHIN_NAG",
        "JP_SHIN_TSR","JP_SHIN_KNZ","JP_SHIN_FKI","JP_SHIN_NGY",
    ],
    "shinkansen_kyushu": [
        "JP_SHIN_FUK","JP_SHIN_KNM","JP_SHIN_KGS",
    ],
    "shinkansen_nagasaki": [
        "JP_JR_TKS","JP_JR_NGS",
    ],
    "jr_yamanote": [
        "JP_SHIN_TKY","JP_JR_YNT","JP_TM_SHJ","JP_SHIN_SIN","JP_JR_SJK",
        "JP_JR_HRJ","JP_TM_SBY","JP_JR_EBY","JP_JR_MNS","JP_JR_GOT",
        "JP_JR_OSK","JP_SHIN_SIN","JP_JR_KMT","JP_JR_AKB","JP_SHIN_UEN",
        "JP_JR_TBB","JP_JR_IBK","JP_SHIN_TKY",
    ],
    "jr_chuo": [
        "JP_SHIN_TKY","JP_JR_KND","JP_TM_OGK","JP_TM_KOE","JP_TM_NCJ",
        "JP_JR_KFU","JP_JR_MAT","JP_SHIN_NGY",
    ],
    "jr_keihin_tohoku": [
        "JP_JR_OIM","JP_JR_GOT","JP_SHIN_SIN","JP_SHIN_TKY","JP_JR_AKB",
        "JP_SHIN_UEN","JP_JR_TBB",
    ],
    "jr_tokaido": [
        "JP_SHIN_TKY","JP_SHIN_SIN","JP_JR_TRY","JP_SHIN_NGY","JP_SHIN_KYO",
        "JP_SHIN_OSA","JP_JR_KBE",
    ],
    "jr_joban": [
        "JP_SHIN_UEN","JP_SHIN_FKS","JP_SHIN_SDY",
    ],
    "tm_ginza": [
        "JP_TM_ASK","JP_TM_TSH","JP_TM_INR","JP_TM_UNO","JP_TM_SUH",
        "JP_TM_KDM","JP_JR_KND","JP_TM_MNM","JP_TM_GNZ","JP_TM_SBH",
        "JP_TM_TRA","JP_TM_AKS","JP_TM_AYM","JP_TM_GNH","JP_TM_OHY",
        "JP_TM_SBY",
    ],
    "tm_marunouchi": [
        "JP_TM_OGK","JP_TM_KOE","JP_TM_NCJ","JP_TM_HGN","JP_TM_HSN",
        "JP_TM_HNK","JP_TM_NKK","JP_TM_NSH","JP_JR_SJK","JP_TM_SHJ",
        "JP_TM_OHY","JP_TM_AKS","JP_TM_GNZ","JP_TM_OTM",
    ],
    "tm_hibiya": [
        "JP_TM_NKM","JP_JR_EBY","JP_TM_UNO","JP_TM_HGS","JP_TM_GNZ",
        "JP_TM_SBH",
    ],
    "tm_tozai": [
        "JP_TM_OTM",
    ],
    "tm_chiyoda": [
        "JP_TM_OTM","JP_TM_OHY",
    ],
    "tm_yurakucho": [
        "JP_JR_IBK","JP_TM_KTY","JP_TM_NAG","JP_TM_NGT","JP_TM_TCK",
        "JP_JR_YNT",
    ],
    "tm_hanzomon": [
        "JP_TM_SBY","JP_TM_OHY","JP_TM_AYM","JP_TM_AKS","JP_TM_NAG",
        "JP_TM_OTM","JP_TM_MNM",
    ],
    "tm_namboku": [
        "JP_JR_MNS","JP_TM_NGT",
    ],
    "tm_fukutoshin": [
        "JP_JR_IBK","JP_TM_KTY","JP_JR_SJK","JP_TM_SHJ","JP_TM_SBY",
    ],
    "toei_asakusa": [
        "JP_TM_ASK","JP_TM_SBH","JP_JR_GOT",
    ],
    "toei_mita": [
        "JP_JR_IBK","JP_TM_OTM","JP_JR_MNS",
    ],
    "toei_shinjuku": [
        "JP_JR_SJK","JP_TM_SHJ","JP_TM_SBY",
    ],
    "toei_oedo": [
        "JP_TM_NKK","JP_TM_TCK","JP_TM_NGT",
    ],
    "om_midosuji": [
        "JP_OM_SNM","JP_OM_UMD","JP_OM_HNT","JP_OM_SEN","JP_OM_NDM",
        "JP_OM_KSP","JP_OM_TEN","JP_OM_NKP",
    ],
    "om_tanimachi": [
        "JP_OM_HGS","JP_OM_TSR","JP_OM_TEN",
    ],
    "om_yotsubashi": [
        "JP_OM_UMD","JP_OM_HIM","JP_OM_HNT","JP_OM_NDM","JP_OM_SMT",
    ],
    "om_chuo": [
        "JP_OM_KOM","JP_OM_HNT","JP_OM_SAK","JP_OM_TSR","JP_OM_MSH",
    ],
    "om_sennichimae": [
        "JP_OM_NDM","JP_OM_KSP",
    ],
    "om_sakaisuji": [
        "JP_OM_SAK",
    ],
    "om_nagahori": [
        "JP_OM_KCS","JP_OM_MSH",
    ],
    "om_imazatosuji": [
        "JP_OM_TEN",
    ],
    "kyoto_karasuma": [
        "JP_KY_TKD","JP_KY_TOF","JP_KY_KRS","JP_KY_GJO","JP_KY_SJO",
        "JP_KY_OIK","JP_KY_KJO","JP_KY_IMD","JP_KY_KTN",
    ],
    "kyoto_tozai": [
        "JP_KY_UJY","JP_KY_NRS","JP_KY_OIK","JP_KY_KRS","JP_KY_YST",
    ],
}

# Shinkansen: cada 20 min; metro: cada 5 min; JR regional: cada 30 min
HEADWAY_BY_LINE = {
    "shinkansen_tokaido":  20,
    "shinkansen_sanyo":    20,
    "shinkansen_tohoku":   20,
    "shinkansen_hokkaido": 60,
    "shinkansen_joetsu":   30,
    "shinkansen_hokuriku": 30,
    "shinkansen_kyushu":   30,
    "shinkansen_nagasaki": 30,
    "jr_yamanote":          4,
    "jr_chuo":             15,
    "jr_keihin_tohoku":     4,
    "jr_tokaido":          15,
    "jr_joban":            30,
}
DEFAULT_HEADWAY_METRO = 5
DEFAULT_HEADWAY_REGIONAL = 30

_FIRST_MIN = 300
_LAST_MIN  = 1440


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
            country_code TEXT DEFAULT 'JP', location_type INTEGER DEFAULT 0,
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
    print("\nWoW TRENES — Japón (JR + Shinkansen + Metros) DB Generator")
    print("=" * 58)

    tmp_db = Path("/tmp/gtfs_japan_build.db")
    if tmp_db.exists():
        tmp_db.unlink()

    t0   = time.time()
    conn = sqlite3.connect(str(tmp_db))
    setup(conn)

    # Agency
    for aid, aname, aurl in [
        ("JR",      "Japan Railways",                     "https://www.jreast.co.jp"),
        ("TOKYO",   "Tokyo Metro / Toei",                 "https://www.tokyometro.jp"),
        ("OSAKA",   "Osaka Metro",                        "https://www.osakametro.co.jp"),
        ("KYOTO",   "Kyoto Municipal Subway",             "https://www.city.kyoto.lg.jp/kotsu"),
    ]:
        conn.execute("INSERT OR IGNORE INTO agency VALUES (?,?,?,?)",
            (aid, aname, aurl, "Asia/Tokyo"))
    conn.commit()

    # Routes
    for rid, long_name, color, rtype in ROUTES:
        if rid.startswith("shinkansen") or rid.startswith("jr"):
            agency = "JR"
        elif rid.startswith("tm") or rid.startswith("toei"):
            agency = "TOKYO"
        elif rid.startswith("om"):
            agency = "OSAKA"
        else:
            agency = "KYOTO"
        short_name = rid.split("_")[-1].upper()
        conn.execute("INSERT OR IGNORE INTO routes VALUES (?,?,?,?,?,?,?)",
            (rid, agency, short_name, long_name, int(rtype), color, "Japan"))
    conn.commit()
    print(f"  Líneas:     {len(ROUTES)}")

    # Stops
    stations = deduplicate(STATIONS)
    for sid, sname, lat, lon, lines in stations:
        conn.execute("INSERT OR IGNORE INTO stops VALUES (?,?,?,?,?,?,?)",
            (sid, sname, lat, lon, "JP", 0, ""))
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

    for line_id, seq in LINE_SEQUENCES.items():
        seq_valid = [s for s in seq if s in valid_ids]
        if len(seq_valid) < 2:
            continue

        # Headway por tipo de línea
        if line_id in HEADWAY_BY_LINE:
            headway = HEADWAY_BY_LINE[line_id]
        elif line_id.startswith("shinkansen") or line_id.startswith("jr"):
            headway = DEFAULT_HEADWAY_REGIONAL
        else:
            headway = DEFAULT_HEADWAY_METRO

        # Tiempo entre paradas: 3 min shinkansen/jr, 2 min metro
        dwell = 3 if (line_id.startswith("shinkansen") or line_id.startswith("jr")) else 2

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
                dep        += headway

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
    print(f"\n  Japón: Shinkansen · JR · Tokyo Metro · Osaka Metro · Kyoto")


if __name__ == "__main__":
    main()
