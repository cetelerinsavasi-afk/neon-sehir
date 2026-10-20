// =============================================================================
// v105 — Oyun salonu DOĞRUDAN BAĞLANTI (WebRTC veri kanalı).
// Neden: maç trafiği (saniyede ~30 durum + girdi) Realtime Database üzerinden
// gidip gelince katılan oyuncu ev sahibini 150–400 ms geriden görüyordu; ev
// sahibi de aynı anda en fazla 2 yazmayı yolda tuttuğu için yavaş bağlantıda
// konuğa saniyede 30 yerine 7–10 kare düşüyordu → "katılanın oyunu kasıyor".
// Artık iki cihaz birbirine doğrudan bağlanır (genelde 20–80 ms, Firebase'e
// HİÇ trafik yok). RTDB sadece tanışma için kullanılır: oda başına konuk başına
// 2 küçük yazma (teklif + cevap, ICE adayları SDP'nin içinde).
//   arcade/{oyun}/{oda}/rtc/{konukUid} = { o: teklif (ev sahibi), a: cevap (konuk) }
// Bağlantı kurulamazsa (bazı mobil operatör ağları, eski cihaz, kurallar
// yüklenmemiş) oyun otomatik olarak eski RTDB yolunda devam eder — bozulmaz.
// Ücretsiz Google STUN sunucusu kullanılır; TURN (ücretli aktarma) YOK.
// =============================================================================
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
export const P2P_SUPPORTED = typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function';
const OPEN_TIMEOUT_MS = 9000;
const GATHER_MAX_MS = 2500;

// ICE adayları toplanana kadar bekle (en fazla GATHER_MAX_MS) → tek seferde SDP
function gathered(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((res) => {
    const t = setTimeout(done, GATHER_MAX_MS);
    function done() {
      clearTimeout(t);
      pc.removeEventListener('icegatheringstatechange', check);
      res();
    }
    function check() {
      if (pc.iceGatheringState === 'complete') done();
    }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

// Ev sahibi: bir konuk için bağlantı kurar.
//   onMessage(text) · onOpen() · onClose()   Döner: { send(text), isOpen(), close() }
export function hostPeer({ m, db, base, guestUid, onMessage, onOpen, onClose }) {
  let pc = null;
  let ch = null;
  let open = false;
  let closed = false;
  let offAns = () => {};
  let timer = 0;
  const ref = m.ref(db, `${base}/rtc/${guestUid}`);
  const end = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    offAns();
    try {
      ch?.close();
      pc?.close();
    } catch {
      /* yoksay */
    }
    open = false;
    onClose?.(); // açılmadan kapandıysa da haber ver → yeniden deneme / RTDB yolu
  };
  (async () => {
    try {
      pc = new RTCPeerConnection({ iceServers: ICE });
      ch = pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 });
      ch.onopen = () => {
        if (closed) return;
        open = true;
        clearTimeout(timer);
        onOpen?.();
      };
      ch.onclose = end;
      ch.onmessage = (e) => onMessage?.(e.data);
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') end();
      };
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      if (closed) return;
      const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      await m.set(ref, { o: JSON.stringify({ id, sdp: pc.localDescription.sdp }) });
      offAns = m.onValue(
        m.child(ref, 'a'),
        async (s) => {
          const v = s.val();
          if (!v || closed || pc.remoteDescription) return;
          try {
            const a = JSON.parse(v);
            if (a.id !== id) return;
            await pc.setRemoteDescription({ type: 'answer', sdp: a.sdp });
          } catch {
            end();
          }
        },
        () => {}
      );
      timer = setTimeout(() => !open && end(), OPEN_TIMEOUT_MS);
    } catch {
      end(); // kural yok / WebRTC yok → RTDB yolu
    }
  })();
  return {
    send: (text) => {
      if (!open || ch.readyState !== 'open') return false;
      // ağ tamponu dolduysa (yavaş bağlantı) kareyi atla — yeni kare zaten eskisinin yerine geçer
      if (ch.bufferedAmount > 64 * 1024) return true;
      try {
        ch.send(text);
        return true;
      } catch {
        return false;
      }
    },
    isOpen: () => open,
    close: end,
  };
}

// Konuk: ev sahibinin teklifini bekler, cevaplar.
//   Döner: { send(text), isOpen(), close() }
export function guestPeer({ m, db, base, myUid, onMessage, onOpen, onClose }) {
  let pc = null;
  let ch = null;
  let open = false;
  let closed = false;
  let answeredId = '';
  const ref = m.ref(db, `${base}/rtc/${myUid}`);
  const drop = () => {
    try {
      ch?.close();
      pc?.close();
    } catch {
      /* yoksay */
    }
    ch = null;
    pc = null;
    if (open) {
      open = false;
      onClose?.();
    }
  };
  const offOffer = m.onValue(
    m.child(ref, 'o'),
    async (s) => {
      const v = s.val();
      if (!v || closed) return;
      let o;
      try {
        o = JSON.parse(v);
      } catch {
        return;
      }
      if (!o?.id || o.id === answeredId) return;
      answeredId = o.id;
      drop(); // ev sahibi yeniden denediyse eski bağlantıyı bırak
      try {
        const p = new RTCPeerConnection({ iceServers: ICE });
        pc = p;
        p.ondatachannel = (e) => {
          ch = e.channel;
          ch.onopen = () => {
            if (closed) return;
            open = true;
            onOpen?.();
          };
          ch.onclose = () => {
            if (ch === e.channel) drop();
          };
          ch.onmessage = (ev) => onMessage?.(ev.data);
        };
        p.onconnectionstatechange = () => {
          if (pc === p && (p.connectionState === 'failed' || p.connectionState === 'closed')) drop();
        };
        await p.setRemoteDescription({ type: 'offer', sdp: o.sdp });
        await p.setLocalDescription(await p.createAnswer());
        await gathered(p);
        if (closed || pc !== p) return;
        await m.set(m.child(ref, 'a'), JSON.stringify({ id: o.id, sdp: p.localDescription.sdp }));
      } catch {
        drop();
      }
    },
    () => {}
  );
  return {
    send: (text) => {
      if (!open || !ch || ch.readyState !== 'open') return false;
      if (ch.bufferedAmount > 16 * 1024) return true;
      try {
        ch.send(text);
        return true;
      } catch {
        return false;
      }
    },
    isOpen: () => open,
    close: () => {
      closed = true;
      offOffer();
      drop();
    },
  };
}
