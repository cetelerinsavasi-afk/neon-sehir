// =============================================================================
// v93 — Şarkıyı MP3 olarak indir (sanatçı: stüdyo projesinden ya da Sixtagram'dan).
// Ses cihazda çevrimdışı oluşturulur (songEngine.renderSong), MP3 kodlayıcı sadece
// indirirken yüklenir. Dosya adı: "PROJEADI - cetelerinsavasi.com.mp3"
// =============================================================================
import { renderSong } from './songEngine';
import { songFileName } from '../../functions/homeOfficeData.js';

const KBPS = 160;

function toInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

export async function songToMp3Blob(song) {
  const [{ Mp3Encoder }, buf] = await Promise.all([import('@breezystack/lamejs'), renderSong(song)]);
  const left = toInt16(buf.getChannelData(0));
  const right = toInt16(buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0));
  const enc = new Mp3Encoder(2, buf.sampleRate, KBPS);
  const parts = [];
  const BLOCK = 1152;
  for (let i = 0; i < left.length; i += BLOCK) {
    const chunk = enc.encodeBuffer(left.subarray(i, i + BLOCK), right.subarray(i, i + BLOCK));
    if (chunk.length) parts.push(new Uint8Array(chunk));
    // uzun şarkılarda arayüz donmasın
    if (i % (BLOCK * 400) === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts, { type: 'audio/mpeg' });
}

export async function downloadSongMp3(song, title) {
  const blob = await songToMp3Blob(song);
  const name = songFileName(title ?? song?.title);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { name, bytes: blob.size };
}
