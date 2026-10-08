// =============================================================================
// v77 — Eldeki yiyecek / içeceklerin çizimi (emoji yerine).
// Emoji cihaza göre değişiyor ve bazıları yanlış anlaşılıyordu (su = damla,
// üç kahve aynı fincan). Her ürün burada kendi şekliyle, cihazdan bağımsız
// olarak 128×128 bir tuvale çizilir. Aynı tuval 3D'de eldeki görsel, isim
// etiketindeki küçük ikon ve fotoğraftaki etiket için kullanılır.
// =============================================================================

const S = 128;
const cache = new Map();

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
const lin = (g, x0, y0, x1, y1, stops) => {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  return gr;
};
function outline(g, w = 3) {
  g.lineWidth = w;
  g.strokeStyle = 'rgba(10,12,20,0.85)';
  g.stroke();
}
function fillOut(g, fill, w = 3) {
  g.fillStyle = fill;
  g.fill();
  outline(g, w);
}
// yamuk bardak gövdesi (üst geniş)
function cupPath(g, cx, top, bottom, wTop, wBot) {
  g.beginPath();
  g.moveTo(cx - wTop / 2, top);
  g.lineTo(cx + wTop / 2, top);
  g.lineTo(cx + wBot / 2, bottom);
  g.lineTo(cx - wBot / 2, bottom);
  g.closePath();
}
function shine(g, x, y, w, h) {
  g.fillStyle = 'rgba(255,255,255,0.35)';
  rr(g, x, y, w, h, Math.min(w, h) / 2);
  g.fill();
}

