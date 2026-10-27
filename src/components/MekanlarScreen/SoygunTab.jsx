import { useEffect, useState } from 'react';
import { useWeapons } from '../../hooks/useWeapons';
import { useOpenHeistPlanCounts } from '../../hooks/useOpenHeistPlanCounts';
import { useMyActiveHeistPlans } from '../../hooks/useMyActiveHeistPlan';
import { usePlayer } from '../../hooks/usePlayer';
import HeistPanel, { HEIST_LABELS } from '../HeistPanel/HeistPanel';
import GuestOverlay from '../GuestOverlay/GuestOverlay';
import { INITIAL_LIFE_DAYS } from '../VehicleCard/VehicleCard';
import './MekanlarScreen.css';

// SoygunTab — eskiden HeistScreen.jsx'in TAMAMIYDI (kendi backdrop/başlık/
// kapatma çerçevesiyle). Artık "Mekanlar" ekranının bir sekmesi (bkz.
// MekanlarScreen.jsx) — dış çerçeve (backdrop/başlık/sekme çubuğu/kapatma)
// yukarı taşındı, burada SADECE hedef listesi + ekip planları + detay
// paneli kalıyor. Davranış eskisiyle BİREBİR aynı (yeni istek: "soygun
// kısmı şu ankiyle aynı olacak") — tek görsel fark, her hedefin artık bir
// emojisi olması (bkz. HEIST_LABELS).

// v132.1 — hedefler büyüklüğe göre gruplanır (görsel liste)
const GROUPS = [
  ['Büyük vurgun', ['banka', 'casino', 'araba_galerisi']],
  ['Orta boy iş', ['modifiye_garaji', 'fabrika']],
  ['Sokak haracı', ['seyyar_satici_1', 'seyyar_satici_2', 'seyyar_satici_3', 'seyyar_satici_4']],
];
// oyundaki en yüksek silah gücü (Gücün çubuğu bu değerde dolar)
const MAX_POWER = 40000;

const n = (x) => Number(x || 0).toLocaleString('tr-TR');
const pct = (a, b) => `${Math.max(0, Math.min(100, b > 0 ? (a / b) * 100 : 0))}%`;

// v132.1 — görsel hedef kartı (emoji kutusu · ad · ödül · güç çubuğu · durum)
function TargetCard({ target, onClick, badge, myPower }) {
  const meta = HEIST_LABELS[target];
  if (!meta) return null;
  const ok = myPower >= meta.requiredPower;
  return (
    <button className={`sg-card${ok ? ' ready' : ''}`} onClick={onClick}>
      {badge > 0 && <span className="sg-badge">{badge} ekip</span>}
      <span className="sg-em">{meta.emoji}</span>
      <span className="sg-nm">{meta.title}</span>
      <span className="sg-rw">
        {n(meta.reward)} <span className="gold-coin-icon" style={{ width: 13, height: 13 }} />
      </span>
      <span className="sg-sub">
        <span className="sg-meter">
          <i style={{ width: pct(myPower, meta.requiredPower) }} />
        </span>
        ⚔️ {n(meta.requiredPower)}
        <span className={`sg-tag ${ok ? 'ok' : 'tm'}`}>{ok ? 'Gücün yetiyor' : 'Ekip gerekir'}</span>
      </span>
    </button>
  );
}

export default function SoygunTab({ initialTarget }) {
  const { player } = usePlayer();
  const { weapons } = useWeapons();
  const planCounts = useOpenHeistPlanCounts();
  const myActivePlans = useMyActiveHeistPlans();
  const [selected, setSelected] = useState(initialTarget || null);
  const [showMyPlans, setShowMyPlans] = useState(false);

  useEffect(() => {
    if (initialTarget) {
      setSelected(initialTarget);
      setShowMyPlans(false);
    }
  }, [initialTarget]);

  // KULLANICI REVİZESİ (BUG DÜZELTMESİ): ömrü (lifeDays) 0 olan bir silah —
  // tamir hakkı kalmış olsa bile — güç hesabına dahil edilmemeli. Ayrıca
  // 2. el sitesinde satılmış/satışa çıkarılmış (listed: true) bir silah da
  // artık fiilen elimizde değildir, onun da gücü sayılmamalı (bkz.
  // functions/index.js getMaxWeaponPower'daki aynı düzeltme — burası
  // ekranın sunucuyla TUTARLI göstermesi için).
  const myPower = weapons.reduce(
    (max, w) => (!w.listed && (w.lifeDays ?? INITIAL_LIFE_DAYS) > 0 ? Math.max(max, w.power || 0) : max),
    0
  );

  const suspicion = Math.round(Number(player?.suspicion || 0));
  const locked = suspicion >= 50;
  return (
    <div className="mekanlar-soygun-tab">
      {!selected && (
        <div className="sg-status">
          <div className="sg-st">
            <small>⚔️ Gücün</small>
            <b>{n(myPower)}</b>
            <div className="sg-meter">
              <i style={{ width: pct(myPower, MAX_POWER) }} />
            </div>
          </div>
          <div className={`sg-st${locked ? ' warn' : ''}`}>
            <small>🕵️ Şüphen{locked ? ' · suç kilitli' : ''}</small>
            <b>{suspicion}/100</b>
            <div className="sg-meter">
              <i style={{ width: pct(suspicion, 100) }} />
              <u style={{ left: '50%' }} />
            </div>
          </div>
        </div>
      )}
      {!selected && myActivePlans.length > 0 && (
        <button
          className="sg-myplan"
          onClick={() => {
            if (myActivePlans.length === 1) {
              setSelected(myActivePlans[0].target);
              setShowMyPlans(false);
            } else {
              setSelected(null);
              setShowMyPlans((v) => !v);
            }
          }}
        >
          👥 Ekip Soygunlarım ({myActivePlans.length})
        </button>
      )}

      <GuestOverlay>
        <>
          {showMyPlans && !selected && (
            <div className="heist-screen-list">
              <p className="sg-grp">Açık ekiplerin</p>
              {myActivePlans.map((p) => (
                <TargetCard
                  key={p.planId}
                  myPower={myPower}
                  target={p.target}
                  onClick={() => {
                    setSelected(p.target);
                    setShowMyPlans(false);
                  }}
                />
              ))}
              <button className="sg-back" onClick={() => setShowMyPlans(false)}>
                ← Tüm hedefler
              </button>
            </div>
          )}

          {!selected && !showMyPlans && (
            <div className="heist-screen-list">
              {GROUPS.map(([title, keys]) => (
                <div key={title} className="sg-group">
                  <p className="sg-grp">{title}</p>
                  {keys
                    .filter((k) => HEIST_LABELS[k])
                    .map((target) => (
                      <TargetCard key={target} myPower={myPower} target={target} badge={planCounts[target] || 0} onClick={() => setSelected(target)} />
                    ))}
                </div>
              ))}
            </div>
          )}

          {selected && (
            <div className="heist-screen-detail">
              <button
                className="sg-back"
                onClick={() => {
                  setSelected(null);
                  setShowMyPlans(false);
                }}
              >
                ← Tüm hedefler
              </button>
              <HeistPanel target={selected} />
            </div>
          )}
        </>
      </GuestOverlay>
    </div>
  );
}
