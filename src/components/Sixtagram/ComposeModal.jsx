import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { usePlayer } from '../../hooks/usePlayer';
import { useVehicles } from '../../hooks/useVehicles';
import { useRecentFutbolBets } from '../../hooks/useRecentFutbolBets';
import { useTodayFootballMatches } from '../../hooks/useTodayFootballMatches';
import { useLeagueLastMatches } from '../../hooks/useLeagueLastMatches';
import { useFutbolLeagues } from '../../hooks/useFutbolLeagues';
import { useFutbolTeams } from '../../hooks/useFutbolTeams';
import { useFutbolMatches } from '../../hooks/useFutbolMatches';
import { useInvestmentHistory } from '../../hooks/useInvestmentHistory';
import { useInvestmentPrices } from '../../hooks/useInvestmentPrices';
import { useMessages } from '../../hooks/useMessages';
import { vehicleImage } from '../VehicleCard/VehicleCard';
import { createSixtagramPost } from '../../services/gameActions';
import PostAttachment from './PostAttachment';
import './ComposeModal.css';

const MAX_LEN = 280;

const ASSET_OPTIONS = [
  { id: 'diamond', label: 'Elmas', field: 'diamondPrice' },
  { id: 'stock', label: 'Hisse Senedi', field: 'stockPrice' },
  { id: 'crypto', label: 'Kripto', field: 'cryptoPrice' },
];

function istanbulDateKeyOffset(offsetDays) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