const ART = {
  // Kola: fast-food kâğıt bardak, kapak ve pipet
  kola(g) {
    g.strokeStyle = 'rgba(10,12,20,0.85)';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(70, 30);
    g.lineTo(80, 6);
    g.stroke();
    g.lineWidth = 4;
    g.strokeStyle = '#f5f5f5';
    g.stroke();
    rr(g, 34, 28, 60, 12, 5);
    fillOut(g, '#f2f2f2');
    cupPath(g, 64, 40, 118, 56, 40);
    fillOut(g, lin(g, 36, 0, 92, 0, [[0, '#c4161c'], [0.5, '#e8262c'], [1, '#a90f15']]));
    g.beginPath();
    g.moveTo(40, 82);
    g.bezierCurveTo(56, 70, 72, 94, 89, 76);
    g.lineWidth = 6;
    g.strokeStyle = '#ffffff';
    g.stroke();
    shine(g, 42, 46, 6, 26);
  },
  // Ayran: köpüklü beyaz bardak
  ayran(g) {
    cupPath(g, 64, 22, 118, 58, 46);
    fillOut(g, 'rgba(225,238,245,0.55)');
    cupPath(g, 64, 34, 114, 54, 44);
    g.fillStyle = lin(g, 0, 34, 0, 114, [[0, '#ffffff'], [1, '#eef3f0']]);
    g.fill();
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(42 + i * 8.6, 32 + (i % 2) * 3, 7, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
    }
    g.beginPath();
    g.arc(64, 30, 4, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    cupPath(g, 64, 22, 118, 58, 46);
    outline(g);
    shine(g, 40, 44, 6, 50);
  },
  // Meyve suyu: pipetli kutu, portakal resmi
  meyveSuyu(g) {
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(10,12,20,0.85)';
    g.beginPath();
    g.moveTo(78, 26);
    g.lineTo(86, 6);
    g.lineTo(98, 4);
    g.stroke();
    g.lineWidth = 3.5;
    g.strokeStyle = '#ff5fa2';
    g.stroke();
    rr(g, 36, 24, 56, 94, 6);
    fillOut(g, lin(g, 36, 0, 92, 0, [[0, '#ffb238'], [1, '#ff8a1c']]));
    g.beginPath();
    g.moveTo(36, 40);
    g.lineTo(92, 40);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.stroke();
    g.beginPath();
    g.arc(64, 78, 17, 0, Math.PI * 2);
    fillOut(g, '#ff7a00', 2.5);
    g.beginPath();
    g.arc(64, 78, 11, 0, Math.PI * 2);
    g.fillStyle = '#ffc163';
    g.fill();
    g.beginPath();
    g.ellipse(72, 58, 8, 4, -0.5, 0, Math.PI * 2);
    fillOut(g, '#3fbf4a', 2);
  },
  // Enerji içeceği: ince uzun koyu kutu, şimşek
  enerji(g) {
    rr(g, 44, 10, 40, 108, 8);
    fillOut(g, lin(g, 44, 0, 84, 0, [[0, '#14213d'], [0.5, '#24365e'], [1, '#0d1628']]));
    rr(g, 46, 10, 36, 8, 3);
    g.fillStyle = '#c9ced6';
    g.fill();
    rr(g, 46, 110, 36, 7, 3);
    g.fill();
    g.beginPath();
    g.moveTo(70, 30);
    g.lineTo(52, 66);
    g.lineTo(64, 66);
    g.lineTo(56, 98);
    g.lineTo(78, 56);
    g.lineTo(66, 56);
    g.closePath();
    fillOut(g, '#7dff4a', 2.5);
    shine(g, 49, 22, 5, 80);
  },
  // Su: şeffaf pet şişe, mavi kapak ve etiket
  su(g) {
    rr(g, 54, 4, 20, 12, 3);
    fillOut(g, '#1f7ae0');
    g.beginPath();
    g.moveTo(56, 16);
    g.lineTo(72, 16);
    g.quadraticCurveTo(88, 26, 88, 40);
    g.lineTo(88, 112);
    g.quadraticCurveTo(88, 120, 80, 120);
    g.lineTo(48, 120);
    g.quadraticCurveTo(40, 120, 40, 112);
    g.lineTo(40, 40);
    g.quadraticCurveTo(40, 26, 56, 16);
    g.closePath();
    fillOut(g, lin(g, 40, 0, 88, 0, [[0, 'rgba(170,220,255,0.75)'], [0.5, 'rgba(225,245,255,0.85)'], [1, 'rgba(150,205,250,0.75)']]));
    g.fillStyle = 'rgba(120,190,245,0.45)';
    g.fillRect(41, 46, 46, 70);
    rr(g, 40, 64, 48, 26, 2);
    fillOut(g, '#2b8ef0', 2);
    g.beginPath();
    g.moveTo(44, 80);
    g.bezierCurveTo(54, 70, 64, 88, 84, 76);
    g.lineWidth = 3;
    g.strokeStyle = '#ffffff';
    g.stroke();
    shine(g, 46, 30, 5, 30);
  },
  // Kahve: karton bardak, kahverengi kılıf, kapak
  kahve(g) {
    rr(g, 34, 14, 60, 14, 5);
    fillOut(g, '#5b3a29');
    rr(g, 50, 8, 28, 8, 3);
    fillOut(g, '#4a2e20', 2);
    cupPath(g, 64, 28, 118, 54, 40);
    fillOut(g, '#fbfaf6');
    cupPath(g, 64, 56, 92, 50, 45);
    fillOut(g, lin(g, 0, 56, 0, 92, [[0, '#a8743e'], [1, '#8a5a2b']]), 2.5);
    g.beginPath();
    g.arc(64, 74, 7, 0, Math.PI * 2);
    g.fillStyle = '#f3e3c3';
    g.fill();
    shine(g, 42, 32, 5, 20);
  },
  // Latte: uzun cam bardak, süt-kahve katmanları, köpük
  latte(g) {
    cupPath(g, 64, 14, 120, 48, 40);
    fillOut(g, 'rgba(230,240,248,0.5)');
    cupPath(g, 64, 76, 118, 43, 38);
    g.fillStyle = '#7a4a24';
    g.fill();
    cupPath(g, 64, 46, 76, 46, 43);
    g.fillStyle = '#c99a63';
    g.fill();
    cupPath(g, 64, 26, 46, 47, 46);
    g.fillStyle = '#fff8ee';
    g.fill();
    cupPath(g, 64, 14, 120, 48, 40);
    outline(g);
    g.lineWidth = 4;
    g.strokeStyle = '#d0d4d8';
    g.beginPath();
    g.moveTo(80, 30);
    g.lineTo(92, 2);
    g.stroke();
    shine(g, 44, 30, 5, 70);
  },
  // Espresso: küçük fincan, tabak, krema
  espresso(g) {
    g.beginPath();
    g.ellipse(64, 108, 44, 10, 0, 0, Math.PI * 2);
    fillOut(g, '#f4f4f2');
    g.beginPath();
    g.arc(92, 82, 11, -Math.PI / 2, Math.PI / 2);
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(10,12,20,0.85)';
    g.stroke();
    g.lineWidth = 3;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.beginPath();
    g.moveTo(38, 66);
    g.lineTo(90, 66);
    g.quadraticCurveTo(88, 104, 64, 104);
    g.quadraticCurveTo(40, 104, 38, 66);
    g.closePath();
    fillOut(g, '#ffffff');
    g.beginPath();
    g.ellipse(64, 66, 26, 6, 0, 0, Math.PI * 2);
    fillOut(g, '#b9773a', 2);
    g.beginPath();
    g.ellipse(64, 66, 16, 3.5, 0, 0, Math.PI * 2);
    g.fillStyle = '#e0a868';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 2.5;
    [54, 66, 78].forEach((x, i) => {
      g.beginPath();
      g.moveTo(x, 56);
      g.bezierCurveTo(x - 5, 46, x + 5, 40 - i * 2, x, 30);
      g.stroke();
    });
  },
  // Çay: ince belli bardak, tabak, kaşık
  cay(g) {
    g.beginPath();
    g.ellipse(64, 112, 40, 9, 0, 0, Math.PI * 2);
    fillOut(g, '#ffffff');
    g.beginPath();
    g.ellipse(64, 112, 30, 5, 0, 0, Math.PI * 2);
    g.strokeStyle = '#d23a3a';
    g.lineWidth = 2;
    g.stroke();
    const tulip = () => {
      g.beginPath();
      g.moveTo(44, 22);
      g.lineTo(84, 22);
      g.bezierCurveTo(84, 44, 72, 54, 72, 64);
      g.bezierCurveTo(72, 76, 86, 90, 82, 106);
      g.lineTo(46, 106);
      g.bezierCurveTo(42, 90, 56, 76, 56, 64);
      g.bezierCurveTo(56, 54, 44, 44, 44, 22);
      g.closePath();
    };
    tulip();
    g.fillStyle = 'rgba(230,240,248,0.45)';
    g.fill();
    g.save();
    tulip();
    g.clip();
    g.fillStyle = lin(g, 0, 32, 0, 106, [[0, '#c0392b'], [1, '#7b1e12']]);
    g.fillRect(30, 32, 70, 80);
    g.restore();
    tulip();
    outline(g);
    g.lineWidth = 3;
    g.strokeStyle = '#c9ced6';
    g.beginPath();
    g.moveTo(76, 30);
    g.lineTo(98, 6);
    g.stroke();
    shine(g, 48, 26, 4, 18);
  },
  // Pasta: tabakta dilim, krema ve kiraz
  pasta(g) {
    g.beginPath();
    g.ellipse(64, 110, 50, 11, 0, 0, Math.PI * 2);
    fillOut(g, '#f6f6f6');
    g.beginPath();
    g.moveTo(22, 102);
    g.lineTo(104, 102);
    g.lineTo(104, 58);
    g.lineTo(22, 74);
    g.closePath();
    fillOut(g, '#f7d9a8');
    g.fillStyle = '#7b3f20';
    g.beginPath();
    g.moveTo(22, 88);
    g.lineTo(104, 82);
    g.lineTo(104, 72);
    g.lineTo(22, 80);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(104, 58);
    g.lineTo(22, 74);
    g.lineTo(26, 64);
    g.lineTo(104, 48);
    g.closePath();
    fillOut(g, '#ffffff', 2.5);
    [40, 58, 76, 94].forEach((x, i) => {
      g.beginPath();
      g.arc(x, 62 - i * 3.6, 6, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
    });
    g.beginPath();
    g.arc(92, 40, 8, 0, Math.PI * 2);
    fillOut(g, '#e01e3c', 2.5);
    g.beginPath();
    g.moveTo(92, 32);
    g.quadraticCurveTo(96, 20, 104, 18);
    g.strokeStyle = '#3b7a2a';
    g.lineWidth = 2.5;
    g.stroke();
  },
  // Kurabiye: çikolata parçacıklı
  kurabiye(g) {
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 44 + (i % 3 === 0 ? -3 : 1);
      g.lineTo(64 + Math.cos(a) * r, 68 + Math.sin(a) * r);
    }
    g.closePath();
    fillOut(g, lin(g, 20, 20, 108, 112, [[0, '#e7b56c'], [1, '#c98a3f']]));
    [[48, 50], [76, 46], [62, 70], [40, 80], [86, 74], [68, 94], [50, 98], [88, 96]].forEach(([x, y]) => {
      g.beginPath();
      g.ellipse(x, y, 6, 4.5, x * 0.1, 0, Math.PI * 2);
      g.fillStyle = '#4a2a17';
      g.fill();
    });
  },
  // Meyve: kırmızı elma, yaprak
  meyve(g) {
    g.beginPath();
    g.moveTo(64, 40);
    g.bezierCurveTo(40, 22, 16, 44, 22, 76);
    g.bezierCurveTo(28, 108, 50, 120, 64, 110);
    g.bezierCurveTo(78, 120, 100, 108, 106, 76);
    g.bezierCurveTo(112, 44, 88, 22, 64, 40);
    g.closePath();
    fillOut(g, lin(g, 22, 30, 106, 116, [[0, '#ff4d4d'], [1, '#b3121f']]));
    g.beginPath();
    g.moveTo(64, 40);
    g.quadraticCurveTo(62, 22, 70, 12);
    g.lineWidth = 5;
    g.strokeStyle = '#5a3a1e';
    g.stroke();
    g.beginPath();
    g.ellipse(82, 22, 14, 7, -0.5, 0, Math.PI * 2);
    fillOut(g, '#3fbf4a', 2.5);
    shine(g, 34, 56, 8, 22);
  },
  // Pizza: sucuklu dilim
  pizza(g) {
    g.beginPath();
    g.moveTo(64, 120);
    g.lineTo(18, 28);
    g.quadraticCurveTo(64, 8, 110, 28);
    g.closePath();
    fillOut(g, '#f5c84c');
    g.beginPath();
    g.moveTo(18, 28);
    g.quadraticCurveTo(64, 8, 110, 28);
    g.lineTo(104, 38);
    g.quadraticCurveTo(64, 20, 24, 38);
    g.closePath();
    fillOut(g, '#d18a3a', 2.5);
    [[50, 50], [76, 54], [62, 76], [56, 96], [86, 40]].forEach(([x, y]) => {
      g.beginPath();
      g.arc(x, y, 8, 0, Math.PI * 2);
      fillOut(g, '#c0392b', 2);
    });
    [[40, 66], [70, 92]].forEach(([x, y]) => {
      g.beginPath();
      g.ellipse(x, y, 5, 3, 0.6, 0, Math.PI * 2);
      g.fillStyle = '#3c8d2f';
      g.fill();
    });
  },
  // Kebap: kâğıda sarılı dürüm
  kebap(g) {
    g.save();
    g.translate(64, 66);
    g.rotate(-0.35);
    rr(g, -22, -50, 44, 104, 20);
    fillOut(g, '#f1d9a8');
    g.beginPath();
    g.ellipse(0, -46, 20, 9, 0, 0, Math.PI * 2);
    fillOut(g, '#8a4b24', 2.5);
    [[-10, -50, '#4caf50'], [6, -52, '#e53935'], [-2, -44, '#a0522d'], [12, -46, '#4caf50']].forEach(([x, y, c]) => {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fillStyle = c;
      g.fill();
    });
    g.beginPath();
    g.moveTo(-23, 6);
    g.lineTo(23, -6);
    g.lineTo(23, 40);
    g.quadraticCurveTo(0, 60, -23, 40);
    g.closePath();
    fillOut(g, '#ffffff');
    g.fillStyle = '#e53935';
    g.fillRect(-23, 14, 46, 6);
    g.restore();
  },
  // Kokteyl: kadeh, renkli içki, şemsiye, limon
  kokteyl(g) {
    g.beginPath();
    g.moveTo(26, 30);
    g.lineTo(102, 30);
    g.lineTo(68, 72);
    g.lineTo(68, 108);
    g.lineTo(84, 116);
    g.lineTo(44, 116);
    g.lineTo(60, 108);
    g.lineTo(60, 72);
    g.closePath();
    fillOut(g, 'rgba(230,240,248,0.45)');
    g.beginPath();
    g.moveTo(32, 36);
    g.lineTo(96, 36);
    g.lineTo(64, 68);
    g.closePath();
    g.fillStyle = lin(g, 0, 36, 0, 68, [[0, '#ff6fb1'], [1, '#ff9a3c']]);
    g.fill();
    g.beginPath();
    g.arc(100, 32, 12, 0, Math.PI * 2);
    fillOut(g, '#f7e14a', 2.5);
    g.beginPath();
    g.arc(100, 32, 7, 0, Math.PI * 2);
    g.fillStyle = '#fff3a6';
    g.fill();
    g.beginPath();
    g.moveTo(42, 34);
    g.lineTo(30, 8);
    g.lineWidth = 2.5;
    g.strokeStyle = '#7a5a3a';
    g.stroke();
    g.beginPath();
    g.moveTo(14, 14);
    g.quadraticCurveTo(30, -2, 46, 14);
    g.closePath();
    fillOut(g, '#1fb5c9', 2.5);
  },
  // Viski: kısa kalın bardak, kehribar renk, buz
  viski(g) {
    rr(g, 30, 44, 68, 74, 6);
    fillOut(g, 'rgba(230,240,248,0.45)');
    g.fillStyle = lin(g, 0, 62, 0, 112, [[0, '#d98a1e'], [1, '#9c5a10']]);
    rr(g, 34, 62, 60, 50, 4);
    g.fill();
    [[44, 56, 0.2], [66, 60, -0.3]].forEach(([x, y, r]) => {
      g.save();
      g.translate(x + 9, y + 9);
      g.rotate(r);
      rr(g, -9, -9, 18, 18, 3);
      g.fillStyle = 'rgba(235,250,255,0.85)';
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(120,160,190,0.9)';
      g.stroke();
      g.restore();
    });
    rr(g, 30, 44, 68, 74, 6);
    outline(g);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(31, 108, 66, 9);
    shine(g, 36, 50, 5, 54);
  },
  // Dondurma: külah, iki top
  dondurma(g) {
    g.beginPath();
    g.moveTo(38, 62);
    g.lineTo(90, 62);
    g.lineTo(64, 124);
    g.closePath();
    fillOut(g, '#e3a35a');
    g.strokeStyle = 'rgba(120,70,20,0.6)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(42 + i * 13, 62);
      g.lineTo(70 + i * 6, 110 - i * 8);
      g.stroke();
    }
    g.beginPath();
    g.arc(64, 54, 26, Math.PI * 0.95, Math.PI * 2.05);
    g.lineTo(90, 64);
    g.lineTo(38, 64);
    g.closePath();
    fillOut(g, '#fff4e0');
    g.beginPath();
    g.arc(64, 32, 21, 0, Math.PI * 2);
    fillOut(g, '#ff8fb8');
    g.beginPath();
    g.arc(70, 12, 6, 0, Math.PI * 2);
    fillOut(g, '#e01e3c', 2);
  },
};

