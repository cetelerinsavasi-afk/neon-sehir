import { useState } from 'react';
import { WORLD_EMOTES } from '../../lib/worldEmotes';
import './WorldEmoteButton.css';

// v71 — mekanlardaki "hareketler" düğmesi (sağ sütunda, 👥 düğmesinin üstünde).
export default function WorldEmoteButton({ variant = 'ws', onEmote }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`wemote-btn wemote-btn-${variant}${open ? ' on' : ''}`} onClick={() => setOpen((v) => !v)} title="Hareketler" aria-label="Hareketler">
        😀
      </button>
      {open && (
        <div className="wemote-list">
          {WORLD_EMOTES.map((e) => (
            <button
              key={e.key}
              className={`wemote-item wemote-item-${variant}`}
              onClick={() => {
                onEmote?.(e.key);
                setOpen(false);
              }}
            >
              <span>{e.emoji}</span>
              {e.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
