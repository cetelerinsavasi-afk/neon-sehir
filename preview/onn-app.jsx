// SADECE önizleme (v93): On Numara eşzamanlı tur görünümü
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/contexts/AuthContext';
import OnNumaraTable from '../src/components/OnNumaraScreen/OnNumaraTable';
import { fakeDb, PREVIEW_UID } from './mocks/backend.js';
import '../src/index.css';

const phase = new URLSearchParams(location.search).get('phase') || 'playing';
const now = Date.now();
(async () => {
  await fakeDb.doc('onNumaraTables/t1').set({
    creatorUid: PREVIEW_UID, capacity: 3, betAmount: 1000, status: 'open',
    seatOrder: [PREVIEW_UID, 'misafir1'],
    seats: { [PREVIEW_UID]: { displayName: 'Önizleme', netChange: 0 }, misafir1: { displayName: 'Ali', netChange: 0 } },
    round: phase === 'playing'
      ? { simul: true, phase: 'playing', participants: [PREVIEW_UID, 'misafir1'], pot: 3000, dealerCards: [3, 4], dealerStatus: 'playing', currentTurnUid: null,
          hands: { [PREVIEW_UID]: { cards: [2, 3, 1], status: 'playing', deadlineMs: now + 9000 }, misafir1: { cards: [4, 2, 5], status: 'bust' } } }
      : { simul: true, phase: 'resolved', participants: [PREVIEW_UID, 'misafir1'], pot: 3000, dealerCards: [3, 4, 2], dealerStatus: 'stand', currentTurnUid: null,
          hands: { [PREVIEW_UID]: { cards: [2, 3, 4], status: 'stand' }, misafir1: { cards: [4, 2, 5], status: 'bust' } },
          result: { winners: [PREVIEW_UID], dealerWon: false, dealerTied: true, bestSum: 9, share: 1500 } },
  });
  createRoot(document.getElementById('root')).render(
    <AuthProvider>
      <div style={{ padding: 12, background: '#0b0d14', minHeight: '100vh' }}>
        <OnNumaraTable tableId="t1" myUid={PREVIEW_UID} onLeave={() => {}} />
      </div>
    </AuthProvider>
  );
})();
