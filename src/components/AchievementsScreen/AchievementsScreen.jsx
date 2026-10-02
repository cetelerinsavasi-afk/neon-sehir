import { useEffect } from 'react';
import { usePlayer } from '../../hooks/usePlayer';
import { syncAchievements } from '../../services/gameActions';
import { ACHIEVEMENTS, LEGACY_ACHIEVEMENT_REWARDS } from '../../../functions/achievementsData.js';
import './AchievementsScreen.css';

// v67 — Telefon › Başarılar. Her başarı bir kez kazanılır, ödülü zümrüttür
// (sunucuda verilir, SMS ile bildirilir). Tamamlananlar karartılır.
export default function AchievementsScreen() {
  const { player } = usePlayer();
  const done = player?.achievements || {};
  useEffect(() => {
    // imam / Mafya Babası / İstihbarat Başkanı gibi durumları anında kontrol et
    syncAchievements().catch(() => {});
  }, []);
  const doneCount = ACHIEVEMENTS.filter((a) => done[a.id]).length;
  // v74: önceden kazanılanlar eski ödülle sayılır (fark verilmedi)
  const got = player?.achievementRewards || {};
  const earned = ACHIEVEMENTS.filter((a) => done[a.id]).reduce((s, a) => s + (got[a.id] ?? LEGACY_ACHIEVEMENT_REWARDS[a.id] ?? a.reward), 0);
  const total = ACHIEVEMENTS.reduce((s, a) => s + a.reward, 0);
  // tamamlanmayanlar üstte, kendi içlerinde ödül sırasıyla
  const list = [...ACHIEVEMENTS].sort((a, b) => Number(Boolean(done[a.id])) - Number(Boolean(done[b.id])));

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
          return (
            <div key={a.id} className={`ach-card${at ? ' done' : ''}`}>
              <span className="ach-emoji">{a.emoji}</span>
              <span className="ach-body">
                <b>{a.title}</b>
                <span>{a.desc}</span>
                {at && <em>✓ {new Date(at).toLocaleDateString('tr-TR')} tarihinde kazanıldı</em>}
              </span>
              <span className="ach-reward">
                {at ? '✓' : `+${a.reward}`}
                {!at && <span className="emerald-icon" style={{ width: 13, height: 13 }} />}
              </span>
            </div>
          );
        })}
      </div>
      <p className="ach-note">Her başarı bir kez kazanılır. Kazandığında SMS ile haber verilir ve zümrüt hesabına yüklenir.</p>
    </div>
  );
}
