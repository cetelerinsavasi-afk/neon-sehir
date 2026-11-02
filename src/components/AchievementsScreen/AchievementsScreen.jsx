import { useEffect } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { syncAchievements } from '../../services/gameActions';
import { ACHIEVEMENTS, LEGACY_ACHIEVEMENT_REWARDS, REFERRAL_STEP_EMERALD } from '../../../functions/achievementsData.js';
import './AchievementsScreen.css';

// v67 — Telefon › Başarılar. Her başarı bir kez kazanılır, ödülü zümrüttür
// (sunucuda verilir, SMS ile bildirilir). Tamamlananlar karartılır.
// v141: aşamalı başarı (davet: 10 aşama, her aşama 1 zümrüt) — kartın altında aşama çubuğu.
// Davet her zaman en üstte, belediye başkanı her zaman en altta.
const PIN_TOP = 'davet';
const PIN_BOTTOM = 'belediyeBaskani';

export default function AchievementsScreen() {
  const { player } = usePlayer();
  const done = player?.achievements || {};
  useEffect(() => {
    // imam / Mafya Babası / İstihbarat Başkanı / belediye başkanı gibi durumları anında kontrol et
    syncAchievements().catch(() => {});
  }, []);
  const stepsOf = (a) => (a.steps ? (done[a.id] ? a.steps : Math.min(a.steps, Math.max(0, Number(player?.referralCount) || 0))) : 0);
  const doneCount = ACHIEVEMENTS.filter((a) => done[a.id]).length;
  // v74: önceden kazanılanlar eski ödülle sayılır (fark verilmedi)
  const got = player?.achievementRewards || {};
  const earned = ACHIEVEMENTS.reduce((s, a) => {
    if (done[a.id]) return s + (got[a.id] ?? LEGACY_ACHIEVEMENT_REWARDS[a.id] ?? a.reward);
    if (a.steps) return s + stepsOf(a) * REFERRAL_STEP_EMERALD; // aşamalı: kazanılan aşamalar
    return s;
  }, 0);
  const total = ACHIEVEMENTS.reduce((s, a) => s + a.reward, 0);
  // tamamlanmayanlar üstte, kendi içlerinde liste sırasıyla; davet en üstte, başkanlık en altta
  const rank = (a) => (a.id === PIN_TOP ? -1 : a.id === PIN_BOTTOM ? 2 : Number(Boolean(done[a.id])));
  const list = [...ACHIEVEMENTS].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="ach">
      <div className="ach-hero">
        <div className="ach-trophy" aria-hidden="true">🏆</div>
        <div className="ach-hero-text">
          <b>
            {doneCount}/{ACHIEVEMENTS.length} başarı
          </b>
          <span>
            <span className="emerald-icon" style={{ width: 13, height: 13 }} /> {earned}/{total} zümrüt kazanıldı
          </span>
        </div>
      </div>
      <div className="ach-bar">
        <i style={{ width: `${(doneCount / ACHIEVEMENTS.length) * 100}%` }} />
      </div>
      <div className="ach-list">
        {list.map((a) => {
          const at = done[a.id];
          const st = stepsOf(a);
          return (
            <div key={a.id} className={`ach-card${at ? ' done' : ''}${a.steps ? ' staged' : ''}`}>
              <span className="ach-emoji">{a.emoji}</span>
              <span className="ach-body">
                <b>{a.title}</b>
                <span>{a.desc}</span>
                {at && <em>✓ {new Date(at).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} tarihinde kazanıldı</em>}
              </span>
              <span className="ach-reward">
                {at ? '✓' : a.steps ? `+${REFERRAL_STEP_EMERALD}` : `+${a.reward}`}
                {!at && <span className="emerald-icon" style={{ width: 13, height: 13 }} />}
              </span>
              {a.steps && (
                <span className="ach-steps" aria-label={`${st}/${a.steps} aşama`}>
                  <span className="ach-steps-bar">
                    {Array.from({ length: a.steps }, (_, i) => (
                      <i key={i} className={i < st ? 'on' : ''} />
                    ))}
                  </span>
                  <small>
                    {st}/{a.steps} aşama · {st * REFERRAL_STEP_EMERALD}/{a.reward} zümrüt
                  </small>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="ach-note">Her başarı bir kez kazanılır. Kazandığında SMS ile haber verilir ve zümrüt hesabına yüklenir.</p>
    </div>
  );
}
