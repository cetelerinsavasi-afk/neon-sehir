// v134 — MİSAFİR (giriş yapmamış) Stadyum: liglerin puan durumları (salt okuma).
// Veriler sunucudan (houseAction 'guestLeagues', 5 dk önbellek) — Firestore
// kuralları girişsiz okumaya izin vermiyor.
import { useEffect, useState } from 'react';
import { StandingsTable } from './FutbolLigler';
import { compareStandings } from '../../hooks/useFutbolTeams';
import { guestLeagues } from '../../lib/guestApi';
import GuestSignInSheet from '../Guest/GuestSignInSheet';
import './FutbolFullScreen.css';
import './FutbolLigler.css';
import '../Guest/Guest.css';

export default function GuestFutbol({ onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [leagueId, setLeagueId] = useState(null);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    let alive = true;
    guestLeagues()
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);
  const leagues = data?.leagues || [];
  const active = leagues.find((l) => l.id === leagueId) || leagues[0] || null;
  const teams = active ? [...(data.teams?.[active.id] || [])].sort(compareStandings) : [];
  return (
    <div className="futbol-fullscreen">
      <div className="futbol-fullscreen-header">
        <span className="futbol-fullscreen-title">⚽ Futbol · Puan Durumu</span>
        <button className="futbol-fullscreen-close" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div className="gv-page">
        {err && <p className="futbol-placeholder">Bağlanılamadı.</p>}
        {!data && !err && <p className="futbol-placeholder">Yükleniyor...</p>}
        {leagues.length > 0 && (
          <div className="futbol-league-tabs">
            {leagues.map((l) => (
              <button key={l.id} className={`futbol-league-tab ${active?.id === l.id ? 'active' : ''}`} onClick={() => setLeagueId(l.id)}>
                {l.name}
              </button>
            ))}
          </div>
        )}
        {active && (
          <div className="gv-table-wrap">
            <StandingsTable teams={teams} />
          </div>
        )}
        <button type="button" className="gv-cta" onClick={() => setAsk(true)}>
          ⚽ Takım kur, maç izle, iddaa oyna — giriş yap
        </button>
      </div>
      {ask && <GuestSignInSheet onClose={() => setAsk(false)} />}
    </div>
  );
}