// Silahlar (yatay)
function gun(g, { body = '#3a3f4a', grip = '#262a31', accent = '#8a93a3', long = 0, pump = false }) {
  const L = 60 + long;
  const x0 = 64 - L / 2 - 8;
  rr(g, x0, 50, L + 14, 16, 4);
  fillOut(g, body);
  if (pump) {
    rr(g, x0 + 10, 64, 28, 10, 3);
    fillOut(g, '#5a3a22', 2.5);
  }
  g.beginPath();
  if (long) {
    g.moveTo(x0 + L + 4, 54);
    g.lineTo(x0 + L + 28, 58);
    g.lineTo(x0 + L + 30, 80);
    g.lineTo(x0 + L + 4, 72);
  } else {
    g.moveTo(x0 + L - 8, 64);
    g.lineTo(x0 + L + 4, 64);
    g.lineTo(x0 + L + 10, 98);
    g.lineTo(x0 + L - 6, 98);
  }
  g.closePath();
  fillOut(g, long ? '#7a4a24' : grip);
  g.beginPath();
  g.arc(x0 + L - 18, 70, 7, 0, Math.PI);
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(10,12,20,0.85)';
  g.stroke();
  g.fillStyle = accent;
  g.fillRect(x0 + 4, 53, L - 6, 3);
}
ART.tabanca = (g) => gun(g, {});
ART.tufek = (g) => gun(g, { long: 34, body: '#2f3540' });
ART.pompali = (g) => gun(g, { long: 26, body: '#1d2026', pump: true });
ART.altinTabanca = (g) => gun(g, { body: '#d4a62a', grip: '#8a6a12', accent: '#fff1a8' });

// Ürünün 128×128 tuvali (önbellekli)
export function heldCanvas(product) {
  if (cache.has(product)) return cache.get(product);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const fn = ART[product];
  if (fn) fn(g);
  else {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillText('🎁', 64, 70);
  }
  cache.set(product, c);
  return c;
}

const urlCache = new Map();
export function heldDataUrl(product) {
  if (!urlCache.has(product)) urlCache.set(product, heldCanvas(product).toDataURL('image/png'));
  return urlCache.get(product);
}

export const HELD_ART_KEYS = Object.keys(ART);
