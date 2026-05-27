/**
 * i18n — Internacionalización automática por idioma del teléfono
 *
 * CÓMO FUNCIONA:
 *   1. Al arrancar, detecta el locale del dispositivo vía expo-localization
 *   2. Mapea a uno de los idiomas soportados (fallback: 'en')
 *   3. Expone t('key') → string traducida en toda la app
 *   4. Sin red, sin servidor — todas las traducciones van en el bundle
 *
 * IDIOMAS: es · en · pt · fr · de · it · ja · zh · ko · ar
 *
 * FILOSOFÍA:
 *   El turista japonés que abre WoW TRENES en Italia ve TODO en japonés:
 *   nombres de botones, alertas de geofence, mensajes de error, POIs.
 *   Sin configuración. Automático desde el primer segundo.
 */
import * as Localization from 'expo-localization';
import type { AppLanguage } from '../types';

// ── Traducciones ──────────────────────────────────────────────────────────────

const translations = {
  es: {
    // Home
    home_tagline:        'Tu viaje empieza aquí.',
    home_sub:            'Fácil, rápido y hecho para viajeros como tú.',
    home_stat_countries: '+{n} países',
    home_stat_routes:    'Miles de rutas',
    home_stat_realtime:  'Tiempo real',
    home_explore_title:  'Explora el mundo en tren',
    home_explore_sub:    'Elige un país y encontrá tu próxima aventura.',
    home_explore_btn:    'Explorar',
    home_gps_question:   '¿No sabés por dónde empezar?',
    home_gps_sub:        'Detectamos tu ubicación y mostramos los mejores trenes cerca de vos.',
    home_gps_btn:        'Usar mi ubicación',
    home_gps_hint:       'Es rápido y mejora tu experiencia',
    // Translator
    translator_title:    'Traductor de señales',
    translator_camera:   'Cámara',
    translator_text:     'Texto',
    translator_camera_hint: 'Apuntá la cámara a cualquier cartel o señal',
    translator_text_hint:   'Escribí el texto a traducir',
    translator_from:     'Detectar idioma',
    translator_to:       'Español',
    translator_btn:      'Traducir',
    translator_translating: 'Traduciendo...',
    translator_error:    'Error al traducir. Verificá tu conexión.',
    translator_offline_note: 'Frases frecuentes disponibles sin red.',
    // Split screen
    split_back_map:      'Mapa',
    split_back_countries:'Países',
    split_dest:          'DESTINO',
    split_how_to_get:    'CÓMO LLEGAR',
    split_platform:      'Andén',
    // Geofence alerts
    geo_approaching:     'Te acercás a {station}',
    geo_approaching_body:'Tu tren {op} {num} sale a las {time}{platform}. ¡Empezá a caminar!',
    geo_qr_title:        'Mostrá tu QR — {op} {num}',
    geo_dest_title:      'Próxima parada: {dest}',
    geo_dest_body:       '{op} {num} · Preparate para bajar{platform}',
    // Platform arrival
    platform_title:      'Tu tren llega al andén {platform} ¡YA!',
    platform_body:       '{op} {num} → {dest} · Sale a las {time} · Tenés ~{min} min',
    // Purchase
    purchase_success:    '¡Billete confirmado!',
    purchase_sub:        '{dest} · Ref: {ref}',
    purchase_hint:       'Recibirás el QR de Trainline por email. La app te avisará cuando llegues.',
    // Checkout
    checkout_secure:     'Pago seguro · Trainline',
    checkout_compliance: 'Pago procesado por Trainline · WoW TRENES no almacena datos bancarios',
    // Status
    status_safe:         'A tiempo',
    status_warn:         'Apurate',
    status_danger:       '¡Urgente!',
    // General
    loading:             'Cargando...',
    close:               'Cerrar',
    back:                'Atrás',
    error_location:      'No se pudo obtener tu ubicación',
  },

  en: {
    home_tagline:        'Your journey starts here.',
    home_sub:            'Easy, fast and made for travellers like you.',
    home_stat_countries: '+{n} countries',
    home_stat_routes:    'Thousands of routes',
    home_stat_realtime:  'Real-time',
    home_explore_title:  'Explore the world by train',
    home_explore_sub:    'Choose a country and find your next adventure.',
    home_explore_btn:    'Explore',
    home_gps_question:   "Don't know where to start?",
    home_gps_sub:        'We detect your location and show the best trains near you.',
    home_gps_btn:        'Use my location',
    home_gps_hint:       'Fast and improves your experience',
    translator_title:    'Sign translator',
    translator_camera:   'Camera',
    translator_text:     'Text',
    translator_camera_hint: 'Point camera at any sign or board',
    translator_text_hint:   'Type the text to translate',
    translator_from:     'Detect language',
    translator_to:       'English',
    translator_btn:      'Translate',
    translator_translating: 'Translating...',
    translator_error:    'Translation error. Check your connection.',
    translator_offline_note: 'Common phrases available offline.',
    split_back_map:      'Map',
    split_back_countries:'Countries',
    split_dest:          'DESTINATION',
    split_how_to_get:    'HOW TO GET THERE',
    split_platform:      'Platform',
    geo_approaching:     "You're approaching {station}",
    geo_approaching_body:'{op} {num} departs at {time}{platform}. Start walking!',
    geo_qr_title:        'Show your QR — {op} {num}',
    geo_dest_title:      'Next stop: {dest}',
    geo_dest_body:       '{op} {num} · Get ready to exit{platform}',
    platform_title:      'Your train is arriving at platform {platform} NOW!',
    platform_body:       '{op} {num} → {dest} · Departs {time} · ~{min} min left',
    purchase_success:    'Ticket confirmed!',
    purchase_sub:        '{dest} · Ref: {ref}',
    purchase_hint:       "You'll receive the QR from Trainline by email. We'll alert you on arrival.",
    checkout_secure:     'Secure payment · Trainline',
    checkout_compliance: 'Payment by Trainline · WoW TRENES never stores card data',
    status_safe:         'On time',
    status_warn:         'Hurry up',
    status_danger:       'Urgent!',
    loading:             'Loading...',
    close:               'Close',
    back:                'Back',
    error_location:      'Could not get your location',
  },

  pt: {
    home_tagline:        'A sua viagem começa aqui.',
    home_sub:            'Fácil, rápido e feito para viajantes como você.',
    home_stat_countries: '+{n} países',
    home_stat_routes:    'Milhares de rotas',
    home_stat_realtime:  'Tempo real',
    home_explore_title:  'Explore o mundo de trem',
    home_explore_sub:    'Escolha um país e encontre sua próxima aventura.',
    home_explore_btn:    'Explorar',
    home_gps_question:   'Não sabe por onde começar?',
    home_gps_sub:        'Detectamos sua localização e mostramos os melhores trens.',
    home_gps_btn:        'Usar minha localização',
    home_gps_hint:       'Rápido e melhora sua experiência',
    translator_title:    'Tradutor de placas',
    translator_camera:   'Câmera',
    translator_text:     'Texto',
    translator_camera_hint: 'Aponte a câmera para qualquer placa ou sinal',
    translator_text_hint:   'Digite o texto para traduzir',
    translator_from:     'Detectar idioma',
    translator_to:       'Português',
    translator_btn:      'Traduzir',
    translator_translating: 'Traduzindo...',
    translator_error:    'Erro ao traduzir. Verifique sua conexão.',
    translator_offline_note: 'Frases comuns disponíveis offline.',
    split_back_map:      'Mapa',
    split_back_countries:'Países',
    split_dest:          'DESTINO',
    split_how_to_get:    'COMO CHEGAR',
    split_platform:      'Plataforma',
    geo_approaching:     'Você está se aproximando de {station}',
    geo_approaching_body:'{op} {num} parte às {time}{platform}. Comece a caminhar!',
    geo_qr_title:        'Mostre seu QR — {op} {num}',
    geo_dest_title:      'Próxima parada: {dest}',
    geo_dest_body:       '{op} {num} · Prepare-se para desembarcar{platform}',
    platform_title:      'Seu trem está chegando à plataforma {platform} AGORA!',
    platform_body:       '{op} {num} → {dest} · Parte às {time} · ~{min} min',
    purchase_success:    'Bilhete confirmado!',
    purchase_sub:        '{dest} · Ref: {ref}',
    purchase_hint:       'Você receberá o QR da Trainline por email.',
    checkout_secure:     'Pagamento seguro · Trainline',
    checkout_compliance: 'Pagamento pela Trainline · WoW TRENES não armazena dados bancários',
    status_safe:         'No horário',
    status_warn:         'Apresse-se',
    status_danger:       'Urgente!',
    loading:             'Carregando...',
    close:               'Fechar',
    back:                'Voltar',
    error_location:      'Não foi possível obter sua localização',
  },

  ja: {
    home_tagline:        '旅はここから始まります。',
    home_sub:            'あなたのような旅行者のために作られた、シンプルで速いアプリ。',
    home_stat_countries: '+{n}か国',
    home_stat_routes:    '数千のルート',
    home_stat_realtime:  'リアルタイム',
    home_explore_title:  '電車で世界を旅しよう',
    home_explore_sub:    '国を選んで次の冒険を見つけよう。',
    home_explore_btn:    '探索する',
    home_gps_question:   'どこから始めればいいかわからない？',
    home_gps_sub:        '現在地を検出して、近くの最適な電車を表示します。',
    home_gps_btn:        '現在地を使用する',
    home_gps_hint:       '素早く、より良い体験のために',
    translator_title:    '看板翻訳',
    translator_camera:   'カメラ',
    translator_text:     'テキスト',
    translator_camera_hint: 'カメラを看板や標識に向けてください',
    translator_text_hint:   '翻訳するテキストを入力',
    translator_from:     '言語を検出',
    translator_to:       '日本語',
    translator_btn:      '翻訳する',
    translator_translating: '翻訳中...',
    translator_error:    '翻訳エラー。接続を確認してください。',
    translator_offline_note: 'よく使うフレーズはオフラインで利用可能。',
    split_back_map:      'マップ',
    split_back_countries:'国一覧',
    split_dest:          '目的地',
    split_how_to_get:    '行き方',
    split_platform:      'ホーム',
    geo_approaching:     '{station}に近づいています',
    geo_approaching_body:'{op} {num}は{time}発{platform}。歩き始めましょう！',
    geo_qr_title:        'QRを表示 — {op} {num}',
    geo_dest_title:      '次の停車駅: {dest}',
    geo_dest_body:       '{op} {num} · 下車の準備を{platform}',
    platform_title:      '電車が{platform}番ホームに到着します！',
    platform_body:       '{op} {num} → {dest} · {time}発 · 約{min}分',
    purchase_success:    '切符が確定されました！',
    purchase_sub:        '{dest} · 予約番号: {ref}',
    purchase_hint:       'TrainlineからQRコードがメールで届きます。到着時にお知らせします。',
    checkout_secure:     'セキュア決済 · Trainline',
    checkout_compliance: 'Trainlineが決済 · WoW TRENESは銀行情報を保存しません',
    status_safe:         '定刻',
    status_warn:         '急いで',
    status_danger:       '緊急！',
    loading:             '読み込み中...',
    close:               '閉じる',
    back:                '戻る',
    error_location:      '現在地を取得できませんでした',
  },

  zh: {
    home_tagline:        '您的旅程从这里开始。',
    home_sub:            '专为像您一样的旅行者打造，简单快速。',
    home_stat_countries: '+{n}个国家',
    home_stat_routes:    '数千条路线',
    home_stat_realtime:  '实时信息',
    home_explore_title:  '乘火车探索世界',
    home_explore_sub:    '选择一个国家，开启您的下一段旅程。',
    home_explore_btn:    '探索',
    home_gps_question:   '不知道从哪里开始？',
    home_gps_sub:        '我们检测您的位置并显示附近最佳列车。',
    home_gps_btn:        '使用我的位置',
    home_gps_hint:       '快速且提升您的体验',
    translator_title:    '标识翻译',
    translator_camera:   '相机',
    translator_text:     '文字',
    translator_camera_hint: '将相机对准任何标牌或指示',
    translator_text_hint:   '输入要翻译的文字',
    translator_from:     '自动检测语言',
    translator_to:       '中文',
    translator_btn:      '翻译',
    translator_translating: '翻译中...',
    translator_error:    '翻译出错，请检查网络连接。',
    translator_offline_note: '常用短语可离线使用。',
    split_back_map:      '地图',
    split_back_countries:'国家',
    split_dest:          '目的地',
    split_how_to_get:    '如何到达',
    split_platform:      '站台',
    geo_approaching:     '您正在接近{station}',
    geo_approaching_body:'{op} {num}将于{time}出发{platform}。请开始步行！',
    geo_qr_title:        '出示二维码 — {op} {num}',
    geo_dest_title:      '下一站: {dest}',
    geo_dest_body:       '{op} {num} · 准备下车{platform}',
    platform_title:      '您的列车即将到达{platform}站台！',
    platform_body:       '{op} {num} → {dest} · {time}出发 · 约{min}分钟',
    purchase_success:    '车票已确认！',
    purchase_sub:        '{dest} · 订单号: {ref}',
    purchase_hint:       '您将通过邮件收到Trainline的二维码，到站时我们会提醒您。',
    checkout_secure:     '安全支付 · Trainline',
    checkout_compliance: 'Trainline处理支付 · WoW TRENES不存储银行信息',
    status_safe:         '准时',
    status_warn:         '请抓紧',
    status_danger:       '紧急！',
    loading:             '加载中...',
    close:               '关闭',
    back:                '返回',
    error_location:      '无法获取您的位置',
  },

  ko: {
    home_tagline:        '여행은 여기서 시작됩니다.',
    home_sub:            '여행자를 위해 만들어진 쉽고 빠른 앱.',
    home_stat_countries: '+{n}개 국가',
    home_stat_routes:    '수천 개의 노선',
    home_stat_realtime:  '실시간',
    home_explore_title:  '기차로 세계를 여행하세요',
    home_explore_sub:    '국가를 선택하고 다음 모험을 찾아보세요.',
    home_explore_btn:    '탐색하기',
    home_gps_question:   '어디서 시작할지 모르겠나요?',
    home_gps_sub:        '현재 위치를 감지하여 근처의 최적 열차를 보여드립니다.',
    home_gps_btn:        '내 위치 사용',
    home_gps_hint:       '빠르고 더 나은 경험을 제공합니다',
    translator_title:    '표지판 번역기',
    translator_camera:   '카메라',
    translator_text:     '텍스트',
    translator_camera_hint: '카메라를 표지판이나 안내판에 향하세요',
    translator_text_hint:   '번역할 텍스트를 입력하세요',
    translator_from:     '언어 자동 감지',
    translator_to:       '한국어',
    translator_btn:      '번역하기',
    translator_translating: '번역 중...',
    translator_error:    '번역 오류. 연결을 확인하세요.',
    translator_offline_note: '자주 쓰는 문장은 오프라인에서도 사용 가능.',
    split_back_map:      '지도',
    split_back_countries:'국가',
    split_dest:          '목적지',
    split_how_to_get:    '가는 방법',
    split_platform:      '플랫폼',
    geo_approaching:     '{station}에 가까워지고 있습니다',
    geo_approaching_body:'{op} {num}은 {time}에 출발{platform}. 걷기 시작하세요!',
    geo_qr_title:        'QR 표시 — {op} {num}',
    geo_dest_title:      '다음 정류장: {dest}',
    geo_dest_body:       '{op} {num} · 내릴 준비를 하세요{platform}',
    platform_title:      '열차가 {platform}번 플랫폼에 도착합니다!',
    platform_body:       '{op} {num} → {dest} · {time} 출발 · 약 {min}분',
    purchase_success:    '티켓이 확정되었습니다!',
    purchase_sub:        '{dest} · 예약번호: {ref}',
    purchase_hint:       'Trainline에서 QR을 이메일로 보내드립니다.',
    checkout_secure:     '안전한 결제 · Trainline',
    checkout_compliance: 'Trainline이 결제 처리 · WoW TRENES는 카드 정보를 저장하지 않습니다',
    status_safe:         '정시',
    status_warn:         '서두르세요',
    status_danger:       '긴급!',
    loading:             '로딩 중...',
    close:               '닫기',
    back:                '뒤로',
    error_location:      '위치를 가져올 수 없습니다',
  },

  fr: {
    home_tagline:        'Votre voyage commence ici.',
    home_sub:            'Facile, rapide et conçu pour des voyageurs comme vous.',
    home_stat_countries: '+{n} pays',
    home_stat_routes:    'Des milliers de trajets',
    home_stat_realtime:  'Temps réel',
    home_explore_title:  'Explorez le monde en train',
    home_explore_sub:    'Choisissez un pays et trouvez votre prochaine aventure.',
    home_explore_btn:    'Explorer',
    home_gps_question:   'Vous ne savez pas par où commencer ?',
    home_gps_sub:        'Nous détectons votre position et affichons les meilleurs trains.',
    home_gps_btn:        'Utiliser ma position',
    home_gps_hint:       'Rapide et améliore votre expérience',
    translator_title:    'Traducteur de panneaux',
    translator_camera:   'Caméra',
    translator_text:     'Texte',
    translator_camera_hint: 'Pointez la caméra vers n\'importe quel panneau',
    translator_text_hint:   'Tapez le texte à traduire',
    translator_from:     'Détecter la langue',
    translator_to:       'Français',
    translator_btn:      'Traduire',
    translator_translating: 'Traduction...',
    translator_error:    'Erreur de traduction. Vérifiez votre connexion.',
    translator_offline_note: 'Phrases courantes disponibles hors ligne.',
    split_back_map:      'Carte',
    split_back_countries:'Pays',
    split_dest:          'DESTINATION',
    split_how_to_get:    'COMMENT Y ALLER',
    split_platform:      'Voie',
    geo_approaching:     'Vous approchez de {station}',
    geo_approaching_body:'{op} {num} part à {time}{platform}. Commencez à marcher !',
    geo_qr_title:        'Montrez votre QR — {op} {num}',
    geo_dest_title:      'Prochain arrêt : {dest}',
    geo_dest_body:       '{op} {num} · Préparez-vous à descendre{platform}',
    platform_title:      'Votre train arrive au quai {platform} MAINTENANT !',
    platform_body:       '{op} {num} → {dest} · Départ {time} · ~{min} min',
    purchase_success:    'Billet confirmé !',
    purchase_sub:        '{dest} · Réf : {ref}',
    purchase_hint:       'Vous recevrez le QR de Trainline par email.',
    checkout_secure:     'Paiement sécurisé · Trainline',
    checkout_compliance: 'Paiement par Trainline · WoW TRENES ne stocke aucune donnée bancaire',
    status_safe:         'À l\'heure',
    status_warn:         'Dépêchez-vous',
    status_danger:       'Urgent !',
    loading:             'Chargement...',
    close:               'Fermer',
    back:                'Retour',
    error_location:      'Impossible d\'obtenir votre position',
  },

  de: {
    home_tagline:        'Ihre Reise beginnt hier.',
    home_sub:            'Einfach, schnell und für Reisende wie Sie gemacht.',
    home_stat_countries: '+{n} Länder',
    home_stat_routes:    'Tausende Routen',
    home_stat_realtime:  'Echtzeit',
    home_explore_title:  'Die Welt per Zug entdecken',
    home_explore_sub:    'Wählen Sie ein Land und finden Sie Ihr nächstes Abenteuer.',
    home_explore_btn:    'Erkunden',
    home_gps_question:   'Wissen Sie nicht, wo Sie anfangen sollen?',
    home_gps_sub:        'Wir erkennen Ihren Standort und zeigen die besten Züge in der Nähe.',
    home_gps_btn:        'Meinen Standort verwenden',
    home_gps_hint:       'Schnell und verbessert Ihre Erfahrung',
    translator_title:    'Schilder-Übersetzer',
    translator_camera:   'Kamera',
    translator_text:     'Text',
    translator_camera_hint: 'Kamera auf Schild oder Tafel richten',
    translator_text_hint:   'Zu übersetzenden Text eingeben',
    translator_from:     'Sprache erkennen',
    translator_to:       'Deutsch',
    translator_btn:      'Übersetzen',
    translator_translating: 'Übersetze...',
    translator_error:    'Übersetzungsfehler. Verbindung prüfen.',
    translator_offline_note: 'Häufige Sätze offline verfügbar.',
    split_back_map:      'Karte',
    split_back_countries:'Länder',
    split_dest:          'ZIEL',
    split_how_to_get:    'WIE KOMME ICH HIN',
    split_platform:      'Gleis',
    geo_approaching:     'Sie nähern sich {station}',
    geo_approaching_body:'{op} {num} fährt um {time}{platform} ab. Beginnen Sie zu gehen!',
    geo_qr_title:        'QR zeigen — {op} {num}',
    geo_dest_title:      'Nächste Haltestelle: {dest}',
    geo_dest_body:       '{op} {num} · Bereit zum Aussteigen{platform}',
    platform_title:      'Ihr Zug fährt JETZT an Gleis {platform} ein!',
    platform_body:       '{op} {num} → {dest} · Abfahrt {time} · ~{min} Min.',
    purchase_success:    'Ticket bestätigt!',
    purchase_sub:        '{dest} · Ref.: {ref}',
    purchase_hint:       'Sie erhalten den QR von Trainline per E-Mail.',
    checkout_secure:     'Sichere Zahlung · Trainline',
    checkout_compliance: 'Zahlung über Trainline · WoW TRENES speichert keine Bankdaten',
    status_safe:         'Pünktlich',
    status_warn:         'Beeilen Sie sich',
    status_danger:       'Dringend!',
    loading:             'Lädt...',
    close:               'Schließen',
    back:                'Zurück',
    error_location:      'Standort konnte nicht ermittelt werden',
  },

  it: {
    home_tagline:        'Il tuo viaggio inizia qui.',
    home_sub:            'Semplice, veloce e pensato per viaggiatori come te.',
    home_stat_countries: '+{n} paesi',
    home_stat_routes:    'Migliaia di rotte',
    home_stat_realtime:  'Tempo reale',
    home_explore_title:  'Esplora il mondo in treno',
    home_explore_sub:    'Scegli un paese e trova la tua prossima avventura.',
    home_explore_btn:    'Esplora',
    home_gps_question:   'Non sai da dove cominciare?',
    home_gps_sub:        'Rileviamo la tua posizione e mostriamo i migliori treni vicino a te.',
    home_gps_btn:        'Usa la mia posizione',
    home_gps_hint:       'Veloce e migliora la tua esperienza',
    translator_title:    'Traduttore di segnali',
    translator_camera:   'Fotocamera',
    translator_text:     'Testo',
    translator_camera_hint: 'Punta la fotocamera su qualsiasi cartello',
    translator_text_hint:   'Scrivi il testo da tradurre',
    translator_from:     'Rileva lingua',
    translator_to:       'Italiano',
    translator_btn:      'Traduci',
    translator_translating: 'Traduzione...',
    translator_error:    'Errore di traduzione. Controlla la connessione.',
    translator_offline_note: 'Frasi comuni disponibili offline.',
    split_back_map:      'Mappa',
    split_back_countries:'Paesi',
    split_dest:          'DESTINAZIONE',
    split_how_to_get:    'COME ARRIVARE',
    split_platform:      'Binario',
    geo_approaching:     'Stai avvicinandoti a {station}',
    geo_approaching_body:'{op} {num} parte alle {time}{platform}. Inizia a camminare!',
    geo_qr_title:        'Mostra il QR — {op} {num}',
    geo_dest_title:      'Prossima fermata: {dest}',
    geo_dest_body:       '{op} {num} · Preparati a scendere{platform}',
    platform_title:      'Il tuo treno sta arrivando al binario {platform} ORA!',
    platform_body:       '{op} {num} → {dest} · Parte alle {time} · ~{min} min',
    purchase_success:    'Biglietto confermato!',
    purchase_sub:        '{dest} · Rif: {ref}',
    purchase_hint:       'Riceverai il QR da Trainline via email.',
    checkout_secure:     'Pagamento sicuro · Trainline',
    checkout_compliance: 'Pagamento tramite Trainline · WoW TRENES non memorizza dati bancari',
    status_safe:         'In orario',
    status_warn:         'Sbrigati',
    status_danger:       'Urgente!',
    loading:             'Caricamento...',
    close:               'Chiudi',
    back:                'Indietro',
    error_location:      'Impossibile ottenere la tua posizione',
  },

  ar: {
    home_tagline:        'رحلتك تبدأ من هنا.',
    home_sub:            'سهل وسريع ومصمم للمسافرين مثلك.',
    home_stat_countries: '+{n} دولة',
    home_stat_routes:    'آلاف المسارات',
    home_stat_realtime:  'الوقت الفعلي',
    home_explore_title:  'استكشف العالم بالقطار',
    home_explore_sub:    'اختر دولة واعثر على مغامرتك القادمة.',
    home_explore_btn:    'استكشف',
    home_gps_question:   'لا تعرف من أين تبدأ؟',
    home_gps_sub:        'نكتشف موقعك ونعرض أفضل القطارات القريبة.',
    home_gps_btn:        'استخدم موقعي',
    home_gps_hint:       'سريع ويحسن تجربتك',
    translator_title:    'مترجم اللافتات',
    translator_camera:   'كاميرا',
    translator_text:     'نص',
    translator_camera_hint: 'وجّه الكاميرا نحو أي لافتة أو إشارة',
    translator_text_hint:   'اكتب النص للترجمة',
    translator_from:     'اكتشاف اللغة',
    translator_to:       'العربية',
    translator_btn:      'ترجم',
    translator_translating: 'جارٍ الترجمة...',
    translator_error:    'خطأ في الترجمة. تحقق من اتصالك.',
    translator_offline_note: 'العبارات الشائعة متاحة بدون إنترنت.',
    split_back_map:      'الخريطة',
    split_back_countries:'الدول',
    split_dest:          'الوجهة',
    split_how_to_get:    'كيفية الوصول',
    split_platform:      'الرصيف',
    geo_approaching:     'أنت تقترب من {station}',
    geo_approaching_body:'قطار {op} {num} يغادر الساعة {time}{platform}. ابدأ المشي!',
    geo_qr_title:        'أظهر رمز QR — {op} {num}',
    geo_dest_title:      'المحطة التالية: {dest}',
    geo_dest_body:       '{op} {num} · استعد للنزول{platform}',
    platform_title:      'قطارك يصل إلى الرصيف {platform} الآن!',
    platform_body:       '{op} {num} → {dest} · يغادر {time} · ~{min} دقيقة',
    purchase_success:    'تم تأكيد التذكرة!',
    purchase_sub:        '{dest} · المرجع: {ref}',
    purchase_hint:       'ستستلم رمز QR من Trainline بالبريد الإلكتروني.',
    checkout_secure:     'دفع آمن · Trainline',
    checkout_compliance: 'الدفع عبر Trainline · WoW TRENES لا يحفظ البيانات المصرفية',
    status_safe:         'في الموعد',
    status_warn:         'أسرع',
    status_danger:       'عاجل!',
    loading:             'جارٍ التحميل...',
    close:               'إغلاق',
    back:                'رجوع',
    error_location:      'تعذّر الحصول على موقعك',
  },
} as const;

