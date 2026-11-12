// =============================================================================
// HeistVideo — v154 şehir dışında (Mekanlar › Soygun) soygun videosu.
// Tam ekran bir kapta şehir motorunu kurar (ağ yok, Firestore yok), hedefin önünde doğar:
//   • mekân soygunu → cityHeist dizisi (1–4 kişi · başarılı / yakalandı / gizli polis)
//   • seyyar satıcı haracı → şehirdeki haraç animasyonu (silah doğrult → para / polis)
// Sunucu çağrısı ÖNCE başlar (sonuç butona basınca belli olur); video sonucu sonda gösterir.
// "Geç ⏭" her an kapatır. Kapanınca motor tamamen kapatılır.
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createCityEngine } from './cityEngine';
import { prepareCityWorld } from './world/outerWorld.js';
import { IS_MOBILE_DEVICE } from '../../lib/photoCache';
import { VENDORS } from '../../../functions/vendorData.js';
import { heistOutcomeOf, heistSceneOf, isVendorHeist } from '../HeistPanel/heistVideo';
import './City.css';

// job: { target, crew:[{name, avatar}], carId, carMods, promise (sunucu çağrısı) }
// onClose({ data, error, played }) — played: video sonuna kadar (ya da Geç ile) oynadı
export default function HeistVideo({ job, onClose }) {
  const stageRef = useRef(null);
  const [phase, setPhase] = useState('load'); // load · play
  const closeRef = useRef(null);

  useEffect(() => {
    let eng = null;
    let closed = false;
    let data = null;
    let error = null;
    let played = false;
    let server = null;
    // kapat: motoru hemen kapat, sonucu sunucu cevap verince ilet (Geç'e erken basılsa da sonuç kaybolmaz)
    const finish = () => {
      if (closed) return;
      closed = true;
      try {
        eng?.dispose();
      } catch {
        /* yoksay */
      }
      eng = null;
      setPhase('done');
      Promise.resolve(server).then(() => onClose?.({ data, error, played }));
    };
    closeRef.current = finish;

    const vendor = isVendorHeist(job.target);
    const venueKey = vendor ? VENDORS[job.target]?.venue : null;
    const scene = vendor ? null : heistSceneOf(job.target);
    const me = job.crew?.[0] || {};
    // sunucu sonucu (butona basıldığı anda başladı)
    server = Promise.resolve(job.promise).then(
      (r) => {
        data = r?.data ?? r ?? null;
        return data;
      },
      (e) => {
        error = e;
        return null;
      }
    );

    const run = async () => {
      if (closed || !eng) return;
      if (vendor && venueKey) {
        const began = Boolean(eng.haracBegin?.(venueKey));
        setPhase('play');
        const d = await server;
        if (closed) return;
        if (began) {
          await eng.haracEnd({ outcome: !d?.started ? 'cancel' : d.caught ? 'caught' : 'ok', reward: d?.reward });
          // haraçta sonuç kartı yok → panel sonucu kendi penceresinde gösterir (played: false)
          // animasyonun sonu (para / polis) biraz görünsün
          await new Promise((r) => setTimeout(r, 900));
        }
        finish();
        return;
      }
      const d = await server;
      if (closed) return;
      const oc = heistOutcomeOf(d);
      if (!oc || !scene) return finish();
      const ok = eng.heist?.start({
        target: scene,
        crew: job.crew.map((c) => ({ name: c.name || 'Oyuncu', avatar: c.avatar || null })),
        outcome: oc.outcome,
        reward: oc.amount,
        carId: job.carId,
        carMods: job.carMods,
        onDone: () => {
          played = true;
          finish();
        },
      });
      if (!ok) return finish();
      setPhase('play');
    };

    // v157: dünya adım adım kurulur (ana iş parçacığı donmasın), sonra motor
    prepareCityWorld({ mobile: IS_MOBILE_DEVICE })
      .then((world) => {
        if (closed || !stageRef.current) return;
        eng = createCityEngine(stageRef.current, {
          uid: 'heist_me',
          avatar: me.avatar || null,
          name: me.name || 'Sen',
          spawn: vendor ? venueKey || 'ev' : job.target,
          world,
          onReady: () => {
            run().catch(() => finish());
          },
        });
      })
      .catch((e) => {
        console.error('Soygun videosu kurulamadı:', e);
        // grafik kurulamazsa: sonucu bekle, video olmadan kapat
        server.then(() => finish());
      });
    return () => {
      closed = true;
      try {
        eng?.dispose();
      } catch {
        /* yoksay */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'done') return null;
  // en üst katmanda (Mekanlar penceresinin içinden açılsa da üstünde hiçbir şey kalmasın)
  return createPortal(
    <div className="hs-root cs-root hv-root">
      <div className="hs-stage" ref={stageRef} />
      {phase === 'load' && (
        <div className="hs-loading cs-loading hv-loading">
          <div className="hs-spinner" />
          <p>{isVendorHeist(job.target) ? 'Haraç kesiliyor…' : 'Soygun başlıyor…'}</p>
        </div>
      )}
      {/* v156: soygunda yüklenirken sağ altta düğme yok (videonun kendi "Geç"i var); haraçta sağ üstte */}
      {isVendorHeist(job.target) && (
        <button className="hv-skip" onClick={() => closeRef.current?.()}>
          Geç
        </button>
      )}
    </div>,
    document.body
  );
}