export default function ComposeModal({ onClose, onPosted }) {
  const [text, setText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  // subPicker: 'vehicle' | 'iddaa' | 'investment' | 'upcomingMatches' | 'lastMatches' | null
  const [subPicker, setSubPicker] = useState(null);
  const [pendingLeagueId, setPendingLeagueId] = useState(null);
  const [pendingLastMatchesLeagueId, setPendingLastMatchesLeagueId] = useState(null);
  // attachmentDraft — SUNUCUYA gidecek minimal seçim (örn. { type:
  // 'vehicle', vehicleId }). Sunucu gerçek veriyi kendisi okuyup
  // doğrulayarak gömer (bkz. functions/index.js buildSixtagramAttachment).
  const [attachmentDraft, setAttachmentDraft] = useState(null);
  // attachmentPreview — SADECE burada, istemcide, "paylaşmadan önce nasıl
  // görüneceğini" göstermek için — zaten elimizdeki canlı veriden inşa
  // edilir, PostAttachment'ın beklediği şekille birebir aynı.
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);
  const [betPreviewLoading, setBetPreviewLoading] = useState(false);

  const { player } = usePlayer();
  const { vehicles } = useVehicles();
  const { bets } = useRecentFutbolBets();
  const { matches: todayMatches } = useTodayFootballMatches();
  const { leagues } = useFutbolLeagues();  const { history: investmentHistory } = useInvestmentHistory();
  const { prices: investmentPrices } = useInvestmentPrices();
  const { messages } = useMessages();

  const pendingLeague = leagues.find((l) => l.id === pendingLeagueId) || null;
  const { teams: pendingTeams } = useFutbolTeams(pendingLeagueId);
  const { matches: pendingLeagueMatches, loading: pendingMatchesLoading } = useFutbolMatches(
    pendingLeagueId,
    pendingLeague?.season
  );

  const pendingLastMatchesLeague = leagues.find((l) => l.id === pendingLastMatchesLeagueId) || null;
  const { matches: pendingLastMatches, loading: pendingLastMatchesLoading } =
    useLeagueLastMatches(pendingLastMatchesLeagueId);

  const pendingUpcoming = useMemo(() => {
    if (!pendingLeague) return null;
    const round = pendingLeague.currentRound || 1;
    const scheduled = pendingLeagueMatches
      .filter((m) => m.round === round && m.status === 'scheduled')
      .slice(0, 4);
    if (!scheduled.length) return [];
    const teamById = Object.fromEntries(pendingTeams.map((t) => [t.id, t]));
    return scheduled.map((m) => ({
      homeName: teamById[m.homeTeamId]?.name || '?',
      awayName: teamById[m.awayTeamId]?.name || '?',
      homeLogo: teamById[m.homeTeamId]?.logo || null,
      awayLogo: teamById[m.awayTeamId]?.logo || null,
    }));
  }, [pendingLeague, pendingLeagueMatches, pendingTeams]);

  // pendingLeagueId seçilip veri geldiğinde otomatik olarak eki oluştur.
  useEffect(() => {
    if (!pendingLeagueId || !pendingLeague || pendingMatchesLoading) return;
    if (pendingUpcoming === null) return;
    if (pendingUpcoming.length === 0) return; // boşsa kullanıcı başka lig seçsin
    setAttachmentDraft({ type: 'upcomingMatches', leagueId: pendingLeagueId });
    setAttachmentPreview({
      type: 'upcomingMatches',
      leagueName: pendingLeague.name,
      round: pendingLeague.currentRound || 1,
      matches: pendingUpcoming,
    });
    setSubPicker(null);
    setPickerOpen(false);
    setPendingLeagueId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLeagueId, pendingLeague, pendingMatchesLoading, pendingUpcoming]);

  // pendingLastMatchesLeagueId seçilip veri geldiğinde otomatik olarak
  // eki oluştur (yukarıdakiyle aynı desen, "Sıradaki Maçlar" yerine
  // "Son Oynanan Maçlar" için).
  useEffect(() => {
    if (!pendingLastMatchesLeagueId || !pendingLastMatchesLeague || pendingLastMatchesLoading) return;
    if (pendingLastMatches.length === 0) return; // boşsa kullanıcı başka lig seçsin
    setAttachmentDraft({ type: 'lastMatches', leagueId: pendingLastMatchesLeagueId });
    setAttachmentPreview({
      type: 'lastMatches',
      leagueName: pendingLastMatchesLeague.name,
      matches: pendingLastMatches.map((m) => ({
        homeName: m.homeName,
        awayName: m.awayName,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homeLogo: m.homeLogo || null,
        awayLogo: m.awayLogo || null,
      })),
    });
    setSubPicker(null);
    setPickerOpen(false);
    setPendingLastMatchesLeagueId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLastMatchesLeagueId, pendingLastMatchesLeague, pendingLastMatchesLoading, pendingLastMatches]);

  const todayDateKey = istanbulDateKeyOffset(0);
  const yesterdayDateKey = istanbulDateKeyOffset(-1);
  const recentFines = messages.filter(
    (m) =>
      m.type === 'capture_penalty' &&
      (m.dateKey === todayDateKey || m.dateKey === yesterdayDateKey)
  );

  const avatarAvailable = Boolean(player?.avatar);
  const vehicleAvailable = vehicles.length > 0;
  const iddaaAvailable = bets.length > 0;
  const lastMatchesAvailable = todayMatches.length > 0;
  const fineAvailable = recentFines.length > 0;
  const debtAvailable = (player?.debtToState || 0) > 0;

  const ATTACHMENT_TYPES = [
    { id: 'avatar', label: 'Avatarım', emoji: '🧑', available: avatarAvailable },
    { id: 'vehicle', label: 'Arabam', emoji: '🚗', available: vehicleAvailable },
    { id: 'iddaa', label: 'İddaa Kuponum', emoji: '🎟️', available: iddaaAvailable },
    { id: 'lastMatches', label: 'Son Oynanan Maçlar', emoji: '⚽', available: lastMatchesAvailable },
    { id: 'upcomingMatches', label: 'Sıradaki Maçlar', emoji: '🔜', available: leagues.length > 0 },
    { id: 'investment', label: 'Yatırım Grafiği', emoji: '📈', available: true },
    { id: 'fine', label: 'Cezam', emoji: '🚨', available: fineAvailable },
    { id: 'debt', label: 'Toplam Borcum', emoji: '💸', available: debtAvailable },
  ];

  const setAttachment = (draft, preview) => {
    setAttachmentDraft(draft);
    setAttachmentPreview(preview);
    setSubPicker(null);
    setPickerOpen(false);
  };

  const chooseType = (typeId) => {
    setError('');
    if (typeId === 'vehicle' || typeId === 'iddaa' || typeId === 'investment') {
      setSubPicker(typeId);
      return;
    }
    if (typeId === 'upcomingMatches') {
      setSubPicker('upcomingMatches');
      setPendingLeagueId(null);
      return;
    }
    if (typeId === 'lastMatches') {
      setSubPicker('lastMatches');
      setPendingLastMatchesLeagueId(null);
      return;
    }
    if (typeId === 'avatar') {
      setAttachment({ type: 'avatar' }, { type: 'avatar', avatar: player.avatar });
      return;
    }
    if (typeId === 'fine') {
      const totalAmount = recentFines.reduce((sum, m) => sum + (m.penaltyAmount || 0), 0);
      setAttachment({ type: 'fine' }, { type: 'fine', totalAmount, count: recentFines.length });
      return;
    }
    if (typeId === 'debt') {
      setAttachment(
        { type: 'debt' },
        { type: 'debt', amount: player?.debtToState || 0 }
      );
    }
  };

  const chooseVehicle = (vehicle) => {
    setAttachment(
      { type: 'vehicle', vehicleId: vehicle.id },
      {
        type: 'vehicle',
        catalogId: vehicle.catalogId,
        model: vehicle.model,
        gearLevel: vehicle.gearLevel,
        gearUpgraded: !!vehicle.gearUpgraded,
        tankUpgraded: !!vehicle.tankUpgraded,
        lifeDays: vehicle.lifeDays ?? null,
      }
    );
  };

  const chooseBet = async (bet) => {
    setError('');
    setSubPicker(null);
    setPickerOpen(false);
    setAttachmentDraft({ type: 'iddaa', betId: bet.id });
    setBetPreviewLoading(true);
    // Kuponun GERÇEK içeriğini (maç isimleri + tahminler + varsa sonuç)
    // burada da çekiyoruz ki "sonuç bekleyen" bir kupon bile paylaşmadan
    // önce tam olarak nasıl görüneceğini göstersin — sunucu tarafındaki
    // buildSixtagramAttachment ile aynı mantık, sadece istemcide.
    try {
      const leagueSnap = await getDoc(doc(db, 'futbolLeagues', bet.leagueId));
      const predictionList = bet.predictions || [];
      const matchSnaps = await Promise.all(
        predictionList.map((p) => getDoc(doc(db, 'futbolMatches', p.matchId)))
      );
      const matchById = {};
      matchSnaps.forEach((s) => {
        if (s.exists()) matchById[s.id] = s.data();
      });
      const teamIds = new Set();
      matchSnaps.forEach((s) => {
        if (s.exists()) {
          teamIds.add(s.data().homeTeamId);
          teamIds.add(s.data().awayTeamId);
        }
      });
      const teamSnaps = await Promise.all(
        [...teamIds].map((id) => getDoc(doc(db, 'futbolTeams', id)))
      );
      const teamById = {};
      teamSnaps.forEach((s) => {
        if (s.exists()) teamById[s.id] = s.data();
      });

      const predictions = predictionList.map((p) => {
        const m = matchById[p.matchId] || {};
        const home = teamById[m.homeTeamId] || {};
        const away = teamById[m.awayTeamId] || {};
        let correct = null;
        if (m.status === 'finished' && m.homeScore != null && m.awayScore != null) {
          const actual =
            m.homeScore === m.awayScore ? 'draw' : m.homeScore > m.awayScore ? 'home' : 'away';
          correct = actual === p.pick;
        }
        return {
          homeName: home.name || '?',
          awayName: away.name || '?',
          pick: p.pick,
          homeScore: m.status === 'finished' ? m.homeScore : null,
          awayScore: m.status === 'finished' ? m.awayScore : null,
          correct,
        };
      });

      setAttachmentPreview({
        type: 'iddaa',
        leagueName: leagueSnap.exists() ? leagueSnap.data().name || null : null,
        round: bet.round,
        stake: bet.stake,
        status: bet.status,
        payout: bet.payout || 0,
        predictions,
      });
    } catch (err) {
      console.error('Kupon önizleme hatası:', err);
      // Önizleme yüklenemese bile paylaşım engellenmesin — sunucu
      // paylaşırken içeriği zaten kendisi doğru şekilde üretecek.
      setAttachmentPreview({
        type: 'iddaa',
        leagueName: null,
        round: bet.round,
        stake: bet.stake,
        status: bet.status,
        payout: bet.payout || 0,
        predictions: [],
      });
    } finally {
      setBetPreviewLoading(false);
    }
  };

  const chooseAsset = (asset) => {
    const points = investmentHistory
      .map((h) => h[asset.field])
      .filter((p) => typeof p === 'number');
    const current = investmentPrices[asset.field] ?? points[points.length - 1] ?? 0;
    setAttachment(
      { type: 'investment', asset: asset.id },
      { type: 'investment', asset: asset.id, assetLabel: asset.label, current, points }
    );
  };

  const removeAttachment = () => {
    setAttachmentDraft(null);
    setAttachmentPreview(null);
  };

  const handleSubmit = async () => {
    if (!text.trim() && !attachmentDraft) {
      setError('Bir şeyler yaz ya da bir ek ekle.');
      return;
    }
    setError('');
    setPosting(true);
    try {
      await createSixtagramPost(text.trim(), attachmentDraft);
      onPosted?.();
      onClose();
    } catch (err) {
      console.error('Sixtagram paylaşım hatası:', err);
      setError(err.message || 'Paylaşılamadı, tekrar dene.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="six-compose-backdrop" onClick={onClose}>
      <div className="six-compose" onClick={(e) => e.stopPropagation()}>
        <div className="six-compose-head">
          <p className="six-compose-title">Yeni Gönderi</p>
          <button className="six-compose-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <textarea
          className="six-compose-textarea"
          placeholder="Neler oluyor?"
          value={text}
          maxLength={MAX_LEN}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
        <p className="six-compose-counter">
          {text.length}/{MAX_LEN}
        </p>

        {attachmentPreview && (
          <div className="six-compose-preview">
            <div className="six-compose-preview-head">
              <span>Önizleme</span>
              <button className="six-compose-remove-btn" onClick={removeAttachment}>
                <X size={14} /> Kaldır
              </button>
            </div>
            {betPreviewLoading && attachmentPreview.type === 'iddaa' ? (
              <p className="six-compose-note">Kupon yükleniyor…</p>
            ) : (
              <PostAttachment attachment={attachmentPreview} />
            )}
          </div>
        )}

        {error && <p className="six-compose-error">{error}</p>}

        <div className="six-compose-footer">
          <button className="six-compose-image-btn" onClick={() => setPickerOpen((v) => !v)}>
            🖼️ Görsel Ekle
          </button>
          <button className="six-compose-submit" onClick={handleSubmit} disabled={posting}>
            {posting ? 'Paylaşılıyor…' : 'Paylaş'}
          </button>
        </div>

        {pickerOpen && !subPicker && (
          <div className="six-compose-picker">
            {ATTACHMENT_TYPES.map((t) => (
              <button
                key={t.id}
                className="six-compose-picker-item"
                disabled={!t.available}
                onClick={() => chooseType(t.id)}
              >
                <span className="six-compose-picker-emoji">{t.emoji}</span>
                <span>{t.label}</span>
                {!t.available && <span className="six-compose-picker-none">yok</span>}
              </button>
            ))}
            {!lastMatchesAvailable && (
              <p className="six-compose-sublist-empty">
                "Son Oynanan Maçlar" henüz hiç maç sonuçlanmadıysa (oyunun ilk gününde, 19:00'dan
                önce) görünmez — bir maç sonuçlandıktan sonra bir sonraki gün 19:00'a kadar (24
                saat boyunca) burada kalır.
              </p>
            )}
          </div>
        )}

        {subPicker === 'vehicle' && (
          <div className="six-compose-sublist">
            <p className="six-compose-sublist-title">Hangi araban?</p>
            {vehicles.length === 0 && (
              <p className="six-compose-sublist-empty">Henüz bir araban yok.</p>
            )}
            {vehicles.map((v) => (
              <button key={v.id} className="six-compose-sublist-item" onClick={() => chooseVehicle(v)}>
                {vehicleImage(v.catalogId) && (
                  <img src={vehicleImage(v.catalogId)} alt={v.model} />
                )}
                <span>{v.model}</span>
              </button>
            ))}
            <button className="six-compose-sublist-back" onClick={() => setSubPicker(null)}>
              ← Geri
            </button>
          </div>
        )}

        {subPicker === 'iddaa' && (
          <div className="six-compose-sublist">
            <p className="six-compose-sublist-title">Hangi kupon?</p>
            {bets.length === 0 && (
              <p className="six-compose-sublist-empty">Henüz bir kuponun yok.</p>
            )}
            {bets.map((b) => (
              <button key={b.id} className="six-compose-sublist-item" onClick={() => chooseBet(b)}>
                <span>
                  {b.round}. Hafta · {b.stake.toLocaleString('tr-TR')} altın ·{' '}
                  {b.status === 'pending' ? 'Bekliyor' : b.status === 'won' ? 'Kazandı' : 'Kaybetti'}
                </span>
              </button>
            ))}
            <button className="six-compose-sublist-back" onClick={() => setSubPicker(null)}>
              ← Geri
            </button>
          </div>
        )}

        {subPicker === 'investment' && (
          <div className="six-compose-sublist">
            <p className="six-compose-sublist-title">Hangi piyasa?</p>
            {ASSET_OPTIONS.map((a) => (
              <button key={a.id} className="six-compose-sublist-item" onClick={() => chooseAsset(a)}>
                <span>{a.label}</span>
              </button>
            ))}
            <button className="six-compose-sublist-back" onClick={() => setSubPicker(null)}>
              ← Geri
            </button>
          </div>
        )}

        {subPicker === 'lastMatches' && (
          <div className="six-compose-sublist">
            <p className="six-compose-sublist-title">Hangi lig?</p>
            {pendingLastMatchesLeagueId && (
              <p className="six-compose-sublist-empty">
                {pendingLastMatchesLoading
                  ? 'Yükleniyor…'
                  : pendingLastMatches.length === 0
                    ? 'Bu ligde son 24 saatte sonuçlanan bir maç yok, başka bir lig dene.'
                    : ''}
              </p>
            )}
            {leagues.map((l) => (
              <button
                key={l.id}
                className="six-compose-sublist-item"
                onClick={() => setPendingLastMatchesLeagueId(l.id)}
              >
                <span>{l.name}</span>
              </button>
            ))}
            <button
              className="six-compose-sublist-back"
              onClick={() => {
                setSubPicker(null);
                setPendingLastMatchesLeagueId(null);
              }}
            >
              ← Geri
            </button>
          </div>
        )}

        {subPicker === 'upcomingMatches' && (
          <div className="six-compose-sublist">
            <p className="six-compose-sublist-title">Hangi lig?</p>
            {pendingLeagueId && (
              <p className="six-compose-sublist-empty">
                {pendingMatchesLoading || pendingUpcoming === null
                  ? 'Yükleniyor…'
                  : pendingUpcoming.length === 0
                    ? 'Bu ligde şu an bekleyen maç yok, başka bir lig dene.'
                    : ''}
              </p>
            )}
            {leagues.map((l) => (
              <button
                key={l.id}
                className="six-compose-sublist-item"
                onClick={() => setPendingLeagueId(l.id)}
              >
                <span>{l.name}</span>
              </button>
            ))}
            <button
              className="six-compose-sublist-back"
              onClick={() => {
                setSubPicker(null);
                setPendingLeagueId(null);
              }}
            >
              ← Geri
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