// ── Tipo de claves ────────────────────────────────────────────────────────────
type TranslationKey = keyof typeof translations.es;
type Translations   = Record<TranslationKey, string>;

// ── Detección de idioma ───────────────────────────────────────────────────────
function detectLanguage(): AppLanguage {
  const locales = Localization.getLocales();
  if (!locales || locales.length === 0) return 'en';

  const raw = locales[0].languageCode?.toLowerCase() ?? 'en';

  const supported: AppLanguage[] = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh', 'ko', 'ar'];
  if ((supported as string[]).includes(raw)) return raw as AppLanguage;

  // Fallbacks comunes
  if (raw.startsWith('zh')) return 'zh';
  if (raw === 'cn')         return 'zh';

  return 'en'; // fallback universal
}

// ── Estado global (singleton) ─────────────────────────────────────────────────
let currentLang: AppLanguage      = detectLanguage();
let currentStrings: Translations  = translations[currentLang] as Translations;

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * t — traduce una clave con soporte de interpolación.
 *
 * @example
 *   t('home_stat_countries', { n: 10 }) → '+10 países' (en español)
 *   t('home_stat_countries', { n: 10 }) → '+10 countries' (en inglés)
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let str: string = currentStrings[key] ?? (translations.en as Translations)[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

/**
 * getLanguage — devuelve el idioma activo.
 */
export function getLanguage(): AppLanguage {
  return currentLang;
}

/**
 * setLanguage — cambia el idioma manualmente (override del automático).
 * Útil para un selector de idioma en Settings.
 */
export function setLanguage(lang: AppLanguage): void {
  currentLang   = lang;
  currentStrings = translations[lang] as Translations;
}

/**
 * resetToDeviceLanguage — vuelve al idioma del teléfono.
 */
export function resetToDeviceLanguage(): void {
  setLanguage(detectLanguage());
}

/**
 * getSupportedLanguages — lista de idiomas disponibles con sus nombres nativos.
 */
export const SUPPORTED_LANGUAGES: { code: AppLanguage; name: string; flag: string }[] = [
  { code: 'es', name: 'Español',    flag: '🇪🇸' },
  { code: 'en', name: 'English',    flag: '🇬🇧' },
  { code: 'pt', name: 'Português',  flag: '🇧🇷' },
  { code: 'fr', name: 'Français',   flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch',    flag: '🇩🇪' },
  { code: 'it', name: 'Italiano',   flag: '🇮🇹' },
  { code: 'ja', name: '日本語',      flag: '🇯🇵' },
  { code: 'zh', name: '中文',        flag: '🇨🇳' },
  { code: 'ko', name: '한국어',      flag: '🇰🇷' },
  { code: 'ar', name: 'العربية',    flag: '🇸🇦' },
];

/**
 * isRTL — indica si el idioma activo se escribe de derecha a izquierda.
 * Útil para invertir layouts en árabe.
 */
export function isRTL(): boolean {
  return currentLang === 'ar';
}
