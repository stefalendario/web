/**
 * firebase-messaging-sw.js  — Stefalendario Web Push
 *
 * Deve essere servito dalla ROOT del sito (stesso origin/path di index.html),
 * qualunque essa sia (es. /web2/ in test, /web/ in produzione). Il percorso
 * NON è hardcoded: viene derivato a runtime da self.registration.scope, che
 * il browser imposta in base a dove il file è stato registrato in index.html.
 * => Passando da /web2/ a /web/ in produzione questo file NON va toccato.
 *
 * IMPORTANTE: questo file usa importScripts (non ES modules) perché i
 * Service Worker non supportano ancora "import" nativo in tutti i browser.
 *
 * Payload FCM atteso (data-only, identico all'app Android):
 *   type       = "event" | "program" | "quick_event"
 *   id         = Firestore document id
 *   senderUid  = uid di chi ha creato l'item
 *   notifTitle = titolo formattato da Apps Script
 *   notifBody  = body formattato da Apps Script
 *   eventDate  = "yyyy-MM-dd" (solo per type="event")
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBL-Dii8MNDzSby7F-E_A-mGFXVrsKV6t8",
  authDomain:        "stregalendario.firebaseapp.com",
  projectId:         "stregalendario",
  storageBucket:     "stregalendario.firebasestorage.app",
  messagingSenderId: "1066064406702",
  appId:             "1:1066064406702:web:0bb2201f4929b3c77e653f"
});

const messaging = firebase.messaging();

// Base path dell'app, dedotta dallo scope di registrazione del SW
// (es. "https://tuosito.github.io/web2/" oppure ".../web/" in produzione).
function getBase() {
  return self.registration.scope; // termina sempre con "/"
}

const TYPE_META = {
  event:       { title: 'Nuovo evento in Stefalendario 🎉',    body: 'Tocca per vedere i dettagli' },
  program:     { title: 'Nuovo programma in Stefalendario 📂', body: 'Tocca per vedere i programmi' },
  quick_event: { title: 'Evento rapido adesso ⚡',              body: 'Tocca per vedere i dettagli' }
};

// ── Notifiche in background (app web chiusa o in background) ────────────────
//
// I messaggi FCM data-only NON vengono mostrati automaticamente dal browser
// (a differenza dei messaggi con blocco `notification`). Dobbiamo costruire
// la notifica noi stessi — esattamente come fa StefalendarioFcmService su Android.
//
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] onBackgroundMessage', payload);

  const data      = payload.data || {};
  const type      = data.type      || '';
  const id        = data.id        || '';
  const eventDate = data.eventDate || '';

  // Hardening: ignora payload malformati
  if (!type || !id) {
    console.warn('[SW] Payload incompleto, ignoro. type=', type, 'id=', id);
    return;
  }
  const meta = TYPE_META[type];
  if (!meta) {
    console.warn('[SW] Tipo notifica sconosciuto:', type);
    return;
  }

  // Fallback titolo/body se Apps Script non li manda
  const title = data.notifTitle || meta.title;
  const body  = data.notifBody  || meta.body;

  const base = getBase();

  // Il dato che usiamo al click per navigare alla schermata giusta
  // (specchio degli extra notif_type / notif_id / notif_date dell'app Android)
  const notificationData = { type, id, eventDate };

  return self.registration.showNotification(title, {
    body,
    icon:  base + 'icon-192.png',
    badge: base + 'icon-96.png',
    tag:   `stefalendario-${type}-${id}`,   // evita notifiche duplicate
    renotify: false,
    data: notificationData
  });
});

// ── Click sulla notifica ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data      = event.notification.data || {};
  const type      = data.type      || '';
  const id        = data.id        || '';
  const eventDate = data.eventDate || '';

  const base = getBase();

  // Costruisce la URL di destinazione (parallelo alla navigazione Android)
  let targetUrl;
  if (type === 'event') {
    targetUrl = eventDate
      ? `${base}?notif_type=event&notif_id=${encodeURIComponent(id)}&notif_date=${encodeURIComponent(eventDate)}`
      : `${base}?notif_type=event&notif_id=${encodeURIComponent(id)}`;
  } else if (type === 'program') {
    targetUrl = `${base}?notif_type=program&notif_id=${encodeURIComponent(id)}`;
  } else if (type === 'quick_event') {
    targetUrl = `${base}?notif_type=quick_event&notif_id=${encodeURIComponent(id)}`;
  } else {
    targetUrl = base;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Se la PWA è già aperta, porta in primo piano e passa il messaggio
      for (const client of clientList) {
        if (client.url.startsWith(base) && 'focus' in client) {
          client.focus();
          // Invia il payload alla pagina aperta via postMessage
          client.postMessage({
            type:      'FCM_NOTIFICATION_CLICK',
            notifType: type,
            notifId:   id,
            notifDate: eventDate
          });
          return;
        }
      }
      // Altrimenti apri una nuova finestra con i parametri nella URL
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
