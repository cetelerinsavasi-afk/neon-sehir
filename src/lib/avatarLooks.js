/* eslint-disable */
// =============================================================================
// v160 — KOSTÜMLER (hazır tipler) ÇİZİMLERİ (sadece istemci)
// "Hazır Tipler" prototipinden taşındı (100 tip). Katalog / fiyat / kategori:
// functions/cosmeticsData.js (LOOKS, LOOK_CATS). Burada:
//   LOOK_ART  — her tipin katmanları (avatarla aynı 320×580 koordinatı):
//               base = avatar alanlarının üzerine yazılanlar (ten, saç, gövde…)
//               t0 = gövdenin yerine çizilen gövde · t = gövdenin üstü · hb = saçın arkası
//               h = başın üstü (maske, kask) · f = ön (eldeki eşya) · b = arka (pelerin, kanat)
//               leg = bacak deseni · cover = gizlenen aksesuar yuvaları
//   LOOK_TINT — tipin renk yuvaları: [etiket, ana renk, ...o yuvaya kesin ait renkler]
//   tintLook  — seçilen renkleri SVG'ye uygular (ton/ışık korunur)
// Kimlik sunucuda doğrulanır (avatar.look); renkler sadece #rrggbb (cleanLookTint).
// Not: çizim kodu prototip derlemesinden geldiği için kısa adlar kullanır.
// =============================================================================
  var j = (e, t) => {
      let a = parseInt(e.slice(1), 16),
        r = t < 0 ? 0 : 255,
        l = Math.abs(t) / 100,
        o = a >> 16,
        f = (a >> 8) & 255,
        n = a & 255;
      return (
        "#" +
        (16777216 + (Math.round((r - o) * l) + o) * 65536 + (Math.round((r - f) * l) + f) * 256 + (Math.round((r - n) * l) + n))
          .toString(16)
          .slice(1)
      );
    },
    p = (e) => `${e}<g transform="matrix(-1 0 0 1 320 0)">${e}</g>`,
    i =
      (...e) =>
      (t) =>
        e.map((a) => (typeof a == "function" ? a(t) : a || "")).join(""),
    m =
      (...e) =>
      (t, a, r) =>
        e.map((l) => l(t, a, r)).join(""),
    A = (e, t, a, r, l = "") => {
      let o = "";
      for (let f = 0; f < 10; f++) {
        let n = -Math.PI / 2 + (f * Math.PI) / 5,
          h = f % 2 ? a * 0.45 : a;
        o += `${f ? "L" : "M"}${(e + Math.cos(n) * h).toFixed(1)},${(t + Math.sin(n) * h).toFixed(1)}`;
      }
      return `<path d="${o}Z" fill="${r}" ${l}/>`;
    },
    c0 = (e, t, a, r, l, o, f, n = t) =>
      `<path fill-rule="evenodd" fill="${f}" d="M${e - a},${t}a${a},${r} 0 1,0 ${2 * a},0a${a},${r} 0 1,0 ${-2 * a},0Z M${e - l},${n}a${l},${o} 0 1,0 ${2 * l},0a${l},${o} 0 1,0 ${-2 * l},0Z"/>`,
    Q = (e, t, a, r, l, o = 0.22) =>
      `<ellipse cx="${e}" cy="${t}" rx="${a}" ry="${r}" fill="${l}" opacity="${o * 0.5}"/><ellipse cx="${e}" cy="${t}" rx="${a * 0.72}" ry="${r * 0.72}" fill="${l}" opacity="${o * 0.6}"/><ellipse cx="${e}" cy="${t}" rx="${a * 0.45}" ry="${r * 0.45}" fill="${l}" opacity="${o}"/>`,
    g = (e, t, a, r = 1) => e.map(([l, o]) => `<circle cx="${l}" cy="${o}" r="${t}" fill="${a}" opacity="${r}"/>`).join(""),
    y =
      (e, { bottom: t = 380, shade: a = !0, flare: r = 0 } = {}) =>
      ({ B: l }) => {
        let { tl: o, tr: f, ty: n } = l,
          h = `<path d="M${o},${n + 22} Q${o},${n - 2} ${o + 26},${n - 2} L${f - 26},${n - 2} Q${f},${n - 2} ${f},${n + 22} L${f + r},${t} L${o - r},${t} Z" fill="${e}"/>`;
        return (
          a &&
            (h += `<path d="M${f - 26},${n + 2} Q${f},${n + 2} ${f},${n + 24} L${f + r},${t} L${f - 30 + r * 0.6},${t} Z" fill="#000" opacity=".16"/><path d="M${o + 8},${n + 22} Q${o + 10},${n + 6} ${o + 30},${n + 4}" stroke="#fff" stroke-width="5" opacity=".14" fill="none" stroke-linecap="round"/>`),
          h
        );
      },
    v =
      (e, { y: t = 350, bottom: a = 450, w: r = 34 } = {}) =>
      ({ B: l }) =>
        `<path d="M${l.tl + 6},${t} L${l.tr - 6},${t} L${l.tr + r},${a} Q160,${a + 14} ${l.tl - r},${a} Z" fill="${e}"/><path d="M${l.tr - 6},${t} L${l.tr + r},${a} L${l.tr + r - 26},${a + 4} L${l.tr - 24},${t}Z" fill="#000" opacity=".15"/>`,
    L =
      (e, t = "#d4af37", a = 352) =>
      ({ B: r }) =>
        `<rect x="${r.tl}" y="${a}" width="${r.tr - r.tl}" height="13" fill="${e}"/><rect x="149" y="${a - 2}" width="22" height="17" rx="3" fill="${t}"/><rect x="154" y="${a + 3}" width="12" height="7" rx="1" fill="${e}"/>`,
    w =
      (e, t = 344) =>
      ({ B: a }) =>
        `<path d="M${a.tl},${t} L${a.tr},${t} L${a.tr},${t + 20} L${a.tl},${t + 20}Z" fill="${e}"/><path d="M${a.tl},${t + 6} L${a.tr},${t + 6}" stroke="#000" stroke-opacity=".18" stroke-width="2"/>`,
    I = (e) =>
      i(y(e), ({ B: t }) => {
        let a = j(e, -22);
        return `<path d="M${t.tl + 30},${t.ty + 40} Q128,${t.ty + 58} 156,${t.ty + 46}" stroke="${a}" stroke-width="3" fill="none"/><path d="M${t.tr - 30},${t.ty + 40} Q192,${t.ty + 58} 164,${t.ty + 46}" stroke="${a}" stroke-width="3" fill="none"/><path d="M160,${t.ty + 50} L160,372" stroke="${a}" stroke-width="2.5"/><path d="M140,318 h40 M142,338 h36 M144,358 h32" stroke="${a}" stroke-width="2.2" stroke-linecap="round" opacity=".8"/><circle cx="132" cy="${t.ty + 50}" r="2.4" fill="${a}"/><circle cx="188" cy="${t.ty + 50}" r="2.4" fill="${a}"/>`;
      }),
    k0 = (e, t) =>
      i(
        y(e),
        ({ B: a }) =>
          `<path d="M128,${a.ty - 2} L166,334 L178,322 L146,${a.ty - 2}Z" fill="${j(e, -12)}"/><path d="M192,${a.ty - 2} L160,312 L148,300 L174,${a.ty - 2}Z" fill="${j(e, -6)}"/><path d="M128,${a.ty - 2} L166,334 M192,${a.ty - 2} L156,306" stroke="${t || j(e, -30)}" stroke-width="4" fill="none"/>`,
      ),
    q0 =
      (e) =>
      ({ B: t }) =>
        `<rect x="${t.tl}" y="340" width="${t.tr - t.tl}" height="14" fill="${e}"/><path d="M150,346 L138,384 L148,386 L158,350 L166,388 L176,384 L166,346Z" fill="${e}"/><rect x="152" y="338" width="16" height="18" rx="3" fill="${j(e, 15)}"/>`,
    G =
      (e, t, { bottom: a = 430, lapel: r } = {}) =>
      ({ B: l }) => {
        let { tl: o, tr: f, ty: n } = l;
        return `<path d="M${o - 4},${n + 22} Q${o - 4},${n - 2} ${o + 24},${n - 2} L${f - 24},${n - 2} Q${f + 4},${n - 2} ${f + 4},${n + 22} L${f + 14},${a} L${o - 14},${a} Z" fill="${e}"/>
    <path d="M140,${n - 2} L180,${n - 2} L172,${a} L148,${a}Z" fill="${t}"/>
    <path d="M128,${n - 2} L150,${n - 2} L156,320 L146,${a} L138,${a} L134,318Z" fill="${r || j(e, -10)}"/>
    <path d="M192,${n - 2} L170,${n - 2} L164,320 L174,${a} L182,${a} L186,318Z" fill="${r || j(e, -10)}"/>
    <path d="M${f - 24},${n + 2} Q${f + 4},${n + 2} ${f + 4},${n + 24} L${f + 14},${a} L${f - 18},${a}Z" fill="#000" opacity=".14"/>`;
      };
  var E0 = (e) => `<path d="M154,262 L166,262 L172,304 L160,322 L148,304 Z" fill="${e}"/>`,
    R =
      (e = "#d4af37") =>
      ({ B: t }) =>
        `<circle cx="${t.tl + 22}" cy="${t.ty + 8}" r="7" fill="${e}"/><circle cx="${t.tr - 22}" cy="${t.ty + 8}" r="7" fill="${e}"/><circle cx="${t.tl + 22}" cy="${t.ty + 8}" r="3" fill="#fff" opacity=".5"/><circle cx="${t.tr - 22}" cy="${t.ty + 8}" r="3" fill="#fff" opacity=".5"/>`,
    D =
      (e, t) =>
      ({ B: a }) => {
        let r = (l, o) =>
          `<path d="M${l - 30 * o},${a.ty + 30} Q${l - 34 * o},${a.ty - 18} ${l + 6 * o},${a.ty - 10} Q${l + 30 * o},${a.ty - 4} ${l + 30 * o},${a.ty + 22} Z" fill="${e}"/><path d="M${l - 24 * o},${a.ty + 4} Q${l - 10 * o},${a.ty - 10} ${l + 10 * o},${a.ty - 6}" stroke="#fff" stroke-width="3" opacity=".25" fill="none"/>` +
          (t
            ? `<path d="M${l - 14 * o},${a.ty - 8} L${l - 22 * o},${a.ty - 40} L${l - 2 * o},${a.ty - 12}Z M${l + 6 * o},${a.ty - 10} L${l + 4 * o},${a.ty - 44} L${l + 18 * o},${a.ty - 6}Z" fill="${t}"/>`
            : "");
        return r(a.tl + 14, 1) + r(a.tr - 14, -1);
      },
    N =
      (e, t) =>
      ({ B: a }) =>
        `<path d="M${a.tl + 18},${a.ty + 6} L${a.tr - 18},${a.ty + 6} L${a.tr - 26},336 Q160,356 ${a.tl + 26},336 Z" fill="${e}" stroke="${t}" stroke-width="3"/><path d="M160,${a.ty + 10} L160,350" stroke="${t}" stroke-width="2" opacity=".6"/><path d="M${a.tl + 34},${a.ty + 20} Q${a.tl + 40},300 ${a.tl + 50},320" stroke="#fff" stroke-width="5" opacity=".22" fill="none" stroke-linecap="round"/>`,
    y0 =
      (e, t) =>
      ({ B: a }) => {
        let r = "";
        for (let l = a.ty + 8; l < 346; l += 14)
          for (let o = a.tl + 14 + ((l / 14) % 2) * 7; o < a.tr - 18; o += 14)
            r += `<rect x="${o}" y="${l}" width="12" height="13" rx="3" fill="${e}" stroke="${t}" stroke-width="1.4"/>`;
        return r;
      },
    p0 = (e, t = 13) => {
      let a = "";
      for (let r = 0; r < t; r++) {
        let l = Math.PI * (0.1 + (0.8 * r) / (t - 1));
        a += `<circle cx="${(160 - Math.cos(l) * 34).toFixed(1)}" cy="${(262 + Math.sin(l) * 30).toFixed(1)}" r="5" fill="${e}" stroke="${j(e, -35)}" stroke-width="1"/>`;
      }
      return a;
    },
    P = {
      bolt: (e) => `<path d="M168,280 L146,309 L159,309 L151,332 L176,300 L163,300 L171,280Z" fill="${e}"/>`,
      star: (e) => A(160, 305, 18, e),
      flame: (e, t) =>
        `<path d="M160,330 Q138,322 142,302 Q146,290 152,284 Q152,298 160,300 Q154,288 162,274 Q170,290 176,296 Q182,306 178,318 Q174,330 160,330Z" fill="${e}"/><path d="M160,328 Q150,322 152,312 Q156,304 160,302 Q164,312 168,314 Q170,324 160,328Z" fill="${t || "#ffe27a"}"/>`,
      wave: (e) =>
        `<path d="M138,312 Q146,296 156,306 Q166,316 174,300 Q180,290 184,300" stroke="${e}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M138,322 Q146,308 156,318 Q166,328 174,314 Q180,304 184,314" stroke="${e}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`,
      orbit: (e) =>
        `<ellipse cx="160" cy="305" rx="24" ry="9" fill="none" stroke="${e}" stroke-width="2.5" transform="rotate(30 160 305)"/><ellipse cx="160" cy="305" rx="24" ry="9" fill="none" stroke="${e}" stroke-width="2.5" transform="rotate(-30 160 305)"/><circle cx="160" cy="305" r="6" fill="${e}"/>`,
      eagle: (e) =>
        `<path d="M160,296 L128,286 Q136,298 146,302 L132,304 Q146,312 156,310 L160,322 L164,310 Q174,312 188,304 L174,302 Q184,298 192,286 Z" fill="${e}"/>`,
      sun: (e) => {
        let t = `<circle cx="160" cy="305" r="10" fill="${e}"/>`;
        for (let a = 0; a < 12; a++) {
          let r = (a * Math.PI) / 6;
          t += `<line x1="${160 + Math.cos(r) * 14}" y1="${305 + Math.sin(r) * 14}" x2="${160 + Math.cos(r) * 22}" y2="${305 + Math.sin(r) * 22}" stroke="${e}" stroke-width="3" stroke-linecap="round"/>`;
        }
        return t;
      },
      hex: (e) =>
        `${Q(160, 305, 34, 34, e, 0.4)}<path d="M160,289 L174,297 L174,313 L160,321 L146,313 L146,297Z" fill="${e}" stroke="#fff" stroke-width="2"/><path d="M160,297 L167,301 L167,309 L160,313 L153,309 L153,301Z" fill="#fff" opacity=".8"/>`,
      swirl: (e) =>
        `<path d="M160,305 m0,-3 a3,3 0 1,1 -3,3 a8,8 0 1,1 8,8 a14,14 0 1,1 -14,-14 a20,20 0 1,1 20,20" stroke="${e}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
      horseshoe: (e) =>
        `<path d="M144,288 L144,306 Q144,324 160,324 Q176,324 176,306 L176,288" stroke="${e}" stroke-width="9" fill="none"/><rect x="138" y="284" width="12" height="9" fill="#f2efe4"/><rect x="170" y="284" width="12" height="9" fill="#f2efe4"/>`,
      wolf: (e) =>
        `<path d="M142,286 L148,300 L140,316 L160,330 L180,316 L172,300 L178,286 L166,296 L154,296Z" fill="${e}"/><circle cx="153" cy="308" r="2.3" fill="#111"/><circle cx="167" cy="308" r="2.3" fill="#111"/>`,
      tulip: (e) =>
        `<path d="M160,326 L160,312" stroke="${e}" stroke-width="3"/><path d="M146,292 Q148,314 160,316 Q172,314 174,292 L167,300 L160,286 L153,300Z" fill="${e}"/><path d="M160,326 Q148,320 144,312 M160,326 Q172,320 176,312" stroke="${e}" stroke-width="2.5" fill="none"/>`,
      diamond: (e) =>
        `<path d="M160,284 L180,305 L160,326 L140,305Z" fill="${e}"/><path d="M160,284 L168,305 L160,326" fill="#fff" opacity=".35"/>`,
      dragon: (e) =>
        `<path d="M140,316 Q132,296 146,286 Q150,296 158,294 Q160,282 172,278 Q170,290 178,294 Q190,300 184,316 Q172,306 166,318 Q162,328 152,326 Q156,318 148,312 Z" fill="${e}"/><circle cx="170" cy="290" r="2" fill="#111"/>`,
      crescent: (e) => `<path d="M168,286 A20,20 0 1,0 168,324 A15,15 0 1,1 168,286Z" fill="${e}"/>${A(176, 305, 6, e)}`,
    },
    Y = (e, t, a, r = 26) => `<circle cx="160" cy="305" r="${r}" fill="${t}" stroke="${a}" stroke-width="3"/>${P[e](a)}`,
    e0 = (e, { neck: t = !0 } = {}) =>
      `<ellipse cx="160" cy="169" rx="61" ry="69" fill="${e}"/><ellipse cx="101" cy="176" rx="11" ry="16" fill="${e}"/><ellipse cx="219" cy="176" rx="11" ry="16" fill="${e}"/>` +
      (t ? `<rect x="136" y="222" width="48" height="52" rx="6" fill="${e}"/>` : "") +
      '<ellipse cx="138" cy="126" rx="24" ry="12" fill="#fff" opacity=".12"/><path d="M200,120 Q222,160 210,210" stroke="#000" stroke-opacity=".12" stroke-width="10" fill="none" stroke-linecap="round"/>',
    k1 = {
      hero: (e, t) =>
        `<path d="M116,159 Q133,147 153,162 Q141,179 116,159Z" fill="${e}" stroke="${t}" stroke-width="3.5" stroke-linejoin="round"/>`,
      slit: (e) => `<path d="M118,164 L153,160 L151,170 L120,172Z" fill="${e}"/>`,
      round: (e, t) =>
        `<circle cx="138" cy="168" r="13" fill="${e}" stroke="${t}" stroke-width="4"/><circle cx="133" cy="163" r="3.5" fill="#fff" opacity=".6"/>`,
      almond: (e, t) => `<ellipse cx="138" cy="168" rx="13" ry="8" fill="${e}" stroke="${t}" stroke-width="2.5"/>`,
      big: (e) =>
        `<ellipse cx="136" cy="168" rx="19" ry="12" transform="rotate(22 136 168)" fill="${e}"/><ellipse cx="129" cy="162" rx="5" ry="3" fill="#fff" opacity=".7"/>`,
    },
    V = (e, t, a = "#111", r) => (r ? p(Q(136, 166, 26, 16, r, 0.45)) : "") + p(k1[e](t, a)),
    y1 = (e, t = 1) =>
      `<path d="M106,154 Q160,142 214,154 L210,182 Q160,172 110,182Z" fill="${e}" opacity="${t}"/><path d="M118,156 Q140,150 160,150" stroke="#fff" stroke-width="3" opacity=".45" fill="none" stroke-linecap="round"/>`,
    M0 = (e = "#1a1a1a") => p(`<ellipse cx="138" cy="168" rx="9" ry="6" fill="#f4f1e8"/><circle cx="138" cy="168" r="4" fill="${e}"/>`),
    a0 = (e, t) =>
      `<path d="M110,160 Q120,146 150,156 Q160,161 170,156 Q200,146 210,160 Q212,182 188,182 Q170,182 160,172 Q150,182 132,182 Q108,182 110,160Z" fill="${e}"/>` +
      M0(t),
    x0 = (e) =>
      `<path d="M99,176 Q160,164 221,176 L219,200 Q210,240 160,244 Q110,240 101,200Z" fill="${e}"/><path d="M120,206 Q160,214 200,206" stroke="#000" stroke-opacity=".2" stroke-width="2" fill="none"/>`,
    $0 = (e) =>
      `<path d="M97,168 Q94,94 160,92 Q226,94 223,168 Q224,158 160,150 Q96,158 97,168Z" fill="${e}"/>${x0(e)}<ellipse cx="101" cy="176" rx="11" ry="16" fill="${e}"/><ellipse cx="219" cy="176" rx="11" ry="16" fill="${e}"/><rect x="136" y="222" width="48" height="52" rx="6" fill="${e}"/>`,
    H0 = (e, t = !0) =>
      `<path d="M100,140 Q160,124 220,140 L220,154 Q160,138 100,154Z" fill="${e}"/>` +
      (t
        ? `<path d="M216,144 Q242,150 256,176 L246,178 Q236,160 214,154Z M218,148 Q246,170 248,200 L240,198 Q236,176 214,156Z" fill="${e}"/>`
        : ""),
    l0 = (e, t = "#000") =>
      `<path d="M88,196 Q84,86 160,76 Q236,86 232,196 Q234,256 206,268 Q220,204 206,152 Q188,118 160,118 Q132,118 114,152 Q100,204 114,268 Q86,256 88,196Z" fill="${e}"/><path d="M114,152 Q132,118 160,118 Q188,118 206,152" stroke="${t}" stroke-opacity=".35" stroke-width="6" fill="none"/>`,
    r0 = (e) => `<path d="M88,196 Q84,86 160,76 Q236,86 232,196 Q234,256 206,268 L114,268 Q86,256 88,196Z" fill="${e}"/>`,
    O0 = (e = "#05050a") => `<ellipse cx="160" cy="176" rx="50" ry="60" fill="${e}"/>`,
    E = (e) =>
      `<path d="M98,150 Q74,250 92,352 Q124,370 160,362 Q196,370 228,352 Q246,250 222,150 Q200,94 160,94 Q120,94 98,150Z" fill="${e}"/><path d="M106,200 Q98,280 108,350 M214,200 Q222,280 212,350" stroke="#000" stroke-opacity=".14" stroke-width="5" fill="none"/>`,
    O = (e) =>
      `<path d="M100,170 C94,110 126,96 160,96 C196,96 226,110 220,170 C214,140 202,124 186,118 C188,134 180,142 168,148 C170,132 162,122 150,120 C134,124 118,140 108,162 Z" fill="${e}"/><path d="M130,108 Q150,100 170,104" stroke="#fff" stroke-width="4" opacity=".22" fill="none" stroke-linecap="round"/>`,
    p1 = (e) =>
      `<path d="M100,168 L82,128 L106,132 L94,90 L126,106 L128,56 L156,96 L172,48 L186,98 L216,68 L208,116 L240,112 L220,150 L220,168 Q214,120 160,114 Q106,120 100,168 Z" fill="${e}"/><path d="M114,118 L122,152 L134,122 L146,150 L156,120 L168,148 L178,120 L190,152 L204,120Z" fill="${e}"/><path d="M128,70 L146,104 M172,60 L176,100" stroke="#fff" stroke-width="3" opacity=".3"/>`,
    $1 = (e, t) =>
      `<path d="M100,172 Q88,120 110,94 Q108,118 124,110 Q116,74 146,54 Q140,90 158,88 Q160,52 190,40 Q176,82 198,94 Q216,70 232,90 Q216,108 224,130 Q232,152 220,174 Q214,124 160,116 Q106,124 100,172 Z" fill="${e}"/><path d="M110,150 Q108,120 124,108 Q126,126 138,120 Q138,92 158,80 Q156,104 170,104 Q178,80 196,74 Q186,100 202,112 Q214,104 218,120 Q210,124 214,146 Q196,120 160,118 Q124,120 110,150 Z" fill="${t}"/>`,
    b0 = (e = "#d4af37", t = "#e0115f", a = 0) =>
      `<g transform="translate(0,${a})"><path d="M112,124 L118,86 L138,108 L160,76 L182,108 L202,86 L208,124 Z" fill="${e}" stroke="${j(e, -30)}" stroke-width="2.5"/><rect x="112" y="116" width="96" height="12" fill="${j(e, -12)}"/>${g(
        [
          [160, 98],
          [129, 112],
          [191, 112],
        ],
        5,
        t,
      )}${g(
        [
          [118, 86],
          [202, 86],
          [160, 76],
        ],
        4,
        e,
      )}</g>`,
    i0 = (e, t, a = 0) =>
      `<g transform="translate(0,${a})"><path d="M100,166 Q160,150 220,166" stroke="#2a2a2a" stroke-width="9" fill="none"/>${p(`<circle cx="136" cy="166" r="16" fill="${e}"/><circle cx="136" cy="166" r="11" fill="${t}"/><circle cx="131" cy="161" r="3.5" fill="#fff" opacity=".7"/>`)}</g>`,
    b1 = (e) => p(`<path d="M104,170 L72,138 L106,186Z" fill="${e}"/><path d="M100,170 L80,148" stroke="${j(e, -25)}" stroke-width="2"/>`),
    u1 = (e, t, a = 50) =>
      p(`<path d="M112,128 L106,${120 - a} L148,108Z" fill="${e}"/><path d="M116,122 L112,${128 - a * 0.75} L140,110Z" fill="${t}"/>`),
    g1 = () => '<path d="M148,206 L151,218 L154,206Z M166,206 L169,218 L172,206Z" fill="#fff"/>',
    z = (e, t) =>
      `<path d="M88,262 Q62,380 26,504 Q160,540 294,504 Q258,380 232,262 Z" fill="${t || j(e, -35)}"/><path d="M92,262 Q78,384 56,508 Q160,532 264,508 Q242,384 228,262 Z" fill="${e}"/><path d="M116,276 Q106,400 100,516 M204,276 Q214,400 220,516 M160,280 L160,524" stroke="#000" stroke-opacity=".14" stroke-width="6" fill="none"/>`,
    u0 = (e, t) =>
      `<path d="M90,262 Q74,330 60,404 Q160,428 260,404 Q246,330 230,262 Z" fill="${t || j(e, -35)}"/><path d="M94,262 Q84,334 76,408 Q160,424 244,408 Q236,334 226,262 Z" fill="${e}"/>`,
    t0 = (e, t, a = 0.78) =>
      p(
        `<path d="M148,286 C118,188 36,146 20,212 C10,262 70,300 148,300 Z" fill="${e}" opacity="${a}" stroke="${t}" stroke-width="2.5"/><path d="M148,306 C96,310 48,360 66,406 C84,446 132,382 150,314 Z" fill="${e}" opacity="${a}" stroke="${t}" stroke-width="2.5"/><path d="M148,292 C112,246 72,218 38,212 M148,310 C112,340 90,370 76,398" stroke="${t}" stroke-width="1.6" fill="none" opacity=".8"/>${g(
          [
            [70, 236],
            [96, 262],
            [84, 380],
          ],
          4,
          "#fff",
          0.7,
        )}`,
      ),
    L1 = (e, t) =>
      p(
        `<path d="M122,292 L18,198 L32,250 L-2,262 L26,300 L2,334 L58,340 L48,382 L126,344 Z" fill="${e}" stroke="${t}" stroke-width="2.5" stroke-linejoin="round"/><path d="M122,296 L18,198 M122,310 L-2,262 M124,324 L2,334 M124,336 L48,382" stroke="${t}" stroke-width="2" opacity=".7"/>`,
      ),
    g0 = (e, t) => {
      let a = "";
      for (let r = 0; r < 7; r++) {
        let l = 250 + r * 22,
          o = 112 - r * 9;
        a += `<path d="M138,${290 + r * 8} Q${120 - o * 0.6},${l - 30} ${138 - o},${l + 4} Q${110 - o * 0.4},${l + 20} 138,${306 + r * 8}Z" fill="${e}" stroke="${t}" stroke-width="1.6"/>`;
      }
      return p(a);
    },
    T = (e, t = 0.3) => Q(160, 330, 160, 250, e, t),
    M1 = (e, t) =>
      `<path d="M206,360 Q270,380 278,440 Q284,490 250,520 Q270,470 252,430 Q238,396 200,384Z" fill="${e}"/>` +
      (t ? `<path d="M250,520 Q270,470 262,452 Q284,480 250,520Z" fill="${t}"/>` : ""),
    F0 =
      '<g transform="translate(206,236) rotate(24)"><rect x="0" y="0" width="22" height="96" rx="5" fill="#6b3f1f"/><path d="M3,0 L4,-24 M10,0 L11,-28 M17,0 L18,-22" stroke="#d9c79a" stroke-width="3"/><path d="M0,-26 L8,-30 L4,-18Z M7,-30 L15,-34 L11,-22Z M14,-24 L22,-28 L18,-16Z" fill="#c43a2a"/></g>',
    $ = {
      katana: (e = "#dfe6ee", t = "#2b2b2b") =>
        `<g transform="translate(250,382) rotate(-24)"><rect x="-4" y="-150" width="8" height="140" rx="3" fill="${e}"/><path d="M-4,-150 L0,-162 L4,-150Z" fill="${e}"/><rect x="-10" y="-12" width="20" height="6" rx="2" fill="#d4af37"/><rect x="-4" y="-6" width="8" height="40" rx="2" fill="${t}"/><path d="M-4,0 l8,6 M-4,10 l8,6 M-4,20 l8,6" stroke="#888" stroke-width="1.5"/></g>`,
      sword: (e = "#dfe6ee", t = "#d4af37") =>
        `<g transform="translate(252,392) rotate(-14)"><path d="M-7,-14 L-7,-150 L0,-166 L7,-150 L7,-14Z" fill="${e}"/><path d="M0,-160 L0,-18" stroke="#fff" stroke-width="2" opacity=".5"/><rect x="-22" y="-16" width="44" height="9" rx="3" fill="${t}"/><rect x="-4" y="-8" width="8" height="30" fill="#4a2f1a"/><circle cy="26" r="7" fill="${t}"/></g>`,
      staff: (e = "#6b3f1f", t = "") =>
        `<g transform="translate(262,544) rotate(-4)"><rect x="-5" y="-400" width="10" height="400" rx="5" fill="${e}"/>${t}</g>`,
      spear: (e = "#6b3f1f", t = "#cfd6de") =>
        `<g transform="translate(262,548) rotate(-4)"><rect x="-4" y="-430" width="8" height="430" rx="3" fill="${e}"/><path d="M-12,-428 L0,-476 L12,-428 L0,-420Z" fill="${t}"/></g>`,
      trident: (e = "#d4af37") =>
        `<g transform="translate(262,548) rotate(-4)"><rect x="-4" y="-410" width="8" height="410" rx="3" fill="${e}"/><path d="M-30,-410 L30,-410 L30,-404 L-30,-404Z M-30,-410 L-30,-450 L-38,-440 M30,-410 L30,-450 L38,-440 M0,-410 L0,-466" stroke="${e}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M-6,-462 L0,-478 L6,-462Z M-36,-446 L-30,-462 L-24,-446Z M24,-446 L30,-462 L36,-446Z" fill="${e}"/></g>`,
      axe: (e = "#8f979f") =>
        `<g transform="translate(256,420) rotate(-16)"><rect x="-4" y="-130" width="8" height="150" rx="3" fill="#5c3a21"/><path d="M4,-128 Q44,-140 46,-96 Q44,-70 4,-84Z" fill="${e}" stroke="${j(e, -30)}" stroke-width="2"/><path d="M-4,-120 Q-26,-110 -24,-96 Q-14,-100 -4,-94Z" fill="${e}"/></g>`,
      scythe: () =>
        '<g transform="translate(270,548) rotate(-6)"><rect x="-5" y="-440" width="10" height="440" rx="4" fill="#2b1e14"/><path d="M0,-436 Q-120,-470 -170,-380 Q-110,-430 0,-412Z" fill="#c9d1da" stroke="#5c6670" stroke-width="2"/></g>',
      wand: (e = "#2b2b2b", t = "#ffd23f") =>
        `<g transform="translate(244,340) rotate(30)"><rect x="-3" y="-60" width="6" height="60" rx="2" fill="${e}"/><rect x="-3" y="-60" width="6" height="10" fill="#fff"/></g>${A(274, 284, 10, t)}${g(
          [
            [288, 270],
            [262, 268],
            [292, 300],
          ],
          2.5,
          t,
        )}`,
      orb: (e, t) =>
        `${Q(268, 316, 44, 44, e, 0.5)}<circle cx="268" cy="316" r="20" fill="${e}"/><circle cx="268" cy="316" r="13" fill="${t}"/><circle cx="261" cy="309" r="5" fill="#fff" opacity=".8"/>`,
      bolt: (e = "#ffe14a") =>
        `${Q(266, 300, 40, 70, e, 0.4)}<path d="M276,220 L248,300 L266,300 L250,382 L292,282 L272,282 L290,220Z" fill="${e}" stroke="#fff" stroke-width="2"/>`,
      guitar: (e = "#c81d3f") =>
        `<g transform="translate(232,388) rotate(-34)"><path d="M0,0 Q-30,-6 -32,24 Q-36,46 -14,54 Q0,60 14,54 Q36,46 32,24 Q30,-6 0,0Z" fill="${e}"/><circle cy="26" r="9" fill="#111"/><rect x="-5" y="-110" width="10" height="112" fill="#3a2614"/><rect x="-9" y="-128" width="18" height="22" rx="3" fill="#111"/><path d="M-2,-110 L-2,40 M2,-110 L2,40" stroke="#eee" stroke-width=".8"/></g>`,
      mic: () =>
        '<g transform="translate(252,310) rotate(12)"><rect x="-4" y="0" width="8" height="50" rx="3" fill="#2b2b2b"/><circle cy="-6" r="12" fill="#888"/><path d="M-10,-10 h20 M-11,-4 h22" stroke="#555" stroke-width="1.5"/></g>',
      potion: (e = "#4ade80") =>
        `<g transform="translate(262,320)"><path d="M-8,-30 L8,-30 L8,-12 Q26,0 22,20 Q16,36 0,36 Q-16,36 -22,20 Q-26,0 -8,-12Z" fill="#dff6ff" opacity=".55" stroke="#9fd8f0" stroke-width="2"/><path d="M-20,8 Q0,2 20,8 Q18,32 0,32 Q-18,32 -20,8Z" fill="${e}"/><rect x="-10" y="-38" width="20" height="9" rx="2" fill="#8a5a2b"/>${g(
          [
            [-4, -46],
            [6, -58],
            [-2, -70],
          ],
          4,
          e,
          0.7,
        )}</g>`,
      lantern: () =>
        `<g transform="translate(262,322)"><path d="M0,-34 Q-10,-46 0,-50 Q10,-46 0,-34" stroke="#333" stroke-width="3" fill="none"/>${Q(0, 0, 36, 36, "#ffcf5a", 0.6)}<rect x="-16" y="-30" width="32" height="8" rx="2" fill="#3a2f1d"/><rect x="-13" y="-22" width="26" height="40" rx="4" fill="#ffd77a" stroke="#3a2f1d" stroke-width="3"/><rect x="-16" y="18" width="32" height="8" rx="2" fill="#3a2f1d"/></g>`,
      bow: (e = "#7a4a22") =>
        `<g transform="translate(262,330)"><path d="M0,-110 Q46,0 0,110" stroke="${e}" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M0,-110 L0,110" stroke="#e8e0c8" stroke-width="1.6"/></g>`,
      daggers: () =>
        p(
          '<g transform="translate(64,330) rotate(-150)"><path d="M-4,0 L-4,-50 L0,-62 L4,-50 L4,0Z" fill="#cfd6de"/><rect x="-10" y="0" width="20" height="5" fill="#5a3a7a"/><rect x="-3" y="5" width="6" height="18" fill="#222"/></g>',
        ),
      rifle: () =>
        '<g transform="translate(222,334) rotate(-18)"><rect x="0" y="0" width="96" height="18" rx="4" fill="#3b4048"/><rect x="60" y="-6" width="30" height="8" rx="2" fill="#ff8a1f"/><rect x="10" y="16" width="14" height="26" rx="3" fill="#2b2f36"/><rect x="88" y="4" width="26" height="8" fill="#2b2f36"/><rect x="34" y="16" width="10" height="16" rx="2" fill="#2b2f36"/></g>',
      map: () =>
        '<g transform="translate(234,302) rotate(-8)"><path d="M0,0 L18,6 L36,0 L54,6 L54,62 L36,56 L18,62 L0,56Z" fill="#e8d7a6" stroke="#8a6a3a" stroke-width="2"/><path d="M8,16 Q20,30 30,22 Q40,14 46,40" stroke="#c43a2a" stroke-width="2.5" stroke-dasharray="4 3" fill="none"/><path d="M42,36 l6,6 M48,36 l-6,6" stroke="#c43a2a" stroke-width="3"/></g>',
      lasso: () =>
        '<g transform="translate(262,330)"><ellipse rx="24" ry="30" fill="none" stroke="#c9a066" stroke-width="5"/><ellipse rx="18" ry="24" fill="none" stroke="#a27c45" stroke-width="3"/><path d="M-10,28 Q-20,60 0,90" stroke="#c9a066" stroke-width="5" fill="none"/></g>',
      rollingPin: () =>
        '<g transform="translate(258,324) rotate(-34)"><rect x="-10" y="-40" width="20" height="80" rx="9" fill="#e0b47a"/><rect x="-4" y="-62" width="8" height="24" rx="3" fill="#b9874a"/><rect x="-4" y="38" width="8" height="24" rx="3" fill="#b9874a"/></g>',
      pillow: () =>
        '<g transform="translate(258,330) rotate(-10)"><rect x="-30" y="-22" width="60" height="44" rx="16" fill="#f7f1ff" stroke="#c7b8e8" stroke-width="2"/><path d="M-30,-22 l-6,-6 M30,-22 l6,-6 M-30,22 l-6,6 M30,22 l6,6" stroke="#c7b8e8" stroke-width="3"/></g>',
      pot: () =>
        '<g transform="translate(262,334)"><ellipse cx="0" cy="-20" rx="30" ry="8" fill="#5a3a20"/><path d="M-30,-20 Q-34,26 0,30 Q34,26 30,-20Z" fill="#b8742a"/><ellipse cx="0" cy="-20" rx="24" ry="5" fill="#2a1a0a"/><path d="M-30,-14 q-12,2 -10,14 M30,-14 q12,2 10,14" stroke="#5a3a20" stroke-width="4" fill="none"/><ellipse cx="34" cy="26" rx="12" ry="9" fill="#b8742a"/><ellipse cx="34" cy="20" rx="9" ry="3" fill="#5a3a20"/></g>',
      kopuz: () =>
        '<g transform="translate(244,380) rotate(-30)"><path d="M0,0 Q-24,-4 -24,24 Q-22,54 0,58 Q22,54 24,24 Q24,-4 0,0Z" fill="#8a5a2b"/><path d="M-14,20 Q0,8 14,20 L14,44 Q0,52 -14,44Z" fill="#e8d7a6"/><rect x="-4" y="-104" width="8" height="106" fill="#5c3a1a"/><path d="M-4,-110 Q0,-124 12,-120" stroke="#5c3a1a" stroke-width="8" fill="none"/><path d="M-1,-100 L-1,46 M2,-100 L2,46" stroke="#eee" stroke-width=".8"/></g>',
      yatagan: () =>
        '<g transform="translate(250,382) rotate(-30)"><path d="M-3,-10 Q-14,-70 4,-140 Q-2,-70 6,-10Z" fill="#dfe6ee" stroke="#8e98a2" stroke-width="1.5"/><rect x="-8" y="-12" width="16" height="6" fill="#d4af37"/><path d="M-4,-6 L-4,20 Q0,30 8,22 L6,-6Z" fill="#e8e0c8"/></g>',
      cutlass: () =>
        '<g transform="translate(250,392) rotate(-20)"><path d="M-6,-14 Q-10,-90 10,-150 Q14,-90 6,-14Z" fill="#dfe6ee" stroke="#8e98a2" stroke-width="1.5"/><path d="M-16,-14 Q0,-26 16,-14 Q20,12 0,20 Q-20,12 -16,-14Z" fill="none" stroke="#d4af37" stroke-width="4"/><rect x="-4" y="-12" width="8" height="28" fill="#4a2f1a"/></g>',
      crook: () =>
        '<g transform="translate(258,430) rotate(-14)"><rect x="-5" y="-150" width="10" height="150" fill="#1d3d8f"/><path d="M-5,-140 l10,10 M-5,-120 l10,10 M-5,-100 l10,10 M-5,-80 l10,10 M-5,-60 l10,10" stroke="#d4af37" stroke-width="4"/><path d="M0,-150 Q0,-186 26,-182 Q40,-178 34,-160" stroke="#d4af37" stroke-width="10" fill="none" stroke-linecap="round"/></g>',
      ankh: () =>
        '<g transform="translate(262,548) rotate(-3)"><rect x="-4" y="-360" width="8" height="360" fill="#d4af37"/><ellipse cy="-384" rx="14" ry="20" fill="none" stroke="#d4af37" stroke-width="7"/><rect x="-24" y="-366" width="48" height="8" rx="3" fill="#d4af37"/></g>',
      laserKatana: (e) =>
        `<g transform="translate(250,382) rotate(-24)">${Q(0, -82, 18, 86, e, 0.55)}<rect x="-4" y="-160" width="8" height="150" rx="4" fill="#fff"/><rect x="-6" y="-160" width="12" height="150" rx="6" fill="${e}" opacity=".55"/><rect x="-10" y="-12" width="20" height="6" rx="2" fill="#555"/><rect x="-4" y="-6" width="8" height="40" rx="2" fill="#222"/></g>`,
      shuriken: (e = "#c0c6cc") =>
        `<path d="M0,-12 L3,-3 L12,0 L3,3 L0,12 L-3,3 L-12,0 L-3,-3Z" fill="${e}"/><circle r="2.5" fill="#333"/>`,
      cigar: () =>
        '<g transform="rotate(18 190 208)"><rect x="178" y="204" width="28" height="7" rx="3" fill="#7a5230"/><rect x="198" y="204" width="3" height="7" fill="#d4af37"/><circle cx="207" cy="207" r="4" fill="#e35b3f"/></g><path d="M214,196 q6,-10 0,-18 q-6,-8 2,-16" stroke="#ccc" stroke-width="2" fill="none" opacity=".5"/>',
      gloves: (e) =>
        `<path d="M160,262 Q150,286 132,296 M160,262 Q170,286 188,296" stroke="#ddd" stroke-width="2.5" fill="none"/><g transform="translate(128,310) rotate(-12)"><path d="M-18,-16 Q-20,-30 0,-30 Q22,-30 20,-6 Q20,18 0,20 Q-18,18 -18,0Z" fill="${e}"/><rect x="-16" y="16" width="30" height="12" rx="3" fill="#f2efe4"/><path d="M-10,-24 Q2,-26 10,-18" stroke="#fff" stroke-width="3" opacity=".35" fill="none"/></g><g transform="translate(192,310) rotate(12)"><path d="M18,-16 Q20,-30 0,-30 Q-22,-30 -20,-6 Q-20,18 0,20 Q18,18 18,0Z" fill="${e}"/><rect x="-14" y="16" width="30" height="12" rx="3" fill="#f2efe4"/></g>`,
    },
    M =
      (e, t = 0.6, a) =>
      (r, l) =>
        `<rect x="${-r - 1.5}" y="${l * t}" width="${r * 2 + 3}" height="${l * (1 - t) + 3}" rx="${r * 0.5}" fill="${e}"/>` +
        (a ? `<rect x="${-r - 3}" y="${l * t - 2}" width="${r * 2 + 6}" height="9" rx="4" fill="${a}"/>` : ""),
    I0 =
      (e, t = 5) =>
      (a, r) =>
        `<rect x="${-t / 2}" y="4" width="${t}" height="${r - 8}" fill="${e}"/>`,
    U = (e) => (t, a) => `<rect x="${t - 7}" y="2" width="5" height="${a - 6}" fill="${e}"/>`,
    R0 =
      (e, t = 0.38, a) =>
      (r, l) =>
        `<rect x="${-r - 2}" y="-2" width="${r * 2 + 4}" height="${Math.min(l, 155 * t)}" rx="5" fill="${e}"/>` +
        (a ? `<rect x="${-r - 2}" y="-2" width="${r * 2 + 4}" height="8" fill="${a}"/>` : ""),
    X = (e) => (t, a) => (a > 100 ? `<rect x="${-t - 1}" y="${a * 0.42}" width="${t * 2 + 2}" height="20" rx="8" fill="${e}"/>` : ""),
    L0 = (e) => (t, a) =>
      `<path d="M${-t},0 Q${-t - 12},${a * 0.5} ${-t + 2},${a * 0.78} L${t - 2},${a * 0.78} Q${t + 12},${a * 0.5} ${t},0Z" fill="${e}"/><path d="M0,6 Q-4,${a * 0.4} 0,${a * 0.74}" stroke="#000" stroke-opacity=".18" stroke-width="2.5" fill="none"/>`,
    J = (e) => (t, a) => {
      let r = "";
      for (let l = 6; l < a - 4; l += 12) r += `<path d="M${-t},${l} L${t},${l + 6}" stroke="${e}" stroke-width="2" opacity=".6"/>`;
      return r;
    },
    F = (e) => (t, a) =>
      a > 100
        ? `<path d="M${-t - 1},${a * 0.5} L${t + 1},${a * 0.5} L${t},${a} L${-t},${a}Z" fill="${e}"/><path d="M${-t + 4},${a * 0.56} L${-t + 4},${a * 0.92}" stroke="#fff" stroke-width="3" opacity=".3"/>`
        : "",
    x1 = (e) => (t, a) => `<rect x="${-t - 4}" y="${a * 0.62}" width="${t * 2 + 8}" height="16" rx="8" fill="${e}"/>`,
    k = "erkek",
    S = "kadin",
    d = (e) => ({
      hat: "none",
      faceAcc: "none",
      neckAcc: "none",
      heldItem: "yok",
      tattoo: "yok",
      earring: "yok",
      facialHair: "none",
      ...e,
    }),
    u = ["head", "face"],
    o0 = {
      volt: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#e0ac69",
          hairStyle: "kel",
          pantsColor: "#14161f",
          shoeColor: "#0e2a33",
          shoeStyle: "bot",
          background: "#062a33",
        }),
        b: T("#22d3ee", 0.22),
        t0: y("#14161f"),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 6},${e.ty + 16} L120,380 M${e.tr - 6},${e.ty + 16} L200,380" stroke="#22d3ee" stroke-width="5"/>`,
          Y("bolt", "#0b0d14", "#22d3ee"),
          L("#0b0d14", "#22d3ee"),
        ),
        h:
          e0("#14161f") +
          '<path d="M160,104 L152,134 L162,134 L156,152" stroke="#22d3ee" stroke-width="4" fill="none"/>' +
          V("hero", "#bff8ff", "#0a7f94", "#22d3ee"),
        f: '<path d="M248,280 l12,10 l-8,6 l14,14 M270,330 l10,6 l-6,6 l12,10" stroke="#7ff0ff" stroke-width="3" fill="none" stroke-linecap="round"/>',
        leg: m(U("#22d3ee"), M("#0e2a33", 0.66)),
        cover: u,
      },
      gecekartali: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#c68863",
          hairStyle: "kel",
          mouthShape: "thin",
          facialHair: "short",
          hairColor: "#1a1410",
          pantsColor: "#123a34",
          shoeColor: "#0a1f1c",
          shoeStyle: "bot",
          background: "#061a18",
        }),
        b: i(
          g0("#1d5a50", "#c9d1da"),
          p('<path d="M138,300 L10,250 L30,290 L6,320 L40,330 L24,370 L138,330Z" fill="#123a34" opacity=".0"/>'),
        ),
        t0: y("#123a34"),
        t: i(N("#1d5a50", "#e8eef4"), P.eagle("#e8eef4"), L("#0a1f1c", "#c81d3f")),
        h:
          '<path d="M98,168 Q94,96 160,92 Q226,96 222,168 L222,182 Q194,174 176,190 L160,206 L144,190 Q126,174 98,182Z" fill="#e8eef4"/><path d="M160,206 L150,190 L170,190Z" fill="#c9a040"/>' +
          p(
            '<path d="M120,104 Q86,92 60,104 Q84,110 92,118 Q70,122 52,138 Q84,134 104,130Z" fill="#e8eef4" stroke="#9aa4ae" stroke-width="2"/><path d="M110,110 Q86,108 70,112 M106,124 Q84,126 66,132" stroke="#9aa4ae" stroke-width="1.5" fill="none"/>',
          ) +
          '<path d="M160,92 L160,150" stroke="#c81d3f" stroke-width="5"/>' +
          V("slit", "#ffe8c8", "#000", "#ff8a3a"),
        leg: M("#0a1f1c", 0.58, "#e8eef4"),
        cover: u,
      },
      alevkralice: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#f1c27d",
          hairStyle: "kel",
          hairColor: "#ff6a1a",
          eyelash: "long",
          mouthShape: "smirk",
          lipColor: "#c81d3f",
          pantsColor: "#a3201a",
          shoeColor: "#d4af37",
          shoeStyle: "bot",
          background: "#3a0d06",
        }),
        b: T("#ff6a1a", 0.32),
        hb: E("#ff4d1a"),
        t0: y("#a3201a"),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 10},${e.ty + 30} Q160,350 ${e.tr - 10},${e.ty + 30}" stroke="#ffb42a" stroke-width="5" fill="none"/>`,
          P.flame("#ffb42a"),
          L("#5a0f0a"),
        ),
        h: $1("#ff4d1a", "#ffb42a") + a0("#d4af37", "#7a1f00"),
        leg: M("#d4af37", 0.6),
      },
      buzmuhafiz: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#bfe6ff",
          hairStyle: "kel",
          mouthShape: "thin",
          lipColor: "#5a8fb8",
          pantsColor: "#9fd0f0",
          shoeColor: "#e8f6ff",
          shoeStyle: "bot",
          background: "#0b2238",
        }),
        b: T("#9fe3ff", 0.35),
        t0: y("#7fb8dc"),
        t: i(N("#d8f1ff", "#4f8fbf"), D("#e8f6ff", "#bfe6ff"), P.diamond("#4fb8f0"), L("#4f8fbf", "#e8f6ff")),
        h:
          '<path d="M98,160 Q98,94 160,90 Q222,94 222,160 L214,150 Q160,128 106,150Z" fill="#e8f6ff"/><path d="M118,112 L112,62 L132,102 L146,50 L158,98 L170,42 L178,98 L194,54 L196,104 L212,70 L206,114Z" fill="#bfe6ff" stroke="#7fb8dc" stroke-width="2"/>' +
          p('<path d="M120,166 L152,162" stroke="#e8fbff" stroke-width="5" stroke-linecap="round"/>') +
          p(Q(136, 166, 22, 12, "#9fe3ff", 0.5)),
        f: $.spear("#bfe6ff", "#e8fbff"),
        leg: m(F("#e8f6ff")),
      },
      dalgakaptani: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#c68863",
          hairStyle: "wavy",
          hairColor: "#e8f6ff",
          facialHair: "short",
          mouthShape: "smile",
          pantsColor: "#0e5a66",
          shoeColor: "#083a42",
          shoeStyle: "bot",
          background: "#062f3a",
        }),
        b: z("#0a7f94", "#063f4a"),
        t0: y("#0e6e7a"),
        t: i(
          ({ B: e }) => `<path d="M${e.tl},340 Q120,326 160,340 Q200,354 ${e.tr},340 L${e.tr},380 L${e.tl},380Z" fill="#0a4f5a"/>`,
          Y("wave", "#063f4a", "#7ff0ff"),
          R("#7ff0ff"),
        ),
        h: a0("#063f4a", "#0a7f94"),
        f: $.orb("#3ab8ff", "#bff3ff") + '<path d="M240,354 q10,-10 20,0 q10,10 20,0" stroke="#7ff0ff" stroke-width="3" fill="none"/>',
        leg: M("#083a42", 0.64, "#7ff0ff"),
      },
      kuantum: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#e0ac69",
          hairStyle: "kel",
          pantsColor: "#2a1050",
          shoeColor: "#f2efe4",
          shoeStyle: "bot",
          background: "#1a0838",
        }),
        b:
          '<ellipse cx="160" cy="300" rx="150" ry="46" fill="none" stroke="#e879f9" stroke-width="3" opacity=".5" transform="rotate(-18 160 300)"/><ellipse cx="160" cy="300" rx="150" ry="46" fill="none" stroke="#a78bfa" stroke-width="3" opacity=".5" transform="rotate(18 160 300)"/>' +
          T("#b44cff", 0.2),
        t0: y("#3b1a6b"),
        t: i(
          ({ B: e }) => `<path d="M${e.tl + 20},${e.ty} L160,300 L${e.tr - 20},${e.ty}" stroke="#f2efe4" stroke-width="6" fill="none"/>`,
          P.orbit("#f2efe4"),
          L("#2a1050", "#e879f9"),
        ),
        h:
          e0("#3b1a6b") +
          '<path d="M120,110 Q160,96 200,110" stroke="#f2efe4" stroke-width="5" fill="none"/>' +
          V("almond", "#ffe6ff", "#e879f9", "#e879f9"),
        leg: m(I0("#e879f9", 4), M("#f2efe4", 0.7)),
        cover: u,
      },
      golgehancer: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#e0ac69",
          hairStyle: "kel",
          eyeShape: "narrow",
          eyeColor: "#b44cff",
          eyelash: "dramatic",
          pantsColor: "#1b1026",
          shoeColor: "#100818",
          shoeStyle: "bot",
          background: "#120a1c",
        }),
        b:
          '<path d="M60,520 Q20,440 50,380 Q30,450 80,490Z M270,520 Q310,440 280,380 Q300,450 250,490Z" fill="#2a1a3a" opacity=".6"/>' +
          u0("#2a1a3a", "#120a1c"),
        t0: y("#241536"),
        t: i(
          ({ B: e }) => `<path d="M${e.tl + 4},${e.ty + 20} L${e.tr - 4},350" stroke="#3a2650" stroke-width="12"/>`,
          L("#100818", "#b44cff"),
        ),
        hb: r0("#2a1a3a"),
        h: l0("#2a1a3a") + x0("#1b1026"),
        f: $.daggers(),
        leg: M("#100818", 0.5),
        cover: u,
      },
      demirtitan: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#e0ac69",
          hairStyle: "kel",
          pantsColor: "#dfe7ec",
          shoeColor: "#2a8a96",
          shoeStyle: "bot",
          background: "#0a1f24",
        }),
        b: T("#2ee6d6", 0.2) + '<path d="M58,520 L80,560 L100,520Z M220,520 L240,560 L262,520Z" fill="#2ee6d6" opacity=".4"/>',
        t0: y("#c9d6dc"),
        t: i(
          N("#eef3f6", "#2a8a96"),
          D("#eef3f6"),
          ({ B: e }) => `<path d="M${e.tl + 10},350 L${e.tr - 10},350" stroke="#2a8a96" stroke-width="6"/>`,
          P.hex("#2ee6d6"),
        ),
        h: `<path d="M96,176 Q92,96 160,90 Q228,96 224,176 Q224,226 190,242 L130,242 Q96,226 96,176Z" fill="#eef3f6"/><path d="M96,176 Q92,96 160,90 L160,242 L130,242 Q96,226 96,176Z" fill="#fff" opacity=".25"/><path d="M114,158 L206,158 L200,180 L120,180Z" fill="#0d2a30"/><path d="M118,166 L202,166" stroke="#2ee6d6" stroke-width="5"/>${Q(160, 166, 60, 14, "#2ee6d6", 0.4)}<path d="M130,206 L190,206 M134,218 L186,218" stroke="#2a8a96" stroke-width="3"/><rect x="152" y="96" width="16" height="40" rx="4" fill="#2a8a96"/><rect x="134" y="222" width="52" height="52" fill="#c9d6dc"/>`,
        leg: m(F("#eef3f6"), X("#2a8a96")),
        cover: u,
      },
      yildiztozu: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#8d5524",
          hairStyle: "kel",
          hairColor: "#f4c6ff",
          eyelash: "long",
          mouthShape: "smile",
          lipColor: "#c9636b",
          eyeColor: "#6b3fa0",
          pantsColor: "#1a1240",
          shoeColor: "#d4af37",
          shoeStyle: "bot",
          background: "#0d0828",
        }),
        b: i(
          z("#2a1a6b", "#0d0828"),
          g(
            [
              [60, 440],
              [90, 380],
              [120, 470],
              [210, 420],
              [240, 470],
              [250, 380],
              [180, 500],
              [100, 300],
              [222, 320],
            ],
            2.5,
            "#fff",
            0.9,
          ),
          A(76, 410, 6, "#ffd23f"),
          A(236, 440, 7, "#f4c6ff"),
        ),
        hb: E("#f4c6ff"),
        t0: y("#1a1240"),
        t: i(
          g(
            [
              [110, 290],
              [196, 300],
              [130, 350],
              [210, 360],
              [96, 330],
              [180, 280],
            ],
            2,
            "#fff",
            0.9,
          ),
          P.star("#ffd23f"),
          R("#ffd23f"),
          L("#2a1a6b"),
        ),
        h:
          O("#f4c6ff") +
          '<path d="M118,120 Q160,104 202,120" stroke="#d4af37" stroke-width="5" fill="none"/>' +
          A(160, 104, 13, "#ffd23f") +
          p(A(126, 196, 4, "#fff")),
        leg: M("#d4af37", 0.62),
      },
      kasirga: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#ffdbb0",
          hairStyle: "undercut",
          hairColor: "#e8d98a",
          mouthShape: "smile",
          pantsColor: "#2f4a3c",
          shoeColor: "#e8e6df",
          shoeStyle: "spor",
          background: "#0f2a22",
        }),
        b: '<path d="M20,300 Q80,280 120,300 M10,350 Q70,330 110,350 M24,400 Q80,384 120,402" stroke="#9fe0c0" stroke-width="5" fill="none" opacity=".5" stroke-linecap="round"/>',
        t0: y("#3d5a4a"),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 6},${e.ty + 14} L160,330 L${e.tr - 6},${e.ty + 14}" stroke="#9fe0c0" stroke-width="7" fill="none"/>`,
          P.swirl("#e8f6ee"),
          L("#2f4a3c", "#9fe0c0"),
        ),
        h: i0("#2f4a3c", "#9fe0c0", -42),
        leg: m(U("#9fe0c0")),
      },
      kozmikmuhafiz: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#a86b3c",
          hairStyle: "kel",
          pantsColor: "#111111",
          shoeColor: "#d4af37",
          shoeStyle: "bot",
          background: "#140c00",
        }),
        b: i(
          z("#111", "#d4af37"),
          '<circle cx="160" cy="130" r="92" fill="none" stroke="#ffd23f" stroke-width="6" opacity=".9"/><circle cx="160" cy="130" r="100" fill="none" stroke="#ffd23f" stroke-width="2" opacity=".5"/>',
          T("#ffd23f", 0.22),
        ),
        t0: y("#151515"),
        t: i(N("#d4af37", "#7a5a10"), D("#d4af37"), Y("sun", "#151515", "#ffd23f", 22), L("#7a5a10")),
        h:
          e0("#151515") +
          '<path d="M98,150 Q100,98 160,94 Q220,98 222,150 L200,140 L160,170 L120,140Z" fill="#d4af37"/>' +
          V("slit", "#fff", "#000", "#fff8c8"),
        leg: m(F("#d4af37")),
        cover: u,
      },
      miknatis: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "pixie",
          hairColor: "#ff2e88",
          eyelash: "long",
          mouthShape: "smirk",
          lipColor: "#c9636b",
          pantsColor: "#a9b0ba",
          shoeColor: "#ff2e88",
          shoeStyle: "bot",
          background: "#2a0a1c",
        }),
        b:
          '<path d="M30,260 q20,20 0,40 q-20,20 0,40 M290,260 q-20,20 0,40 q20,20 0,40" stroke="#ff2e88" stroke-width="3" fill="none" opacity=".6"/>' +
          g(
            [
              [40, 220],
              [282, 230],
              [26, 400],
              [296, 420],
            ],
            5,
            "#c9ced6",
          ),
        t0: y("#c9ced6"),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 4},${e.ty + 30} L${e.tl + 30},380 M${e.tr - 4},${e.ty + 30} L${e.tr - 30},380" stroke="#ff2e88" stroke-width="7"/>`,
          P.horseshoe("#ff2e88"),
          L("#6b7480", "#ff2e88"),
        ),
        h: a0("#ff2e88", "#4a1d5c"),
        leg: m(U("#ff2e88"), M("#ff2e88", 0.64)),
      },
      zirhlibozkurt: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#c68863",
          hairStyle: "kel",
          pantsColor: "#14424a",
          shoeColor: "#0c2a30",
          shoeStyle: "bot",
          background: "#06222a",
        }),
        t0: y("#1a5a64"),
        t: i(N("#20b2aa", "#0c2a30"), P.wolf("#e8f6f4"), L("#0c2a30", "#e8f6f4"), ({ B: e }) => {
          let t = "";
          for (let a = e.tl - 6; a < e.tr + 6; a += 13) t += `<path d="M${a},${e.ty + 12} q6,-26 13,0" fill="#cfd8dc"/>`;
          return (
            `<path d="M${e.tl - 8},${e.ty + 14} Q160,${e.ty - 22} ${e.tr + 8},${e.ty + 14} Q160,${e.ty + 24} ${e.tl - 8},${e.ty + 14}Z" fill="#cfd8dc"/>` +
            t
          );
        }),
        h:
          '<path d="M96,176 Q92,104 122,96 L112,46 L148,90 Q160,88 172,90 L208,46 L198,96 Q228,104 224,176 Q222,214 196,226 L186,250 L134,250 L124,226 Q98,214 96,176Z" fill="#cfd8dc"/><path d="M116,92 L112,62 L136,90Z M204,92 L208,62 L184,90Z" fill="#20b2aa"/><path d="M136,182 L184,182 L176,240 L144,240Z" fill="#aab6bc"/><ellipse cx="160" cy="236" rx="12" ry="7" fill="#0c2a30"/><path d="M160,100 L160,182" stroke="#20b2aa" stroke-width="5"/>' +
          p(
            '<path d="M114,156 L150,166 L146,176 L118,170Z" fill="#0c2a30"/><path d="M120,164 L146,170" stroke="#7ff0e8" stroke-width="3"/>',
          ) +
          p(Q(134, 166, 18, 8, "#7ff0e8", 0.5)) +
          '<rect x="134" y="246" width="52" height="28" fill="#1a5a64"/>',
        leg: m(F("#20b2aa"), M("#0c2a30", 0.82)),
        cover: u,
      },
      isikhizi: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#c68863",
          hairStyle: "ponytail",
          hairColor: "#ffffff",
          eyelash: "long",
          mouthShape: "smile",
          lipColor: "#c9636b",
          eyeColor: "#c9922f",
          pantsColor: "#f2efe4",
          shoeColor: "#d4af37",
          shoeStyle: "bot",
          background: "#2a2006",
        }),
        b: i(T("#ffe27a", 0.35), g0("#fff8dc", "#e8c86a")),
        t0: y("#f6f3ea"),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 4},${e.ty + 14} L160,320 L${e.tr - 4},${e.ty + 14}" stroke="#d4af37" stroke-width="6" fill="none"/>`,
          P.sun("#d4af37"),
          L("#d4af37", "#fff"),
        ),
        h:
          '<path d="M114,122 Q160,100 206,122" stroke="#d4af37" stroke-width="5" fill="none"/>' +
          p('<path d="M114,122 L100,96 L124,116Z" fill="#d4af37"/>'),
        leg: M("#d4af37", 0.62),
      },
      kumfirtinasi: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#a86b3c",
          hairStyle: "kel",
          pantsColor: "#8a6a3a",
          shoeColor: "#5a4020",
          shoeStyle: "bot",
          background: "#3a2a10",
        }),
        b:
          '<path d="M20,520 Q80,440 40,360 Q120,430 80,520Z M300,500 Q250,430 290,350 Q210,420 250,500Z" fill="#d9b06a" opacity=".35"/>' +
          u0("#a8823e"),
        t0: y("#b8904a"),
        t: i(({ B: e }) => `<path d="M${e.tl},${e.ty + 30} L${e.tr},${e.ty + 70}" stroke="#5a4020" stroke-width="12"/>`, L("#5a4020")),
        h:
          '<path d="M96,166 Q92,90 160,86 Q228,90 224,166 Q200,150 160,148 Q120,150 96,166Z" fill="#d9b06a"/>' +
          x0("#d9b06a") +
          '<path d="M214,190 Q250,220 246,270 L234,268 Q236,226 212,206Z" fill="#c49a54"/>' +
          i0("#5a4020", "#ffb84a", 0),
        leg: m(J("#5a4020"), M("#5a4020", 0.7)),
        cover: u,
      },
      lalemuhafizi: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#c68863",
          hairStyle: "slick",
          hairColor: "#0d0a08",
          facialHair: "mustache",
          mouthShape: "smirk",
          pantsColor: "#6e0f26",
          shoeColor: "#d4af37",
          shoeStyle: "bot",
          background: "#2a0610",
        }),
        b: i(z("#8e1330", "#d4af37"), '<path d="M56,508 Q160,532 264,508" stroke="#d4af37" stroke-width="5" fill="none"/>'),
        t0: y("#8e1330"),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 4},${e.ty + 10} Q160,286 ${e.tr - 4},${e.ty + 10}" stroke="#d4af37" stroke-width="4" fill="none"/>`,
          Y("tulip", "#6e0f26", "#ffd23f"),
          L("#4a0a18"),
          R(),
        ),
        h: a0("#d4af37", "#3b2a1a"),
        leg: M("#d4af37", 0.62),
      },
      karakusak: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#f1c27d",
          hairStyle: "short",
          hairColor: "#0d0a08",
          eyebrowShape: "angled",
          mouthShape: "thin",
          pantsColor: "#f4f2ea",
          shoeColor: "#f1c27d",
          shoeStyle: "sandalet",
          background: "#2b1616",
        }),
        t0: k0("#f4f2ea", "#d8d4c6"),
        t: q0("#141414"),
      },
      kungfu: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#f1c27d",
          hairStyle: "bun",
          hairColor: "#0d0a08",
          eyeShape: "narrow",
          facialHair: "goatee",
          mouthShape: "neutral",
          pantsColor: "#141414",
          shoeColor: "#141414",
          shoeStyle: "klasik",
          background: "#2a0808",
        }),
        t0: y("#b8141e"),
        t: i(
          '<path d="M160,262 L160,380" stroke="#7a0a12" stroke-width="3"/>',
          ...[290, 312, 334, 356].map(
            (e) =>
              `<path d="M146,${e} L174,${e}" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/><circle cx="160" cy="${e}" r="3.5" fill="#d4af37"/>`,
          ),
          '<path d="M140,262 Q160,276 180,262 L176,256 Q160,268 144,256Z" fill="#7a0a12"/>',
        ),
        leg: M("#141414", 0.82, "#f2efe4"),
      },
      boksor: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#8d5524",
          hairStyle: "short",
          hairColor: "#0d0a08",
          facialHair: "short",
          eyebrowShape: "thick",
          mouthShape: "smirk",
          pantsColor: "#8d5524",
          shoeColor: "#f2efe4",
          shoeStyle: "spor",
          background: "#1a0b0b",
        }),
        t0: I("#8d5524"),
        t: i(
          $.gloves("#c81d3f"),
          ({ B: e }) =>
            `<rect x="${e.tl}" y="364" width="${e.tr - e.tl}" height="18" fill="#c81d3f"/><rect x="${e.tl}" y="364" width="${e.tr - e.tl}" height="6" fill="#f2efe4"/>`,
        ),
        leg: m(R0("#c81d3f", 0.4), (e, t) =>
          t > 100 ? `<rect x="${-e - 1}" y="${t * 0.8}" width="${e * 2 + 2}" height="${t * 0.2 + 2}" rx="5" fill="#f2efe4"/>` : "",
        ),
      },
      ejderyumruk: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#ffdbb0",
          hairStyle: "kel",
          hairColor: "#f4f4f4",
          eyebrowShape: "angled",
          eyeShape: "wide",
          eyeColor: "#c81d3f",
          mouthShape: "smirk",
          pantsColor: "#1a1a1a",
          shoeColor: "#c81d3f",
          shoeStyle: "bot",
          background: "#2a0606",
        }),
        b:
          T("#ff3b3b", 0.38) +
          '<path d="M40,560 Q20,420 70,300 Q60,430 100,560Z M280,560 Q300,420 250,300 Q260,430 220,560Z" fill="#ff3b3b" opacity=".25"/>',
        t0: k0("#1a1a1a", "#c81d3f"),
        t: q0("#c81d3f"),
        h: p1("#f4f4f4"),
        leg: M("#c81d3f", 0.76, "#1a1a1a"),
      },
      ninja: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#e0ac69",
          hairStyle: "kel",
          eyeShape: "narrow",
          eyebrowShape: "angled",
          pantsColor: "#141414",
          shoeColor: "#2a2a2a",
          shoeStyle: "klasik",
          background: "#0e0e14",
        }),
        b: '<g transform="translate(110,250) rotate(-40)"><rect x="-6" y="-60" width="12" height="160" rx="3" fill="#1f1f1f"/><rect x="-11" y="-64" width="22" height="7" rx="2" fill="#d4af37"/><rect x="-4" y="-104" width="8" height="42" rx="2" fill="#5a1a1a"/></g>',
        t0: y("#1b1b1f"),
        t: i(
          ({ B: e }) => `<path d="M${e.tl + 10},${e.ty} L${e.tr - 20},380" stroke="#2a2a30" stroke-width="10"/>`,
          w("#3a3a42", 340),
          `<g transform="translate(118,352)">${$.shuriken()}</g><g transform="translate(204,352)">${$.shuriken()}</g>`,
        ),
        h: $0("#1b1b1f") + H0("#8a1d1d"),
        leg: m(J("#3a3a42")),
        cover: u,
      },
      kunoichi: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#ffdbb0",
          hairStyle: "kel",
          hairColor: "#2b1e3a",
          eyeShape: "narrow",
          eyelash: "dramatic",
          eyeColor: "#6b3fa0",
          pantsColor: "#2a1a40",
          shoeColor: "#1a1026",
          shoeStyle: "klasik",
          background: "#160c24",
        }),
        hb: '<path d="M196,110 Q246,140 238,250 Q232,320 214,330 Q228,240 192,130Z" fill="#2b1e3a"/>',
        t0: y("#3a2258"),
        t: i(({ B: e }) => `<path d="M${e.tl + 10},${e.ty} L${e.tr - 20},380" stroke="#5a3a82" stroke-width="8"/>`, w("#b44cff", 342)),
        h: $0("#3a2258") + '<path d="M100,140 Q160,124 220,140" stroke="#b44cff" stroke-width="6" fill="none"/>',
        f: '<g transform="translate(262,330) rotate(30)"><path d="M-4,0 L0,-36 L4,0Z" fill="#cfd6de"/><rect x="-3" y="0" width="6" height="22" fill="#2a1a40"/><circle cy="26" r="5" fill="none" stroke="#b44cff" stroke-width="2"/></g>',
        leg: m(J("#b44cff")),
        cover: u,
      },
      samuray: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#f1c27d",
          hairStyle: "kel",
          hairColor: "#0d0a08",
          facialHair: "mustache",
          eyebrowShape: "angled",
          eyeShape: "narrow",
          mouthShape: "thin",
          pantsColor: "#1a1a1a",
          shoeColor: "#3a2f1d",
          shoeStyle: "sandalet",
          background: "#1f0808",
        }),
        t0: y("#7a1018"),
        t: i(y0("#9a1820", "#3a0508"), D("#5a0a10"), w("#1a1a1a", 350)),
        h: '<path d="M98,150 Q98,84 160,82 Q222,84 222,150Z" fill="#1a1a1a"/><path d="M98,140 L66,196 L100,190 L104,150Z M222,140 L254,196 L220,190 L216,150Z" fill="#7a1018" stroke="#1a1a1a" stroke-width="2"/><path d="M96,146 L224,146 L224,156 L96,156Z" fill="#7a1018"/><path d="M106,74 Q160,128 214,74 Q196,118 160,120 Q124,118 106,74Z" fill="#d4af37"/><circle cx="160" cy="120" r="7" fill="#d4af37"/>',
        f: $.katana(),
        leg: m(F("#7a1018")),
        cover: ["head"],
      },
      baspehlivan: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#c68863",
          hairStyle: "short",
          hairColor: "#1a1410",
          facialHair: "mustache",
          eyebrowShape: "thick",
          mouthShape: "smile",
          pantsColor: "#2b1a10",
          shoeColor: "#c68863",
          shoeStyle: "sandalet",
          background: "#2a1a06",
        }),
        t0: i(
          I("#c68863"),
          ({ B: e }) =>
            `<path d="M${e.tl + 20},${e.ty + 20} Q${e.tl + 30},300 ${e.tl + 24},340 M${e.tr - 30},${e.ty + 24} Q${e.tr - 24},300 ${e.tr - 32},330" stroke="#fff" stroke-width="5" opacity=".35" fill="none" stroke-linecap="round"/>`,
        ),
        t: ({ B: e }) =>
          `<rect x="${e.tl - 4}" y="346" width="${e.tr - e.tl + 8}" height="36" rx="6" fill="#d4af37" stroke="#8a6a10" stroke-width="3"/><circle cx="160" cy="364" r="15" fill="#f6dc6a" stroke="#8a6a10" stroke-width="2"/>${P.crescent("#8a6a10").replace(/305/g, "364").replace(/286/g, "352").replace(/324/g, "376")}`,
        leg: (e, t) =>
          `<rect x="${-e - 2}" y="0" width="${e * 2 + 4}" height="${t * 0.86}" rx="6" fill="#2b1a10"/><path d="M${-e},${t * 0.2} L${e},${t * 0.2} M${-e},${t * 0.5} L${e},${t * 0.5}" stroke="#d4af37" stroke-width="2" stroke-dasharray="4 3"/><rect x="${-e - 2}" y="${t * 0.86 - 8}" width="${e * 2 + 4}" height="8" fill="#8a5a2b"/>`,
      },
      sumo: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#f1c27d",
          hairStyle: "bun",
          hairColor: "#0d0a08",
          faceShape: "round",
          eyeShape: "narrow",
          mouthShape: "neutral",
          pantsColor: "#f1c27d",
          shoeColor: "#f1c27d",
          shoeStyle: "sandalet",
          background: "#2a1a1a",
        }),
        t0: I("#f1c27d"),
        t: ({ B: e }) =>
          `<rect x="${e.tl - 2}" y="350" width="${e.tr - e.tl + 4}" height="34" rx="4" fill="#1d2a4a"/><path d="M146,382 L174,382 L170,420 L150,420Z" fill="#1d2a4a"/>${[132, 148, 172, 188].map((t) => `<rect x="${t - 3}" y="384" width="6" height="34" fill="#f2efe4"/>`).join("")}`,
      },
      sokakdovuscusu: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#c68863",
          hairStyle: "short",
          hairColor: "#1a1410",
          facialHair: "short",
          eyebrowShape: "angled",
          faceAcc: "scar",
          mouthShape: "smirk",
          clothing: "hoodie",
          pantsColor: "#2b3550",
          shoeColor: "#e8e6df",
          shoeStyle: "spor",
          background: "#16161c",
        }),
        t0: i(
          y("#4a4d55"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 22} L${e.tl + 10},${e.ty + 34} L${e.tl},${e.ty + 46}Z M${e.tr},${e.ty + 22} L${e.tr - 10},${e.ty + 34} L${e.tr},${e.ty + 46}Z" fill="#16161c"/><path d="M120,262 Q160,286 200,262 L200,274 Q160,300 120,274 Z" fill="#3a3c42"/>`,
        ),
        t: i(
          '<ellipse cx="160" cy="276" rx="30" ry="8" fill="none" stroke="#c0c6cc" stroke-width="4"/><path d="M160,284 L160,300" stroke="#c0c6cc" stroke-width="4"/><rect x="152" y="298" width="16" height="12" rx="2" fill="#c0c6cc"/>',
        ),
        h: H0("#c81d3f"),
        leg: X("#16161c"),
      },
      lucha: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#a86b3c",
          hairStyle: "kel",
          mouthShape: "open",
          lipColor: "#5c2e2e",
          pantsColor: "#e01b84",
          shoeColor: "#ffd23f",
          shoeStyle: "bot",
          background: "#2a0626",
        }),
        b: u0("#ffd23f", "#e01b84"),
        t0: I("#a86b3c"),
        t: i(
          ({ B: e }) =>
            `<rect x="${e.tl}" y="356" width="${e.tr - e.tl}" height="26" fill="#e01b84"/><path d="M${e.tl},356 L${e.tr},356" stroke="#ffd23f" stroke-width="5"/>`,
          R("#ffd23f"),
        ),
        h:
          e0("#e01b84") +
          p(
            '<path d="M110,150 Q120,130 156,150 Q160,180 140,186 Q112,186 110,150Z" fill="#ffd23f"/><path d="M100,128 Q110,110 120,124 Q126,100 140,120" stroke="#2ad4ff" stroke-width="5" fill="none"/>',
          ) +
          M0() +
          '<path d="M140,200 Q160,192 180,200 Q182,224 160,226 Q138,224 140,200Z" fill="#ffd23f"/><ellipse cx="160" cy="212" rx="12" ry="8" fill="#3a1414"/><path d="M160,104 L160,140" stroke="#ffd23f" stroke-width="6"/>',
        leg: m(U("#ffd23f"), M("#ffd23f", 0.62, "#e01b84")),
        cover: u,
      },
      shaolin: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#e0ac69",
          hairStyle: "kel",
          eyeShape: "hooded",
          mouthShape: "neutral",
          pantsColor: "#e8892a",
          shoeColor: "#3a2f1d",
          shoeStyle: "sandalet",
          background: "#2a1806",
        }),
        t0: i(
          y("#f08a24"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 4} L${e.tr - 10},380 L${e.tr},380 L${e.tr},${e.ty + 70} L${e.tl + 30},${e.ty - 2}Z" fill="#c8641a"/>`,
          v("#f08a24", { y: 360, bottom: 470, w: 16 }),
        ),
        t: i(w("#c81d3f", 346), p0("#7a3a1a", 15)),
        h:
          p(
            g(
              [
                [148, 120],
                [136, 126],
              ],
              2.6,
              "#7a4a2a",
            ),
          ) + g([[160, 116]], 2.6, "#7a4a2a"),
        f: $.staff(
          "#8a5a2b",
          '<rect x="-7" y="-404" width="14" height="10" fill="#d4af37"/><rect x="-7" y="-10" width="14" height="10" fill="#d4af37"/>',
        ),
      },
      ruzgarkilici: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "kel",
          hairColor: "#eef2f6",
          eyeShape: "narrow",
          eyeColor: "#c81d3f",
          eyebrowShape: "thin",
          mouthShape: "thin",
          pantsColor: "#1a1a22",
          shoeColor: "#3a2f1d",
          shoeStyle: "sandalet",
          background: "#121822",
        }),
        hb: E("#eef2f6"),
        t0: i(
          G("#1a1a22", "#c81d3f", { bottom: 440, lapel: "#2a2a36" }),
          '<path d="M40,330 Q100,320 120,340 M200,300 Q260,280 290,300" stroke="#c9d1da" stroke-width="3" fill="none" opacity=".4"/>',
        ),
        t: w("#c81d3f", 346),
        h: O("#eef2f6") + '<path d="M150,98 Q160,60 186,52 Q172,80 172,100Z" fill="#eef2f6"/>',
        f: $.katana("#eef4fa", "#5a1a1a"),
      },
      ringkralicesi: {
        base: d({
          gender: S,
          build: "standart",
          skin: "#8d5524",
          hairStyle: "braids",
          hairColor: "#1a1410",
          eyelash: "natural",
          eyebrowShape: "arched",
          mouthShape: "smirk",
          lipColor: "#7a3048",
          pantsColor: "#8d5524",
          shoeColor: "#111111",
          shoeStyle: "bot",
          background: "#1d1406",
        }),
        t0: i(
          y("#8d5524", { shade: !1 }),
          ({ B: e }) =>
            `<path d="M${e.tl + 18},${e.ty} L${e.tr - 18},${e.ty} L${e.tr - 14},328 Q160,340 ${e.tl + 14},328Z" fill="#111"/><path d="M${e.tl + 18},${e.ty} L${e.tr - 18},${e.ty}" stroke="#d4af37" stroke-width="4"/>`,
        ),
        t: i(
          $.gloves("#d4af37"),
          ({ B: e }) =>
            `<rect x="${e.tl - 4}" y="344" width="${e.tr - e.tl + 8}" height="38" rx="6" fill="#d4af37" stroke="#8a6a10" stroke-width="3"/>${A(160, 363, 13, "#8a6a10")}`,
        ),
        leg: R0("#111", 0.34, "#d4af37"),
      },
      atesperisi: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#e0ac69",
          hairStyle: "kel",
          hairColor: "#3a0f0a",
          eyelash: "long",
          eyeColor: "#c9922f",
          mouthShape: "smile",
          lipColor: "#c81d3f",
          pantsColor: "#e0ac69",
          shoeColor: "#d4af37",
          shoeStyle: "sandalet",
          background: "#2a0a04",
        }),
        b: i(t0("#ff7a2a", "#ffcf5a"), T("#ff6a1a", 0.2)),
        hb:
          E("#3a0f0a") +
          '<path d="M104,240 Q100,300 112,346 M216,240 Q222,300 210,346" stroke="#c81d3f" stroke-width="7" fill="none" opacity=".7"/>',
        t0: i(y("#c8321a"), v("#e0561e", { y: 340, bottom: 440 })),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 30},${e.ty} Q160,300 ${e.tr - 30},${e.ty}" stroke="#ffcf5a" stroke-width="4" fill="none"/><path d="M${e.tl + 20},440 L${e.tl + 40},420 L${e.tl + 60},446 L${e.tl + 84},418 L${e.tl + 106},446 L${e.tl + 130},420 L${e.tl + 150},446" stroke="#ffcf5a" stroke-width="3" fill="none"/>`,
          w("#ffcf5a", 336),
        ),
        h: O("#3a0f0a") + b0("#ffcf5a", "#ff3b1a", -14),
        f: $.wand("#7a1a0a", "#ffcf5a") + '<path d="M270,262 Q260,240 276,226 Q274,244 286,250 Q290,266 270,262Z" fill="#ff7a2a"/>',
      },
      superisi: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "kel",
          eyelash: "long",
          eyeColor: "#3a5f7d",
          mouthShape: "smile",
          lipColor: "#d48a8a",
          pantsColor: "#ffe0c2",
          shoeColor: "#2ad4c6",
          shoeStyle: "sandalet",
          background: "#042a30",
        }),
        b: i(
          t0("#5ae3ff", "#e8fbff"),
          g(
            [
              [40, 300],
              [280, 260],
              [270, 470],
              [50, 480],
              [300, 380],
            ],
            7,
            "#bff3ff",
            0.55,
          ),
        ),
        hb: E("#1aa7a0"),
        t0: i(y("#0f8f9a"), v("#18b4b4", { y: 340, bottom: 440 })),
        t: i(P.wave("#e8fbff"), w("#e8fbff", 336)),
        h:
          O("#1aa7a0") +
          p('<path d="M114,130 Q106,112 118,104 Q128,118 122,132Z" fill="#e8fbff"/>') +
          '<circle cx="160" cy="112" r="7" fill="#bff3ff" stroke="#fff" stroke-width="2"/>',
        f: $.orb("#3ab8ff", "#e8fbff"),
      },
      ormanperisi: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#c68863",
          hairStyle: "kel",
          eyelash: "long",
          eyeColor: "#3f5f3f",
          mouthShape: "smile",
          lipColor: "#b06a4a",
          faceAcc: "freckles",
          pantsColor: "#c68863",
          shoeColor: "#3a5a2a",
          shoeStyle: "sandalet",
          background: "#0c2412",
        }),
        b: t0("#8fd36a", "#e8ffd0"),
        hb: E("#6b3a1a"),
        t0: i(
          y("#2f7a3a"),
          ({ B: e }) =>
            `<path d="M${e.tl + 4},340 Q${e.tl - 30},420 ${e.tl - 10},450 Q${e.tl + 20},420 ${e.tl + 40},450 Q${e.tl + 60},410 ${e.tl + 80},452 Q100,420 130,452 Q150,412 170,452 Q190,420 210,452 Q${e.tr - 30},410 ${e.tr - 4},452 Q${e.tr + 24},420 ${e.tr + 10},446 Q${e.tr + 10},400 ${e.tr - 4},340Z" fill="#3a9a46"/>`,
        ),
        t: '<path d="M120,276 Q140,330 160,300 Q180,330 200,276" stroke="#8fd36a" stroke-width="4" fill="none"/>',
        h:
          O("#6b3a1a") +
          [118, 136, 160, 184, 202]
            .map(
              (e, t) =>
                `<circle cx="${e}" cy="${118 - (t === 2 ? 10 : t % 2 ? 6 : 0)}" r="8" fill="${["#ff9ad5", "#ffd23f", "#ff6a8a", "#ffd23f", "#ff9ad5"][t]}"/><circle cx="${e}" cy="${118 - (t === 2 ? 10 : t % 2 ? 6 : 0)}" r="3" fill="#fff6c8"/>`,
            )
            .join(""),
        f: $.wand("#5a3a1a", "#8fd36a"),
      },
      ayperisi: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "kel",
          eyelash: "dramatic",
          eyeColor: "#6b3fa0",
          mouthShape: "neutral",
          lipColor: "#c9636b",
          pantsColor: "#ffe0c2",
          shoeColor: "#c9b8f0",
          shoeStyle: "sandalet",
          background: "#120c2a",
        }),
        b: i(
          t0("#c9b8f0", "#f4f0ff", 0.7),
          g(
            [
              [30, 220],
              [290, 240],
              [24, 400],
              [300, 420],
            ],
            3,
            "#fff",
          ),
        ),
        hb: E("#d8dce8"),
        t0: i(y("#5b4a9a"), v("#7a68c0", { y: 340, bottom: 450 })),
        t: i(P.crescent("#f4f0ff"), w("#c9b8f0", 336)),
        h: O("#d8dce8") + '<path d="M170,96 A18,18 0 1,0 170,128 A13,13 0 1,1 170,96Z" fill="#f4f0ff"/>',
        f: $.wand("#c9b8f0", "#f4f0ff"),
      },
      safakperisi: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#6b4226",
          hairStyle: "kel",
          eyelash: "long",
          eyeColor: "#c9922f",
          mouthShape: "smile",
          lipColor: "#e8998a",
          pantsColor: "#6b4226",
          shoeColor: "#ffb8a0",
          shoeStyle: "sandalet",
          background: "#2a1020",
        }),
        b: i(t0("#ffb3c8", "#ffe27a"), T("#ffb3c8", 0.2)),
        hb: E("#f6e2b8"),
        t0: i(y("#f28aa0"), v("#ffb8a0", { y: 340, bottom: 446 })),
        t: i(P.sun("#ffe27a"), w("#ffe27a", 336)),
        h: O("#f6e2b8") + p('<circle cx="128" cy="118" r="6" fill="#ffe27a"/>') + A(160, 104, 9, "#ffe27a"),
        f: $.wand("#ffb8a0", "#ffe27a"),
      },
      kristalprenses: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "kel",
          eyelash: "dramatic",
          eyeColor: "#3a5f7d",
          mouthShape: "smile",
          lipColor: "#c9636b",
          pantsColor: "#ffe0c2",
          shoeColor: "#bfe6ff",
          shoeStyle: "sandalet",
          background: "#08203a",
        }),
        b: i(
          T("#bfe6ff", 0.32),
          p(
            '<path d="M146,292 L60,170 L84,240 L20,226 L70,286 L10,320 L84,322 L60,380 L148,312Z" fill="#dff4ff" opacity=".8" stroke="#7fb8dc" stroke-width="2.5" stroke-linejoin="round"/><path d="M146,296 L60,170 M146,304 L20,226 M146,310 L10,320" stroke="#7fb8dc" stroke-width="1.5" opacity=".6"/>',
          ),
        ),
        hb: E("#f4f8ff"),
        t0: i(y("#8fc8f0"), v("#bfe6ff", { y: 336, bottom: 470, w: 44 })),
        t: i(
          P.diamond("#ffffff"),
          '<path d="M100,470 L120,446 L140,470 L160,446 L180,470 L200,446 L220,470" stroke="#fff" stroke-width="3" fill="none"/>',
        ),
        h:
          O("#f4f8ff") +
          '<path d="M118,122 L124,92 L136,112 L148,80 L160,104 L172,80 L184,112 L196,92 L202,122Z" fill="#dff4ff" stroke="#7fb8dc" stroke-width="2"/><path d="M160,104 L148,80 M160,104 L172,80" stroke="#fff" stroke-width="2"/>',
        f: $.wand("#bfe6ff", "#ffffff"),
      },
      yildizbuyucusu: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#ffdbb0",
          hairStyle: "long",
          hairColor: "#eef0f4",
          facialHair: "full",
          eyebrowShape: "thick",
          mouthShape: "neutral",
          pantsColor: "#1d2a6b",
          shoeColor: "#3a2f1d",
          shoeStyle: "klasik",
          background: "#0a1030",
        }),
        t0: i(
          y("#1d2a6b"),
          v("#1d2a6b", { y: 350, bottom: 520, w: 30 }),
          g(
            [
              [110, 300],
              [200, 330],
              [130, 420],
              [214, 470],
              [96, 480],
              [170, 380],
            ],
            3,
            "#ffd23f",
          ),
        ),
        t: i(
          '<path d="M150,236 Q160,330 170,236 Q176,300 160,346 Q144,300 150,236Z" fill="#eef0f4"/>',
          w("#d4af37", 360),
          A(120, 330, 8, "#ffd23f"),
          A(206, 420, 9, "#ffd23f"),
        ),
        h: `<ellipse cx="160" cy="118" rx="78" ry="14" fill="#1d2a6b"/><path d="M106,118 Q140,70 150,20 Q160,-10 196,6 Q170,10 170,40 Q176,80 214,118Z" fill="#1d2a6b"/>${A(150, 70, 9, "#ffd23f")}${A(176, 98, 6, "#ffd23f")}${g(
          [
            [140, 98],
            [162, 44],
          ],
          2.5,
          "#fff",
        )}<path d="M86,118 Q160,132 234,118" stroke="#d4af37" stroke-width="4" fill="none"/>`,
        f: $.staff("#6b3f1f", `<circle cy="-414" r="18" fill="#bfe6ff" opacity=".6"/>${A(0, -414, 14, "#ffd23f")}`),
        cover: ["head"],
      },
      karabuyucu: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#d8d0e0",
          hairStyle: "kel",
          pantsColor: "#120a1c",
          shoeColor: "#120a1c",
          shoeStyle: "klasik",
          background: "#0c0614",
        }),
        b: i(T("#9b30ff", 0.3), z("#1a0f28", "#4a1a6b")),
        t0: i(y("#1a0f28"), v("#1a0f28", { y: 350, bottom: 530, w: 26 })),
        t: i(
          '<path d="M150,262 L150,520 M170,262 L170,520" stroke="#9b30ff" stroke-width="3"/>',
          '<circle cx="160" cy="300" r="12" fill="none" stroke="#9b30ff" stroke-width="3"/><path d="M160,288 L160,312 M148,300 L172,300" stroke="#9b30ff" stroke-width="2"/>',
        ),
        hb: r0("#1a0f28"),
        h: l0("#1a0f28") + O0() + V("slit", "#e6b8ff", "#000", "#9b30ff"),
        f: $.staff(
          "#2a1a10",
          `<path d="M-16,-410 Q-16,-438 0,-440 Q16,-438 16,-410 Q16,-394 6,-392 L6,-384 L-6,-384 L-6,-392 Q-16,-394 -16,-410Z" fill="#e8e0d0"/><circle cx="-6" cy="-414" r="4" fill="#9b30ff"/><circle cx="6" cy="-414" r="4" fill="#9b30ff"/>${Q(0, -414, 40, 40, "#9b30ff", 0.5)}`,
        ),
        cover: u,
      },
      kelebekkralice: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#f1c27d",
          hairStyle: "kel",
          eyelash: "dramatic",
          eyeColor: "#c9922f",
          mouthShape: "smirk",
          lipColor: "#7a3048",
          pantsColor: "#f1c27d",
          shoeColor: "#111111",
          shoeStyle: "sandalet",
          background: "#2a1404",
        }),
        b: p(
          `<path d="M148,288 C110,170 10,150 6,236 C4,286 80,306 148,302Z" fill="#ff8a1a" stroke="#111" stroke-width="5"/><path d="M148,310 C90,316 30,370 52,420 C76,460 134,390 150,318Z" fill="#ff8a1a" stroke="#111" stroke-width="5"/><path d="M146,292 C110,230 60,200 30,214 M146,298 C100,270 50,260 14,262 M148,316 C110,340 80,370 62,410" stroke="#111" stroke-width="4" fill="none"/>${g(
            [
              [22, 228],
              [14, 254],
              [40, 196],
              [60, 420],
              [44, 398],
            ],
            4.5,
            "#fff",
          )}`,
        ),
        hb: E("#111"),
        t0: i(y("#111"), v("#ff8a1a", { y: 340, bottom: 444 })),
        t: i('<path d="M120,262 L160,320 L200,262" stroke="#ff8a1a" stroke-width="6" fill="none"/>', w("#111", 336)),
        h:
          O("#111") +
          p(
            '<path d="M146,106 Q130,60 110,52" stroke="#111" stroke-width="3" fill="none"/><circle cx="110" cy="52" r="5" fill="#ff8a1a"/>',
          ),
      },
      elfokcu: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "kel",
          eyelash: "natural",
          eyeColor: "#3f5f3f",
          eyebrowShape: "arched",
          mouthShape: "neutral",
          lipColor: "#b06a4a",
          pantsColor: "#3a2f1d",
          shoeColor: "#5a3a1a",
          shoeStyle: "bot",
          background: "#0e2010",
        }),
        b: i(z("#1d5c2a", "#0e3a18"), F0),
        hb: E("#c43a1a"),
        t0: i(
          y("#2f6b2a"),
          ({ B: e }) => `<path d="M${e.tl + 4},350 L${e.tr - 4},350 L${e.tr + 6},400 L${e.tl - 6},400Z" fill="#2f6b2a"/>`,
        ),
        t: i(L("#5a3a1a", "#c9a066", 348), '<path d="M114,262 L206,350" stroke="#5a3a1a" stroke-width="7"/>'),
        h:
          b1("#ffe0c2") +
          O("#c43a1a") +
          '<path d="M110,124 Q160,108 210,124" stroke="#8fd36a" stroke-width="4" fill="none"/>' +
          p('<path d="M124,118 q-6,-10 4,-14 q4,8 -4,14Z" fill="#8fd36a"/>'),
        f: $.bow(),
        leg: M("#5a3a1a", 0.56),
      },
      yesilgezgin: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#7bd36a",
          hairStyle: "kel",
          faceShape: "heart",
          noseShape: "flat",
          mouthShape: "thin",
          lipColor: "#3f8a3a",
          pantsColor: "#b8c0c8",
          shoeColor: "#8a929a",
          shoeStyle: "bot",
          background: "#08200e",
        }),
        t0: y("#c9d0d8"),
        t: i(
          '<path d="M160,262 L160,380" stroke="#8a929a" stroke-width="3"/>',
          Y("orbit", "#2a3a2a", "#7bd36a", 20),
          L("#8a929a", "#7bd36a"),
        ),
        h:
          '<ellipse cx="160" cy="140" rx="70" ry="54" fill="#7bd36a"/>' +
          p(
            '<ellipse cx="134" cy="172" rx="21" ry="13" transform="rotate(28 134 172)" fill="#0a0a0a"/><ellipse cx="128" cy="166" rx="6" ry="3.5" fill="#fff" opacity=".7"/>',
          ) +
          p(
            '<path d="M136,92 Q128,60 112,50" stroke="#5aa84a" stroke-width="4" fill="none"/><circle cx="112" cy="48" r="7" fill="#ffd23f"/>',
          ),
        leg: M("#8a929a", 0.7),
        cover: u,
      },
      kristaluzayli: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#9fd8ff",
          hairStyle: "kel",
          pantsColor: "#e8eef4",
          shoeColor: "#7fb8dc",
          shoeStyle: "bot",
          background: "#061a30",
        }),
        b: T("#5ab8ff", 0.3),
        t0: y("#eef3f8"),
        t: i(
          ({ B: e }) => `<path d="M${e.tl + 30},${e.ty} L160,330 L${e.tr - 30},${e.ty}" stroke="#7fb8dc" stroke-width="5" fill="none"/>`,
          P.diamond("#5ab8ff"),
          L("#7fb8dc", "#dff4ff"),
        ),
        h:
          '<path d="M160,70 L218,120 L226,190 L190,240 L130,240 L94,190 L102,120Z" fill="#7fc8ff" opacity=".92"/><path d="M160,70 L160,240 M102,120 L160,160 L218,120 M94,190 L160,160 L226,190 M130,240 L160,160 L190,240" stroke="#dff4ff" stroke-width="2" opacity=".8"/><path d="M160,70 L102,120 L94,190 L160,160Z" fill="#fff" opacity=".22"/><rect x="138" y="232" width="44" height="42" fill="#7fc8ff"/>' +
          p(Q(140, 170, 16, 10, "#fff", 0.8)),
        leg: m(I0("#7fb8dc")),
        cover: u,
      },
      tentakul: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#8a5ac8",
          hairStyle: "kel",
          noseShape: "flat",
          mouthShape: "thin",
          lipColor: "#5a2a8a",
          pantsColor: "#2a1a40",
          shoeColor: "#1a1026",
          shoeStyle: "klasik",
          background: "#16082a",
        }),
        t0: G("#2a1a40", "#5a3a82", { bottom: 410 }),
        t: E0("#c8f04a"),
        h:
          '<circle cx="160" cy="160" r="26" fill="#f4f1e8"/><circle cx="160" cy="160" r="15" fill="#c8f04a"/><circle cx="160" cy="160" r="8" fill="#111"/><circle cx="154" cy="154" r="4" fill="#fff"/><ellipse cx="160" cy="166" rx="62" ry="10" fill="none"/>' +
          p('<path d="M124,140 Q110,124 130,118 Q140,124 132,132" fill="#8a5ac8"/>') +
          [120, 136, 152, 168, 184, 200]
            .map(
              (e, t) =>
                `<path d="M${e},204 Q${e + (t % 2 ? 10 : -10)},240 ${e + (t % 2 ? -4 : 4)},${262 + (t % 3) * 8}" stroke="#7046ae" stroke-width="10" fill="none" stroke-linecap="round"/>`,
            )
            .join("") +
          '<path d="M118,144 Q140,136 146,148 M174,148 Q180,136 202,144" stroke="#5a2a8a" stroke-width="4" fill="none"/>',
        cover: ["face"],
      },
      lavagolemi: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#2a2224",
          hairStyle: "kel",
          pantsColor: "#2a2224",
          shoeColor: "#1a1416",
          shoeStyle: "bot",
          background: "#1a0602",
        }),
        b: T("#ff5a1a", 0.35),
        t0: i(
          y("#2a2224"),
          ({ B: e }) =>
            `<path d="M${e.tl + 20},${e.ty + 20} L130,300 L150,290 L160,330 L190,320 L${e.tr - 30},${e.ty + 30} M120,340 L140,372 L176,350 L200,376" stroke="#ff7a1a" stroke-width="5" fill="none" stroke-linejoin="round"/><path d="M${e.tl + 20},${e.ty + 20} L130,300 L150,290 L160,330 L190,320" stroke="#ffe27a" stroke-width="2" fill="none"/>`,
        ),
        h:
          '<path d="M100,170 Q96,104 160,100 Q224,104 220,170 Q222,236 160,242 Q98,236 100,170Z" fill="#2a2224"/><path d="M120,116 L140,140 L132,170 M200,120 L186,144 L194,180 M150,210 L170,220 L190,206" stroke="#ff7a1a" stroke-width="4" fill="none"/>' +
          V("slit", "#ffe27a", "#000", "#ff5a1a") +
          '<path d="M132,204 Q160,218 188,204 L184,212 Q160,226 136,212Z" fill="#ff7a1a"/><rect x="134" y="230" width="52" height="44" fill="#2a2224"/>',
        leg: (e, t) =>
          `<path d="M${-e + 4},${t * 0.2} L${e - 6},${t * 0.4} L${-e + 6},${t * 0.7}" stroke="#ff7a1a" stroke-width="4" fill="none"/>`,
        cover: u,
      },
      tenekerobot: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#b8c0c8",
          hairStyle: "kel",
          pantsColor: "#8e98a2",
          shoeColor: "#5a646e",
          shoeStyle: "bot",
          background: "#14202a",
        }),
        t0: ({ B: e }) =>
          `<rect x="${e.tl + 4}" y="${e.ty - 2}" width="${e.tr - e.tl - 8}" height="${384 - e.ty}" rx="10" fill="#aab4be"/><rect x="${e.tr - 30}" y="${e.ty}" width="26" height="${380 - e.ty}" fill="#000" opacity=".12"/>${g(
            [
              [e.tl + 16, e.ty + 12],
              [e.tr - 16, e.ty + 12],
              [e.tl + 16, 368],
              [e.tr - 16, 368],
            ],
            4,
            "#6e7882",
          )}`,
        t: `<rect x="122" y="284" width="76" height="56" rx="6" fill="#2a3440"/><circle cx="142" cy="304" r="10" fill="#ffd23f"/><path d="M142,304 L148,296" stroke="#2a3440" stroke-width="2.5"/><rect x="160" y="296" width="30" height="6" rx="2" fill="#ff4a4a"/><rect x="160" y="308" width="22" height="6" rx="2" fill="#4ade80"/>${g(
          [
            [134, 328],
            [148, 328],
            [162, 328],
            [176, 328],
          ],
          3.5,
          "#22d3ee",
        )}`,
        h: `<rect x="104" y="104" width="112" height="128" rx="14" fill="#c9d1da"/><rect x="104" y="104" width="40" height="128" rx="14" fill="#fff" opacity=".18"/><rect x="118" y="148" width="84" height="36" rx="8" fill="#1a2430"/>${p('<circle cx="140" cy="166" r="9" fill="#ffd23f"/><circle cx="140" cy="166" r="4" fill="#fff"/>')}<rect x="132" y="198" width="56" height="16" rx="3" fill="#1a2430"/><path d="M140,198 v16 M150,198 v16 M160,198 v16 M170,198 v16 M180,198 v16" stroke="#6e7882" stroke-width="2"/><rect x="156" y="70" width="8" height="34" fill="#8e98a2"/><circle cx="160" cy="66" r="8" fill="#ff4a4a"/>${p('<rect x="90" y="150" width="16" height="34" rx="4" fill="#8e98a2"/>')}${g(
          [
            [114, 114],
            [206, 114],
            [114, 222],
            [206, 222],
          ],
          3,
          "#6e7882",
        )}<rect x="140" y="232" width="40" height="42" fill="#8e98a2"/><path d="M140,242 h40 M140,254 h40" stroke="#6e7882" stroke-width="3"/>`,
        leg: (e, t) =>
          `<rect x="${-e - 2}" y="0" width="${e * 2 + 4}" height="${t}" fill="#8e98a2"/><path d="M${-e},${t * 0.3} h${e * 2} M${-e},${t * 0.5} h${e * 2}" stroke="#6e7882" stroke-width="3"/>`,
        cover: u,
      },
      androidx: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#f4f6f8",
          hairStyle: "kel",
          eyelash: "natural",
          eyeColor: "#22a8ee",
          eyeShape: "wide",
          mouthShape: "neutral",
          lipColor: "#9aa8b8",
          noseShape: "button",
          pantsColor: "#eef2f6",
          shoeColor: "#2a3440",
          shoeStyle: "bot",
          background: "#08182a",
        }),
        t0: y("#eef2f6"),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 12},${e.ty + 20} L${e.tl + 30},360 M${e.tr - 12},${e.ty + 20} L${e.tr - 30},360 M120,262 L160,300 L200,262" stroke="#22a8ee" stroke-width="3" fill="none"/>`,
          `<circle cx="160" cy="306" r="9" fill="#22a8ee"/>${Q(160, 306, 22, 22, "#22a8ee", 0.6)}`,
          '<rect x="140" y="256" width="40" height="10" rx="5" fill="#2a3440"/>',
        ),
        hb: '<path d="M98,170 Q96,98 160,96 Q224,98 222,170 L226,250 L206,250 L208,170Z" fill="#2a3440"/>',
        h:
          '<path d="M98,170 Q96,96 160,94 Q224,96 222,170 Q212,126 160,122 Q108,126 98,170Z" fill="#2a3440"/><path d="M104,150 Q104,130 120,126" stroke="#22a8ee" stroke-width="3" fill="none"/>' +
          p(
            '<path d="M108,176 L124,196 L124,214" stroke="#22a8ee" stroke-width="2" fill="none" opacity=".8"/><circle cx="124" cy="216" r="2.5" fill="#22a8ee"/>',
          ) +
          '<path d="M140,222 L180,222" stroke="#c9d1da" stroke-width="2"/>',
        leg: m(U("#22a8ee"), M("#2a3440", 0.72)),
      },
      astronot: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#f1c27d",
          hairStyle: "short",
          hairColor: "#5c3a21",
          mouthShape: "smile",
          pantsColor: "#eef0f2",
          shoeColor: "#c9ced6",
          shoeStyle: "bot",
          background: "#050a1a",
        }),
        b: '<rect x="80" y="266" width="160" height="110" rx="16" fill="#c9ced6"/><rect x="90" y="276" width="20" height="90" rx="6" fill="#aab2ba"/>',
        t0: y("#eef0f2"),
        t: `<rect x="128" y="290" width="64" height="44" rx="6" fill="#c9ced6"/>${g(
          [
            [142, 304],
            [160, 304],
            [178, 304],
          ],
          4,
          "#ff4a4a",
        )}<rect x="138" y="316" width="44" height="8" rx="2" fill="#2a6bff"/><circle cx="216" cy="290" r="10" fill="#ff8a1f"/><rect x="70" y="340" width="180" height="10" fill="#c9ced6"/>`,
        h: '<rect x="120" y="232" width="80" height="34" rx="10" fill="#c9ced6"/><circle cx="160" cy="166" r="84" fill="#bfe6ff" opacity=".25" stroke="#eef0f2" stroke-width="8"/><path d="M104,118 Q130,90 170,88" stroke="#fff" stroke-width="8" opacity=".6" fill="none" stroke-linecap="round"/><path d="M90,206 Q160,266 230,206" stroke="#c9ced6" stroke-width="12" fill="none"/>',
        leg: m(X("#c9ced6"), M("#c9ced6", 0.72)),
        cover: u,
      },
      galaksikorsani: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#4a8ad8",
          hairStyle: "mohawk",
          hairColor: "#ff2e88",
          faceAcc: "eyepatch",
          mouthShape: "smirk",
          lipColor: "#1d3d6b",
          facialHair: "goatee",
          earring: "cift",
          pantsColor: "#1a1a2a",
          shoeColor: "#3a2f1d",
          shoeStyle: "bot",
          background: "#0a0a24",
        }),
        b: z("#3a1a4a", "#ff2e88"),
        t0: G("#2a1a3a", "#1a1a2a", { bottom: 430, lapel: "#ff2e88" }),
        t: i(
          L("#3a2f1d", "#d4af37", 356),
          '<path d="M100,270 L220,350" stroke="#3a2f1d" stroke-width="10"/>' +
            g(
              [
                [118, 282],
                [142, 298],
                [166, 314],
                [190, 330],
              ],
              3.6,
              "#22d3ee",
            ),
        ),
        f: `<g transform="translate(234,318) rotate(-8)"><rect x="0" y="0" width="44" height="14" rx="4" fill="#3b4048"/><rect x="40" y="3" width="14" height="8" fill="#22d3ee"/><rect x="6" y="12" width="12" height="20" rx="3" fill="#2b2f36"/>${Q(58, 7, 12, 8, "#22d3ee", 0.8)}</g>`,
        leg: M("#3a2f1d", 0.56, "#d4af37"),
      },
      mechpilot: {
        base: d({
          gender: S,
          build: "standart",
          skin: "#c68863",
          hairStyle: "kel",
          eyelash: "natural",
          mouthShape: "smirk",
          lipColor: "#a85a52",
          pantsColor: "#e8761a",
          shoeColor: "#2a2a2a",
          shoeStyle: "bot",
          background: "#1a1206",
        }),
        t0: y("#f08a24"),
        t: i(
          '<path d="M160,262 L160,380" stroke="#2a2a2a" stroke-width="3"/><rect x="104" y="290" width="34" height="22" rx="3" fill="#2a2a2a"/><rect x="108" y="294" width="26" height="6" fill="#ffd23f"/><rect x="184" y="292" width="30" height="20" rx="4" fill="#fff"/><path d="M190,302 h18" stroke="#2a6bff" stroke-width="4"/>',
          L("#2a2a2a", "#c9ced6"),
        ),
        hb: '<path d="M196,150 Q236,190 226,270 L208,270 Q216,200 190,160Z" fill="#1a1410"/>',
        h:
          '<path d="M96,170 Q92,92 160,88 Q228,92 224,170 L208,170 Q206,120 160,118 Q114,120 112,170Z" fill="#f2efe4"/><path d="M110,110 Q160,70 210,110 L204,130 Q160,104 116,130Z" fill="#2a2a2a" opacity=".85"/><path d="M120,108 Q140,96 160,94" stroke="#fff" stroke-width="3" opacity=".5" fill="none"/>' +
          p('<rect x="88" y="158" width="20" height="34" rx="6" fill="#2a2a2a"/>') +
          '<path d="M216,188 Q206,214 180,216" stroke="#2a2a2a" stroke-width="3" fill="none"/><circle cx="178" cy="216" r="4" fill="#2a2a2a"/>',
        leg: m(X("#2a2a2a"), M("#2a2a2a", 0.68)),
        cover: ["head"],
      },
      superteyze: {
        base: d({
          gender: S,
          build: "standart",
          skin: "#ffdbb0",
          hairStyle: "bun",
          hairColor: "#c9c9cf",
          faceShape: "round",
          eyeShape: "round",
          mouthShape: "smile",
          lipColor: "#c9636b",
          pantsColor: "#5a4a7a",
          shoeColor: "#ff7aa8",
          shoeStyle: "klasik",
          background: "#2a0a1a",
        }),
        b: z("#e0115f", "#ffb3c8"),
        t0: i(
          y("#ff9ac0"),
          ({ B: e }) =>
            `<path d="M144,${e.ty - 2} L150,380 L170,380 L176,${e.ty - 2}Z" fill="#f2efe4"/>${g(
              [
                [136, 300],
                [136, 330],
                [136, 360],
              ],
              4,
              "#fff",
            )}`,
          v("#5a4a7a", { y: 350, bottom: 450, w: 16 }),
        ),
        t: i(p0("#f8f4ea", 15), R("#ffd23f"), Y("star", "#e0115f", "#ffd23f", 18)),
        h:
          p('<rect x="114" y="104" width="16" height="10" rx="5" fill="#ff7aa8" transform="rotate(-30 122 109)"/>') +
          '<rect x="152" y="94" width="16" height="10" rx="5" fill="#7ad8ff"/>' +
          p('<circle cx="138" cy="169" r="15" fill="#fff" opacity=".18" stroke="#c9a040" stroke-width="3"/>') +
          '<path d="M153,168 L167,168" stroke="#c9a040" stroke-width="3"/>' +
          p('<circle cx="124" cy="196" r="8" fill="#ff7aa8" opacity=".35"/>'),
        f: $.rollingPin(),
      },
      kurnaztilki: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "kel",
          pantsColor: "#3a2f1d",
          shoeColor: "#1a1410",
          shoeStyle: "klasik",
          background: "#2a1404",
        }),
        b: M1("#e8782a", "#fff6ea"),
        t0: i(
          y("#f2efe4"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 20} Q${e.tl},${e.ty - 2} ${e.tl + 24},${e.ty - 2} L146,${e.ty - 2} L150,380 L${e.tl},380Z M${e.tr},${e.ty + 20} Q${e.tr},${e.ty - 2} ${e.tr - 24},${e.ty - 2} L174,${e.ty - 2} L170,380 L${e.tr},380Z" fill="#2f6b3a"/>${g(
              [
                [140, 300],
                [140, 330],
                [140, 360],
              ],
              4,
              "#d4af37",
            )}`,
        ),
        t: '<path d="M150,262 L160,276 L170,262 L166,300 L160,306 L154,300Z" fill="#c81d3f"/>',
        h:
          '<path d="M96,176 Q94,118 124,104 L106,46 L150,96 Q160,94 170,96 L214,46 L196,104 Q226,118 224,176 Q220,214 184,228 Q170,246 160,248 Q150,246 136,228 Q100,214 96,176Z" fill="#e8782a"/><path d="M116,96 L110,62 L138,94Z M204,96 L210,62 L182,94Z" fill="#3a2418"/><path d="M98,180 Q120,236 160,248 Q200,236 222,180 Q196,206 176,198 Q160,210 144,198 Q124,206 98,180Z" fill="#fff6ea"/><ellipse cx="160" cy="214" rx="9" ry="6" fill="#1a1410"/><path d="M160,220 Q160,230 150,232 M160,220 Q160,230 170,232" stroke="#1a1410" stroke-width="2.5" fill="none"/>' +
          p(
            '<path d="M120,160 Q136,150 150,162 Q136,172 120,160Z" fill="#fff"/><circle cx="138" cy="162" r="5" fill="#2a8a3a"/><circle cx="138" cy="162" r="2.2" fill="#111"/><path d="M118,150 L150,156" stroke="#3a2418" stroke-width="4" stroke-linecap="round"/>',
          ) +
          '<rect x="138" y="234" width="44" height="40" fill="#e8782a"/>',
        cover: u,
      },
      uykucupanda: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#ffe0c2",
          hairStyle: "kel",
          eyeShape: "hooded",
          mouthShape: "open",
          lipColor: "#d48a8a",
          faceShape: "round",
          pantsColor: "#f7f7f5",
          shoeColor: "#15151a",
          shoeStyle: "klasik",
          background: "#1a1a24",
        }),
        t0: i(
          y("#f7f7f5"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 20} Q${e.tl},${e.ty - 2} ${e.tl + 24},${e.ty - 2} L${e.tl + 40},${e.ty - 2} L${e.tl + 24},380 L${e.tl},380Z M${e.tr},${e.ty + 20} Q${e.tr},${e.ty - 2} ${e.tr - 24},${e.ty - 2} L${e.tr - 40},${e.ty - 2} L${e.tr - 24},380 L${e.tr},380Z" fill="#15151a"/><ellipse cx="160" cy="330" rx="40" ry="34" fill="#fff"/>`,
        ),
        t: '<path d="M150,262 L150,380" stroke="#e8e6df" stroke-width="2"/>',
        h:
          p('<circle cx="104" cy="98" r="24" fill="#15151a"/><circle cx="104" cy="98" r="11" fill="#3a3a44"/>') +
          c0(160, 168, 72, 78, 50, 58, "#f7f7f5", 178) +
          p('<ellipse cx="136" cy="166" rx="15" ry="12" fill="#15151a" opacity=".85" transform="rotate(-20 136 166)"/>') +
          M0().replace(/ry="6"/g, 'ry="2"') +
          '<text x="218" y="96" font-size="22" font-family="sans-serif" font-weight="700" fill="#9fd8f0">z</text><text x="236" y="72" font-size="16" font-family="sans-serif" font-weight="700" fill="#9fd8f0">z</text>',
        f: $.pillow(),
        leg: (e, t) =>
          t > 100 ? `<rect x="${-e - 2}" y="${t * 0.72}" width="${e * 2 + 4}" height="${t * 0.28 + 2}" rx="8" fill="#15151a"/>` : "",
        cover: u,
      },
      cilginbilim: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#ffdbb0",
          hairStyle: "kel",
          hairColor: "#f4f4f4",
          eyebrowShape: "thick",
          eyeShape: "wide",
          facialHair: "mustache",
          mouthShape: "open",
          pantsColor: "#3a3f47",
          shoeColor: "#3a2f1d",
          shoeStyle: "klasik",
          background: "#0e1a14",
        }),
        hb: p('<path d="M106,190 L70,186 L92,170 L58,152 L94,146 L72,118 L108,128 L104,98 L126,120 L128,150Z" fill="#f4f4f4"/>'),
        t0: G("#f4f6f8", "#5a8a6a", { bottom: 440, lapel: "#dfe4ea" }),
        t: i(
          E0("#c81d3f"),
          '<rect x="190" y="292" width="24" height="30" rx="2" fill="#dfe4ea"/><path d="M196,288 v14 M204,286 v14" stroke="#2a6bff" stroke-width="3"/>',
        ),
        h: i0("#5a4020", "#7ff0a0", -44) + '<ellipse cx="146" cy="116" rx="16" ry="7" fill="#fff" opacity=".35"/>',
        f: $.potion("#4ade80"),
      },
      kopekbaligi: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#ffdbb0",
          hairStyle: "kel",
          eyeShape: "round",
          mouthShape: "smile",
          faceAcc: "freckles",
          pantsColor: "#5a6e86",
          shoeColor: "#f2efe4",
          shoeStyle: "spor",
          background: "#06223a",
        }),
        b: '<path d="M210,350 Q270,330 296,300 Q290,350 300,400 Q270,370 214,380Z" fill="#5a6e86"/>',
        t0: i(y("#5a6e86"), '<ellipse cx="160" cy="330" rx="56" ry="48" fill="#eef2f6"/>'),
        h:
          '<path d="M160,40 Q178,60 190,98 L150,98 Q156,70 160,40Z" fill="#5a6e86"/>' +
          c0(160, 164, 76, 82, 52, 58, "#5a6e86", 176) +
          '<path d="M108,176 a52,58 0 0,1 104,0" fill="none"/>' +
          (() => {
            let e = "";
            for (let t = 0; t < 14; t++) {
              let a = Math.PI + (t / 13) * Math.PI * 2,
                r = 160 + Math.cos(a) * 52,
                l = 176 + Math.sin(a) * 58,
                o = 160 + Math.cos(a) * 42,
                f = 176 + Math.sin(a) * 47,
                n = 160 + Math.cos(a - 0.12) * 53,
                h = 176 + Math.sin(a - 0.12) * 59,
                c = 160 + Math.cos(a + 0.12) * 53,
                x = 176 + Math.sin(a + 0.12) * 59;
              e += `<path d="M${n.toFixed(1)},${h.toFixed(1)} L${o.toFixed(1)},${f.toFixed(1)} L${c.toFixed(1)},${x.toFixed(1)}Z" fill="#fff"/>`;
            }
            return e;
          })() +
          p('<circle cx="112" cy="110" r="8" fill="#111"/><circle cx="110" cy="107" r="3" fill="#fff"/>'),
        cover: u,
      },
      dinozor: {
        base: d({
          gender: S,
          build: "standart",
          skin: "#ffe0c2",
          hairStyle: "kel",
          eyeShape: "round",
          eyelash: "natural",
          mouthShape: "open",
          lipColor: "#d48a8a",
          pantsColor: "#4caf50",
          shoeColor: "#2e7d32",
          shoeStyle: "bot",
          background: "#0a2410",
        }),
        b:
          '<path d="M200,360 Q280,380 300,460 Q306,500 286,520 Q280,460 250,430 Q226,410 200,400Z" fill="#4caf50"/>' +
          [0, 1, 2].map((e) => `<path d="M${262 + e * 12},${410 + e * 34} l14,-6 l-4,16Z" fill="#ffd23f"/>`).join(""),
        t0: i(
          y("#4caf50"),
          '<ellipse cx="160" cy="330" rx="52" ry="48" fill="#c8e6a0"/><path d="M118,318 h84 M114,338 h92 M118,358 h84" stroke="#a8c880" stroke-width="3"/>',
        ),
        h:
          [104, 128, 152, 176, 200]
            .map(
              (e, t) =>
                `<path d="M${e - 12},${96 - (t === 2 ? 8 : t % 2 ? 4 : 0) + 8} L${e},${70 - (t === 2 ? 8 : t % 2 ? 4 : 0)} L${e + 12},${96 - (t === 2 ? 8 : t % 2 ? 4 : 0) + 8}Z" fill="#ffd23f"/>`,
            )
            .join("") +
          c0(160, 166, 76, 80, 50, 58, "#4caf50", 178) +
          p('<circle cx="114" cy="112" r="10" fill="#fff"/><circle cx="116" cy="114" r="5" fill="#111"/>') +
          (() => {
            let e = "";
            for (let t = 0; t < 8; t++) {
              let a = 116 + t * 12.5;
              e += `<path d="M${a},${226 - Math.abs(t - 3.5) * 2} l6,-10 l6,10Z" fill="#fff"/>`;
            }
            return e;
          })(),
        leg: M("#2e7d32", 0.8),
        cover: u,
      },
      kartonrobot: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#f1c27d",
          hairStyle: "kel",
          eyeShape: "round",
          mouthShape: "smile",
          faceAcc: "freckles",
          pantsColor: "#2b3550",
          shoeColor: "#e8e6df",
          shoeStyle: "spor",
          background: "#1a1408",
        }),
        t0: ({ B: e }) =>
          `<rect x="${e.tl - 10}" y="${e.ty - 6}" width="${e.tr - e.tl + 20}" height="${400 - e.ty}" fill="#c8945a"/><path d="M${e.tl - 10},${e.ty - 6} L${e.tl + 10},${e.ty - 22} L${e.tr + 30},${e.ty - 22} L${e.tr + 10},${e.ty - 6}Z" fill="#dfae72"/><path d="M${e.tr + 10},${e.ty - 6} L${e.tr + 30},${e.ty - 22} L${e.tr + 30},380 L${e.tr + 10},394Z" fill="#a8743e"/><path d="M${e.tl + 20},${e.ty + 10} L${e.tl + 40},${e.ty + 30}" stroke="#a8743e" stroke-width="3"/>`,
        t: `<rect x="124" y="296" width="72" height="44" rx="4" fill="#e8e6df" stroke="#5a4020" stroke-width="2"/>${g([[140, 312]], 7, "#c81d3f")}${g([[164, 312]], 7, "#2a6bff")}${g([[184, 312]], 5, "#ffd23f")}<path d="M134,328 h52" stroke="#5a4020" stroke-width="3" stroke-dasharray="6 4"/><text x="160" y="370" font-size="16" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#5a4020">RBT-9</text>`,
        h: '<path fill-rule="evenodd" d="M90,92 L230,92 L230,246 L90,246Z M114,138 L206,138 L206,224 L114,224Z" fill="#c8945a"/><path d="M90,92 L110,76 L250,76 L230,92Z" fill="#dfae72"/><path d="M230,92 L250,76 L250,230 L230,246Z" fill="#a8743e"/><path d="M114,138 L206,138 L206,224 L114,224Z" fill="none" stroke="#5a4020" stroke-width="3" stroke-dasharray="8 5"/><path d="M150,92 L150,60 M170,92 L176,56" stroke="#8e98a2" stroke-width="4"/><circle cx="150" cy="56" r="6" fill="#c81d3f"/><circle cx="176" cy="52" r="6" fill="#ffd23f"/><rect x="98" y="106" width="20" height="8" rx="2" fill="#8e98a2"/>',
        cover: u,
      },
      palyaco: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#ffe0c2",
          hairStyle: "kel",
          eyeShape: "round",
          mouthShape: "smile",
          lipColor: "#e0115f",
          pantsColor: "#b44cff",
          shoeColor: "#e0115f",
          shoeStyle: "spor",
          background: "#1a0a2a",
        }),
        hb: [
          ["#e0115f", 100, 130],
          ["#ff8a1a", 88, 170],
          ["#ffd23f", 92, 210],
          ["#4ade80", 228, 210],
          ["#2a6bff", 232, 170],
          ["#b44cff", 220, 130],
          ["#ff2e88", 160, 92],
          ["#ffd23f", 130, 100],
          ["#4ade80", 190, 100],
        ]
          .map(([e, t, a]) => `<circle cx="${t}" cy="${a}" r="26" fill="${e}"/>`)
          .join(""),
        t0: i(y("#7ad8ff"), ({ B: e }) =>
          [
            [e.tl + 26, e.ty + 30, "#e0115f"],
            [e.tl + 60, 340, "#ffd23f"],
            [130, 300, "#4ade80"],
            [190, 290, "#e0115f"],
            [e.tr - 30, 330, "#b44cff"],
            [160, 360, "#ff8a1a"],
            [e.tr - 50, e.ty + 20, "#ffd23f"],
          ]
            .map(([t, a, r]) => `<circle cx="${t}" cy="${a}" r="10" fill="${r}"/>`)
            .join(""),
        ),
        t:
          p('<path d="M160,262 Q130,252 108,264 Q120,276 108,288 Q134,296 160,282Z" fill="#fff" stroke="#e8e6df" stroke-width="2"/>') +
          '<circle cx="160" cy="300" r="7" fill="#2a6bff"/><circle cx="160" cy="326" r="7" fill="#2a6bff"/>',
        h:
          '<path d="M134,200 Q160,236 186,200 Q190,222 160,232 Q130,222 134,200Z" fill="#fff"/><path d="M138,206 Q160,226 182,206" stroke="#e0115f" stroke-width="5" fill="none" stroke-linecap="round"/>' +
          p('<path d="M138,152 L138,184 M126,168 L150,168" stroke="#2a6bff" stroke-width="2.5"/>') +
          '<circle cx="160" cy="186" r="12" fill="#e0115f"/><circle cx="156" cy="182" r="4" fill="#fff" opacity=".6"/><path d="M140,96 L160,58 L180,96Z" fill="#4ade80"/><circle cx="160" cy="56" r="7" fill="#ffd23f"/>',
        leg: (e, t) =>
          g(
            [
              [-e * 0.4, t * 0.3],
              [e * 0.4, t * 0.6],
              [-e * 0.3, t * 0.85],
            ],
            6,
            "#ffd23f",
          ),
      },
      morcanavar: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#8a5ac8",
          hairStyle: "kel",
          eyeShape: "round",
          eyeColor: "#2a8a3a",
          noseShape: "button",
          pantsColor: "#7046ae",
          shoeColor: "#5a3a8a",
          shoeStyle: "klasik",
          background: "#16082a",
        }),
        t0: i(y("#8a5ac8"), ({ B: e }) => {
          let t = "";
          for (let a = e.tl; a < e.tr; a += 14) t += `<path d="M${a},380 l7,10 l7,-10" fill="#8a5ac8"/>`;
          return (
            t +
            g(
              [
                [e.tl + 30, 300],
                [180, 340],
                [120, 360],
                [e.tr - 40, 290],
              ],
              9,
              "#b48af0",
            )
          );
        }),
        h:
          '<path d="M98,180 Q90,108 160,100 Q230,108 222,180 Q226,244 160,248 Q94,244 98,180Z" fill="#8a5ac8"/>' +
          (() => {
            let e = "";
            for (let t = 0; t < 9; t++) {
              let a = 104 + t * 14;
              e += `<path d="M${a},${110 + Math.abs(t - 4) * 4} l7,-14 l7,14Z" fill="#8a5ac8"/>`;
            }
            return e;
          })() +
          p('<path d="M118,118 Q100,86 112,70 Q120,94 132,108Z" fill="#f2efe4"/>') +
          p(
            '<circle cx="136" cy="162" r="15" fill="#fff"/><circle cx="139" cy="164" r="7" fill="#2a8a3a"/><circle cx="141" cy="162" r="3" fill="#111"/>',
          ) +
          '<path d="M118,196 Q160,252 202,196 Q160,212 118,196Z" fill="#3a1414"/><path d="M128,200 l6,10 l6,-8 l6,10 l6,-9 l6,10 l6,-10 l6,10 l6,-10 l6,9" stroke="#fff" stroke-width="0" fill="#fff"/><ellipse cx="160" cy="226" rx="16" ry="7" fill="#e86a8a"/><rect x="134" y="236" width="52" height="38" fill="#8a5ac8"/>',
        cover: u,
      },
      hamburger: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#ffdbb0",
          hairStyle: "kel",
          eyeShape: "round",
          mouthShape: "smile",
          pantsColor: "#c81d3f",
          shoeColor: "#ffd23f",
          shoeStyle: "spor",
          background: "#2a1404",
        }),
        t0: ({ B: e }) =>
          `<path d="M${e.tl - 10},${e.ty + 10} Q160,${e.ty - 20} ${e.tr + 10},${e.ty + 10} L${e.tr + 6},${e.ty + 24} L${e.tl - 6},${e.ty + 24}Z" fill="#4caf50"/><path d="M${e.tl - 8},${e.ty + 22} L${e.tr + 8},${e.ty + 22} L${e.tr + 2},${e.ty + 36} L${e.tr - 20},${e.ty + 54} L${e.tr - 30},${e.ty + 36} L${e.tl + 30},${e.ty + 36} L${e.tl + 18},${e.ty + 54} L${e.tl - 2},${e.ty + 36}Z" fill="#ffd23f"/><rect x="${e.tl - 6}" y="${e.ty + 36}" width="${e.tr - e.tl + 12}" height="40" rx="18" fill="#6b3a1a"/><path d="M${e.tl - 6},${e.ty + 82} L${e.tr + 6},${e.ty + 82} Q${e.tr + 6},384 160,386 Q${e.tl - 6},384 ${e.tl - 6},${e.ty + 82}Z" fill="#e0a050"/>`,
        h: `<path d="M86,148 Q86,58 160,54 Q234,58 234,148 Z" fill="#e0a050"/><path d="M96,120 Q100,72 160,66" stroke="#fff" stroke-width="6" opacity=".25" fill="none"/>${[
          [120, 86],
          [150, 72],
          [182, 80],
          [206, 104],
          [134, 110],
          [168, 100],
        ]
          .map(([e, t]) => `<ellipse cx="${e}" cy="${t}" rx="5" ry="2.6" fill="#fff6dc"/>`)
          .join(
            "",
          )}<path d="M88,146 Q100,158 112,146 Q124,158 136,146 Q148,158 160,146 Q172,158 184,146 Q196,158 208,146 Q220,158 232,146" stroke="#4caf50" stroke-width="7" fill="none"/>`,
        cover: ["head"],
      },
      korsankaptan: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#c68863",
          hairStyle: "long",
          hairColor: "#0d0a08",
          facialHair: "full",
          eyebrowShape: "thick",
          mouthShape: "smirk",
          earring: "sol",
          pantsColor: "#2a2420",
          shoeColor: "#1a1410",
          shoeStyle: "bot",
          background: "#1a0c06",
        }),
        t0: G("#9a1a1a", "#f2efe4", { bottom: 440, lapel: "#d4af37" }),
        t: i(
          w("#1a1410", 344),
          '<path d="M146,268 Q160,290 174,268 Q170,300 160,306 Q150,300 146,268Z" fill="#f8f4ea"/>',
          g(
            [
              [132, 310],
              [132, 330],
              [188, 310],
              [188, 330],
            ],
            4,
            "#d4af37",
          ),
        ),
        h: '<path d="M84,130 Q120,96 160,108 Q200,96 236,130 Q200,114 160,124 Q120,114 84,130Z" fill="#141414"/><path d="M110,118 Q112,66 160,62 Q208,66 210,118 Q160,108 110,118Z" fill="#141414"/><path d="M84,130 Q120,96 160,108 Q200,96 236,130" stroke="#d4af37" stroke-width="3" fill="none"/><circle cx="160" cy="88" r="9" fill="#f4f1e8"/><circle cx="157" cy="87" r="2" fill="#141414"/><circle cx="163" cy="87" r="2" fill="#141414"/><path d="M148,100 L172,108 M172,100 L148,108" stroke="#f4f1e8" stroke-width="3"/>',
        f: $.cutlass(),
        leg: M("#1a1410", 0.5, "#3a2f1d"),
        cover: ["head"],
      },
      kovboy: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#e0ac69",
          hairStyle: "short",
          hairColor: "#5c3a21",
          facialHair: "horseshoe",
          eyeShape: "narrow",
          mouthShape: "smirk",
          pantsColor: "#2b3550",
          shoeColor: "#5a3a1a",
          shoeStyle: "bot",
          background: "#2a1806",
        }),
        t0: i(
          y("#c0602a"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 20} Q${e.tl},${e.ty - 2} ${e.tl + 24},${e.ty - 2} L148,${e.ty - 2} L150,380 L${e.tl},380Z M${e.tr},${e.ty + 20} Q${e.tr},${e.ty - 2} ${e.tr - 24},${e.ty - 2} L172,${e.ty - 2} L170,380 L${e.tr},380Z" fill="#5a3a1a"/>`,
        ),
        t: i(
          '<path d="M134,256 L160,286 L186,256 L178,250 L160,268 L142,250Z" fill="#c81d3f"/>',
          A(120, 304, 14, "#d4af37", 'stroke="#8a6a10" stroke-width="2"'),
          L("#3a2410", "#c9ced6", 356),
        ),
        h: '<path d="M118,118 Q114,70 138,70 Q160,84 182,70 Q206,70 202,118Z" fill="#8a5a2b"/><rect x="118" y="104" width="84" height="12" fill="#3a2410"/><path d="M70,116 Q84,136 160,132 Q236,136 250,116 Q240,104 222,112 Q160,128 98,112 Q80,104 70,116Z" fill="#8a5a2b"/>',
        f: $.lasso(),
        leg: M("#5a3a1a", 0.6, "#3a2410"),
        cover: ["head"],
      },
      gizliajan: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#f1c27d",
          hairStyle: "slick",
          hairColor: "#2b2118",
          faceAcc: "sunglasses",
          mouthShape: "thin",
          clothing: "tuxedo",
          clothColor: "#2b2b33",
          neckAcc: "bow",
          heldItem: "tabanca",
          pantsColor: "#16161c",
          shoeColor: "#0d0d0d",
          shoeStyle: "klasik",
          background: "#1d3557",
        }),
        h: '<path d="M216,176 Q232,190 222,214" stroke="#d8dce0" stroke-width="2.5" fill="none"/><circle cx="217" cy="178" r="4" fill="#d8dce0"/>',
      },
      gladyator: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#a86b3c",
          hairStyle: "kel",
          pantsColor: "#a86b3c",
          shoeColor: "#5a3a1a",
          shoeStyle: "sandalet",
          background: "#2a1406",
        }),
        t0: I("#a86b3c"),
        t: ({ B: e }) =>
          `<path d="M${e.tl},${e.ty + 10} L${e.tr},350" stroke="#5a3a1a" stroke-width="12"/><path d="M${e.tl - 10},${e.ty + 30} Q${e.tl - 14},${e.ty - 14} ${e.tl + 30},${e.ty - 8} L${e.tl + 50},${e.ty + 4} L${e.tl + 30},${e.ty + 40}Z" fill="#b8742a" stroke="#6b3a10" stroke-width="2"/><path d="M${e.tl - 4},${e.ty + 12} h40 M${e.tl - 4},${e.ty + 24} h36" stroke="#6b3a10" stroke-width="2"/><rect x="${e.tl}" y="356" width="${e.tr - e.tl}" height="24" fill="#5a3a1a"/>${[0, 1, 2, 3, 4, 5].map((t) => `<rect x="${e.tl + 10 + t * ((e.tr - e.tl - 20) / 6)}" y="378" width="16" height="36" fill="#6b3a1a" stroke="#3a2010" stroke-width="1.5"/>`).join("")}`,
        h: `<path d="M98,170 Q94,94 160,90 Q226,94 222,170 Q222,236 160,240 Q98,236 98,170Z" fill="#b8742a"/><path d="M84,160 Q160,140 236,160 L236,170 Q160,152 84,170Z" fill="#9a5a1a"/><path d="M130,150 L190,150 L190,226 Q160,234 130,226Z" fill="#1a0e06"/>${(() => {
          let e = "";
          for (let t = 156; t < 226; t += 14)
            for (let a = 136; a < 188; a += 13)
              e += `<circle cx="${a + 6}" cy="${t + 6}" r="4.5" fill="#1a0e06" stroke="#b8742a" stroke-width="3.5"/>`;
          return e;
        })()}<path d="M160,90 L160,60 M140,92 Q160,40 180,92" stroke="#9a5a1a" stroke-width="8" fill="none"/><path d="M110,110 Q120,96 140,94" stroke="#fff" stroke-width="5" opacity=".25" fill="none"/><rect x="134" y="236" width="52" height="38" fill="#a86b3c"/>`,
        f: $.sword("#cfd6de", "#b8742a"),
        leg: m(F("#b8742a"), J("#5a3a1a")),
        cover: u,
      },
      spartali: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#c68863",
          hairStyle: "kel",
          pantsColor: "#c68863",
          shoeColor: "#5a3a1a",
          shoeStyle: "sandalet",
          background: "#1a0606",
        }),
        b: z("#9a1414", "#5a0a0a"),
        t0: I("#c68863"),
        t: i(
          ({ B: e }) =>
            `<rect x="${e.tl}" y="350" width="${e.tr - e.tl}" height="30" fill="#2a1a10"/><path d="M${e.tl},350 L${e.tr},350" stroke="#d4af37" stroke-width="4"/>`,
          R("#d4af37"),
        ),
        h: `<path d="M140,108 Q126,30 160,16 Q194,30 180,108Z" fill="#9a1414"/><path d="M146,100 Q140,40 160,24 M174,100 Q180,40 160,24 M160,24 L160,104" stroke="#5a0a0a" stroke-width="2" fill="none"/><path d="M96,176 Q92,100 160,96 Q228,100 224,176 L224,232 Q196,250 180,234 L178,184 L196,182 L196,160 L124,160 L124,182 L142,184 L140,234 Q124,250 96,232Z" fill="#c8902a"/><path d="M124,160 L196,160 L196,182 L178,184 L176,236 L144,236 L142,184 L124,182Z" fill="#1a0e06"/>${p('<ellipse cx="140" cy="170" rx="6" ry="3" fill="#f4f1e8"/>')}<path d="M106,120 Q116,104 140,100" stroke="#fff" stroke-width="5" opacity=".3" fill="none"/><path d="M96,176 Q92,100 160,96" stroke="#7a5010" stroke-width="2" fill="none"/>`,
        f:
          $.spear("#5a3a1a", "#c8902a") +
          '<circle cx="66" cy="340" r="58" fill="#c8902a" stroke="#7a5010" stroke-width="6"/><circle cx="66" cy="340" r="42" fill="none" stroke="#7a5010" stroke-width="3"/><path d="M66,306 L48,370 L84,370Z" fill="#9a1414"/>',
        leg: F("#c8902a"),
        cover: u,
      },
      uzaykomando: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#e0ac69",
          hairStyle: "kel",
          pantsColor: "#2a2f36",
          shoeColor: "#eef0f2",
          shoeStyle: "bot",
          background: "#0a121a",
        }),
        t0: y("#2a2f36"),
        t: i(
          N("#eef0f2", "#ff8a1f"),
          D("#eef0f2"),
          '<rect x="150" y="300" width="20" height="30" rx="4" fill="#ff8a1f"/>',
          L("#1a1e22", "#ff8a1f", 352),
        ),
        h: '<path d="M94,180 Q90,92 160,88 Q230,92 226,180 Q226,234 190,248 L130,248 Q94,234 94,180Z" fill="#eef0f2"/><path d="M110,146 Q160,128 210,146 L206,196 Q160,212 114,196Z" fill="#1a1e26"/><path d="M118,150 Q150,140 176,142" stroke="#6ab8ff" stroke-width="4" opacity=".7" fill="none"/><path d="M110,146 Q160,128 210,146" stroke="#ff8a1f" stroke-width="5" fill="none"/><rect x="152" y="90" width="16" height="36" rx="4" fill="#ff8a1f"/><rect x="134" y="240" width="52" height="34" fill="#2a2f36"/>',
        f: $.rifle(),
        leg: m(F("#eef0f2"), X("#ff8a1f")),
        cover: u,
      },
      colkasifi: {
        base: d({
          gender: S,
          build: "standart",
          skin: "#f1c27d",
          hairStyle: "ponytail",
          hairColor: "#8a6a3a",
          eyelash: "natural",
          faceAcc: "freckles",
          mouthShape: "smile",
          lipColor: "#b06a4a",
          pantsColor: "#8a7a50",
          shoeColor: "#5a3a1a",
          shoeStyle: "bot",
          background: "#2a2010",
        }),
        t0: i(
          y("#c8b88a"),
          '<path d="M160,262 L160,380" stroke="#8a7a50" stroke-width="2"/>' +
            p('<rect x="104" y="290" width="30" height="24" rx="3" fill="#b8a878" stroke="#8a7a50" stroke-width="2"/>'),
        ),
        t: i(L("#5a3a1a", "#c9a066", 354), '<path d="M100,264 L210,346" stroke="#5a3a1a" stroke-width="6"/>'),
        h: '<path d="M106,130 Q106,68 160,66 Q214,68 214,130Z" fill="#e8dcb8"/><path d="M106,130 Q106,68 160,66" stroke="#fff" stroke-width="4" opacity=".4" fill="none"/><rect x="106" y="118" width="108" height="10" fill="#8a6a3a"/><ellipse cx="160" cy="130" rx="76" ry="12" fill="#e8dcb8"/>',
        f: $.map(),
        leg: M("#5a3a1a", 0.6),
        cover: ["head"],
      },
      kiyamet: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#c68863",
          hairStyle: "mohawk",
          hairColor: "#c81d3f",
          facialHair: "short",
          faceAcc: "scar",
          eyebrowShape: "angled",
          pantsColor: "#3a3028",
          shoeColor: "#1a1410",
          shoeStyle: "bot",
          background: "#2a1408",
        }),
        t0: i(
          y("#4a3a2a"),
          ({ B: e }) =>
            `<path d="M${e.tl + 30},${e.ty + 30} l10,8 M${e.tr - 50},330 l12,6 M120,360 l8,10" stroke="#2a2018" stroke-width="3"/>`,
        ),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl - 14},${e.ty + 34} Q${e.tl - 18},${e.ty - 16} ${e.tl + 34},${e.ty - 10} L${e.tl + 46},${e.ty + 10} L${e.tl + 20},${e.ty + 44}Z" fill="#6e7882" stroke="#3a4048" stroke-width="2"/><path d="M${e.tl - 2},${e.ty - 4} L${e.tl - 14},${e.ty - 34} L${e.tl + 10},${e.ty - 8}Z M${e.tl + 18},${e.ty - 10} L${e.tl + 16},${e.ty - 42} L${e.tl + 32},${e.ty - 8}Z" fill="#c9ced6"/>`,
          '<path d="M100,264 L220,354" stroke="#2a2018" stroke-width="12"/>',
          L("#2a2018", "#8e98a2"),
        ),
        h: i0("#3a3028", "#ffb84a", -36) + '<path d="M120,200 Q160,214 200,200 L200,226 Q160,246 120,226Z" fill="#6b5a40" opacity=".0"/>',
        leg: m(X("#6e7882"), M("#1a1410", 0.62)),
      },
      rockyildizi: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "mohawk",
          hairColor: "#0d0d0d",
          faceAcc: "sunglasses",
          earring: "cift",
          mouthShape: "smirk",
          clothing: "leather",
          clothColor: "#141418",
          neckAcc: "chain",
          pantsColor: "#1a1a1a",
          shoeColor: "#111111",
          shoeStyle: "bot",
          background: "#1a0614",
        }),
        t: `<path d="M144,272 L176,272 L172,330 L148,330Z" fill="#f4f4f4"/><path d="M152,286 Q160,280 168,286 L164,300 L156,300Z" fill="#111"/>${g(
          [
            [100, 280],
            [112, 280],
            [208, 280],
            [220, 280],
          ],
          3,
          "#c9ced6",
        )}`,
        f: $.guitar("#c81d3f"),
        leg: (e, t) => (t > 100 ? `<path d="M${-e + 4},${t * 0.36} l8,6 l-8,4" stroke="#ffe0c2" stroke-width="3" fill="none"/>` : ""),
      },
      sihirbaz: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#f1c27d",
          hairStyle: "slick",
          hairColor: "#0d0a08",
          facialHair: "vandyke",
          eyebrowShape: "arched",
          mouthShape: "smirk",
          clothing: "tuxedo",
          clothColor: "#0d0d0d",
          neckAcc: "bow",
          pantsColor: "#0d0d0d",
          shoeColor: "#0d0d0d",
          shoeStyle: "klasik",
          background: "#14061a",
        }),
        b: z("#0d0d0d", "#b8141e"),
        t: R("#d4af37"),
        h: '<ellipse cx="160" cy="114" rx="70" ry="12" fill="#0d0d0d"/><rect x="124" y="30" width="72" height="86" rx="4" fill="#0d0d0d"/><rect x="124" y="92" width="72" height="12" fill="#b8141e"/><path d="M132,36 L132,90" stroke="#fff" stroke-width="4" opacity=".18"/>',
        f:
          $.wand("#0d0d0d", "#ffd23f") +
          p("") +
          '<g transform="translate(290,360)"><ellipse rx="12" ry="10" fill="#fff"/><path d="M-6,-8 Q-10,-30 -4,-30 Q0,-22 -2,-8 M4,-8 Q6,-30 10,-28 Q12,-20 4,-8" fill="#fff" stroke="#ddd"/><circle cx="-4" cy="-2" r="1.5" fill="#e0115f"/><circle cx="4" cy="-2" r="1.5" fill="#e0115f"/></g>',
        cover: ["head"],
      },
      mafyababasi: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#e0ac69",
          hairStyle: "slick",
          hairColor: "#b0b0b0",
          facialHair: "mustache",
          eyebrowShape: "thick",
          eyeShape: "hooded",
          mouthShape: "thin",
          clothing: "suit",
          clothColor: "#1a1d26",
          neckAcc: "tie",
          pantsColor: "#1a1d26",
          shoeColor: "#0d0d0d",
          shoeStyle: "klasik",
          background: "#100a06",
        }),
        t: ({ B: e }) => {
          let t = "";
          for (let a = e.tl + 14; a < e.tr; a += 16)
            t += `<path d="M${a},${e.ty + 4} L${a},380" stroke="#c9ced6" stroke-width="1" opacity=".35"/>`;
          return (
            t +
            `<circle cx="196" cy="290" r="8" fill="#c81d3f"/><circle cx="192" cy="286" r="4" fill="#e0115f"/><path d="M196,298 L194,312" stroke="#2a6b2a" stroke-width="2"/><rect x="${e.tl + 22}" y="292" width="22" height="8" rx="1" fill="#f2efe4"/>`
          );
        },
        h:
          '<path d="M110,106 Q160,66 210,106 Q212,124 200,128 L120,128 Q108,124 110,106Z" fill="#2a2420"/><rect x="108" y="118" width="104" height="10" rx="4" fill="#0d0d0d"/><ellipse cx="160" cy="128" rx="76" ry="12" fill="#2a2420"/><path d="M134,88 Q160,98 186,88" stroke="#1a1410" stroke-width="3" fill="none"/>' +
          $.cigar(),
        cover: ["head"],
      },
      kontvlad: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#e8e2dc",
          hairStyle: "slick",
          hairColor: "#0d0a08",
          eyeColor: "#8b3a3a",
          eyebrowShape: "angled",
          mouthShape: "smirk",
          lipColor: "#8a1d2a",
          clothing: "vest",
          clothColor: "#1a0a0e",
          neckAcc: "none",
          pantsColor: "#0d0d0d",
          shoeColor: "#0d0d0d",
          shoeStyle: "klasik",
          background: "#14040a",
        }),
        b: z("#0d0d0d", "#8a0a1a"),
        hb: p(
          '<path d="M150,262 L86,150 L80,236 L110,268Z" fill="#8a0a1a"/><path d="M150,262 L86,150 L72,160 L66,250 L110,276Z" fill="#0d0d0d"/>',
        ),
        t: i(
          '<path d="M150,262 L160,270 L170,262 L166,280 L154,280Z" fill="#c81d3f"/>',
          R("#c81d3f"),
          '<circle cx="160" cy="300" r="9" fill="#c81d3f" stroke="#d4af37" stroke-width="3"/>',
        ),
        h:
          '<path d="M140,114 L160,136 L180,114Z" fill="#0d0d0d"/>' +
          g1() +
          p('<path d="M124,190 Q130,200 136,196" stroke="#c8bab0" stroke-width="2" fill="none"/>'),
      },
      kurtadam: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#6b5040",
          hairStyle: "kel",
          pantsColor: "#2b3550",
          shoeColor: "#6b5040",
          shoeStyle: "sandalet",
          background: "#0a1020",
        }),
        b: '<circle cx="250" cy="90" r="46" fill="#f4f0d8" opacity=".45"/>',
        t0: i(
          I("#6b5040"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 10} L${e.tl + 24},${e.ty + 30} L${e.tl + 10},${e.ty + 52} L${e.tl + 34},380 L${e.tl},380Z M${e.tr},${e.ty + 10} L${e.tr - 20},${e.ty + 40} L${e.tr - 6},${e.ty + 70} L${e.tr - 36},380 L${e.tr},380Z" fill="#8a2a2a"/><path d="M140,272 Q160,300 180,272 Q172,316 160,322 Q148,316 140,272Z" fill="#8a7060"/>`,
        ),
        h:
          `<path d="M94,184 Q90,120 118,104 L106,44 L148,96 Q160,92 172,96 L214,44 L202,104 Q230,120 226,184 Q222,236 160,250 Q98,236 94,184Z" fill="#5a4030"/><path d="M110,92 L106,62 L134,94Z M210,92 L214,62 L186,94Z" fill="#2a1a10"/><path d="M94,184 L80,210 L102,206 L96,226 L116,218 M226,184 L240,210 L218,206 L224,226 L204,218" fill="#5a4030" stroke="#5a4030" stroke-width="6"/><path d="M126,180 Q160,170 194,180 Q198,230 160,240 Q122,230 126,180Z" fill="#8a7060"/><ellipse cx="160" cy="190" rx="14" ry="9" fill="#111"/><path d="M134,214 Q160,232 186,214" stroke="#2a1010" stroke-width="5" fill="none"/>${p('<path d="M140,216 L144,232 L148,216Z" fill="#fff"/>')}` +
          p(
            '<path d="M116,152 Q132,142 148,156 Q132,166 116,152Z" fill="#ffd23f"/><circle cx="134" cy="155" r="3.5" fill="#111"/><path d="M114,140 L150,150" stroke="#2a1a10" stroke-width="5" stroke-linecap="round"/>',
          ) +
          '<rect x="136" y="236" width="48" height="38" fill="#5a4030"/>',
        leg: (e, t) =>
          `<rect x="${-e - 2}" y="-2" width="${e * 2 + 4}" height="${t * 0.7}" fill="#2b3550"/><path d="M${-e - 2},${t * 0.7} l6,10 l6,-10 l6,12 l6,-12 l6,10 l6,-10" fill="#2b3550"/>`,
        cover: u,
      },
      zombi: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#8aa880",
          hairStyle: "short",
          hairColor: "#3a3028",
          eyeShape: "downturned",
          eyeColor: "#c8c8a0",
          mouthShape: "open",
          lipColor: "#4a5a40",
          clothing: "suit",
          clothColor: "#4a4a52",
          neckAcc: "tie",
          pantsColor: "#3a3f47",
          shoeColor: "#2a2420",
          shoeStyle: "klasik",
          background: "#0e140c",
        }),
        t: ({ B: e }) =>
          `<path d="M${e.tl},${e.ty + 30} L${e.tl + 16},${e.ty + 40} L${e.tl + 4},${e.ty + 60}Z M${e.tr - 30},380 L${e.tr - 20},360 L${e.tr - 4},380Z M140,380 L150,366 L160,380Z" fill="#0e140c"/><path d="M110,320 l20,10 M200,300 l14,-8" stroke="#6a2a2a" stroke-width="4"/>`,
        h: '<path d="M120,128 L150,140 M126,124 l4,10 M134,128 l4,10 M142,132 l4,10" stroke="#3a2a2a" stroke-width="2.5"/><circle cx="182" cy="169" r="11" fill="#f4f1e8"/><circle cx="184" cy="170" r="3" fill="#2a2a20"/><path d="M196,196 Q206,210 200,226" stroke="#6a2a2a" stroke-width="3" fill="none"/>',
        leg: (e, t) =>
          t > 100
            ? `<path d="M${-e - 2},${t * 0.62} l8,8 l6,-6 l8,8 l6,-8 l8,8" fill="#8aa880"/><rect x="${-e - 1}" y="${t * 0.7}" width="${e * 2 + 2}" height="${t * 0.3}" fill="#8aa880"/>`
            : "",
      },
      iskeletkral: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#e8e2d0",
          hairStyle: "kel",
          pantsColor: "#2a1440",
          shoeColor: "#1a0a2a",
          shoeStyle: "klasik",
          background: "#0c0614",
        }),
        b: i(T("#7a3aff", 0.25), z("#4a1a7a", "#d4af37")),
        t0: i(y("#4a1a7a"), v("#4a1a7a", { y: 350, bottom: 520, w: 24 })),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 16},${e.ty} L${e.tl + 30},520 M${e.tr - 16},${e.ty} L${e.tr - 30},520" stroke="#d4af37" stroke-width="5"/>`,
          `<path d="M128,262 Q160,290 192,262 L188,282 Q160,306 132,282Z" fill="#f2efe4"/>${g(
            [
              [134, 280],
              [146, 290],
              [160, 294],
              [174, 290],
              [186, 280],
            ],
            3,
            "#111",
          )}`,
          R("#7a3aff"),
        ),
        h:
          `<path d="M102,160 Q102,98 160,98 Q218,98 218,160 Q218,198 198,210 L194,238 L126,238 L122,210 Q102,198 102,160Z" fill="#e8e2d0"/><path d="M102,160 Q102,98 160,98" stroke="#fff" stroke-width="5" opacity=".4" fill="none"/>${p('<path d="M118,158 Q138,146 152,162 Q150,186 134,186 Q116,182 118,158Z" fill="#14081e"/>')}${p(Q(136, 168, 10, 10, "#a06aff", 0.9))}<path d="M160,186 L152,204 L168,204Z" fill="#14081e"/><path d="M128,214 L192,214 M128,228 L192,228" stroke="#14081e" stroke-width="3"/>${[136, 148, 160, 172, 184].map((e) => `<path d="M${e},212 L${e},230" stroke="#14081e" stroke-width="2.5"/>`).join("")}<rect x="146" y="238" width="28" height="36" fill="#d8d0bc"/><path d="M146,248 h28 M146,260 h28" stroke="#14081e" stroke-width="2"/>` +
          b0("#d4af37", "#7a3aff", -10),
        f: $.staff("#2a1a10", `<circle cy="-410" r="16" fill="#7a3aff"/>${Q(0, -410, 40, 40, "#a06aff", 0.6)}`),
        cover: u,
      },
      kabakkafa: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#e0ac69",
          hairStyle: "kel",
          pantsColor: "#2b3550",
          shoeColor: "#3a2f1d",
          shoeStyle: "bot",
          background: "#140a02",
        }),
        t0: i(
          y("#5a7a3a"),
          ({ B: e }) =>
            `<path d="M${e.tl + 20},${e.ty} L${e.tl + 20},380 M${e.tl + 60},${e.ty} L${e.tl + 60},380 M${e.tr - 60},${e.ty} L${e.tr - 60},380 M${e.tr - 20},${e.ty} L${e.tr - 20},380 M${e.tl},300 L${e.tr},300 M${e.tl},340 L${e.tr},340" stroke="#3a5a2a" stroke-width="2.5"/><rect x="120" y="320" width="34" height="30" fill="#c0602a"/><path d="M${e.tl},380 l8,14 l8,-14 l8,14 l8,-14 M${e.tr},380 l-8,14 l-8,-14 l-8,14 l-8,-14" stroke="#e8c870" stroke-width="3" fill="none"/>`,
        ),
        t: '<path d="M150,262 L160,278 L170,262" stroke="#e8c870" stroke-width="5" fill="none"/>',
        h: `<ellipse cx="160" cy="166" rx="78" ry="70" fill="#f08a1a"/><ellipse cx="124" cy="166" rx="34" ry="66" fill="#e07a10"/><ellipse cx="196" cy="166" rx="34" ry="66" fill="#e07a10"/><ellipse cx="160" cy="166" rx="30" ry="70" fill="#f8992a"/>${Q(160, 180, 60, 40, "#ffd23f", 0.4)}${p('<path d="M118,156 L148,156 L134,132Z" fill="#ffe27a"/>')}<path d="M152,170 L168,170 L160,182Z" fill="#ffe27a"/><path d="M112,196 L126,204 L136,194 L148,206 L160,196 L172,206 L184,194 L194,204 L208,196 Q196,230 160,232 Q124,230 112,196Z" fill="#ffe27a"/><path d="M156,98 Q150,76 166,66" stroke="#3a6a2a" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M76,104 Q160,58 244,104 Q236,88 160,80 Q84,88 76,104Z" fill="#d8b860"/><path d="M118,82 Q120,40 160,38 Q200,40 202,82Z" fill="#d8b860"/><path d="M118,78 L202,78" stroke="#8a2a2a" stroke-width="6"/><rect x="138" y="232" width="44" height="42" fill="#5a7a3a"/>`,
        leg: (e, t) => `<rect x="${e - 14}" y="${t * 0.3}" width="12" height="12" fill="#c0602a"/>`,
        cover: u,
      },
      cadi: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "long",
          hairColor: "#6b3fa0",
          eyelash: "dramatic",
          eyeColor: "#2a8a3a",
          eyeShape: "narrow",
          mouthShape: "smirk",
          lipColor: "#4a1d5c",
          pantsColor: "#1a1a1a",
          shoeColor: "#1a1a1a",
          shoeStyle: "bot",
          background: "#0e0a1a",
        }),
        t0: i(y("#1a1a22"), v("#24203a", { y: 340, bottom: 470, w: 30 })),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 20},470 L${e.tl + 40},450 L${e.tl + 60},476 L${e.tl + 90},450 L110,476 L140,450 L170,476 L200,450 L230,476" stroke="#6b3fa0" stroke-width="4" fill="none"/>`,
          w("#6b3fa0", 334),
          '<circle cx="160" cy="280" r="7" fill="#4ade80"/>',
        ),
        h: '<ellipse cx="160" cy="114" rx="82" ry="15" fill="#1a1a22"/><path d="M114,114 Q130,60 160,30 Q186,6 214,22 Q188,26 184,52 Q182,86 206,114Z" fill="#1a1a22"/><path d="M118,104 Q160,92 202,104 L204,116 Q160,104 116,116Z" fill="#6b3fa0"/><rect x="150" y="98" width="20" height="16" rx="2" fill="none" stroke="#d4af37" stroke-width="3"/>',
        f: '<g transform="translate(262,548) rotate(-6)"><rect x="-4" y="-380" width="8" height="330" fill="#6b3f1f"/><path d="M-4,-56 L-30,40 L30,40 L4,-56Z" fill="#c8a050"/><path d="M-20,0 L-24,40 M-8,-10 L-10,40 M8,-10 L10,40 M20,0 L24,40" stroke="#8a6a2a" stroke-width="2"/><rect x="-8" y="-60" width="16" height="10" fill="#6b3fa0"/></g>',
        cover: ["head"],
      },
      mumya: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#d8cca8",
          hairStyle: "kel",
          pantsColor: "#d8cca8",
          shoeColor: "#c8bc98",
          shoeStyle: "sandalet",
          background: "#1a1408",
        }),
        t0: i(y("#d8cca8"), ({ B: e }) => {
          let t = "";
          for (let a = e.ty + 10; a < 380; a += 16) t += `<path d="M${e.tl},${a} L${e.tr},${a + 8}" stroke="#a89a70" stroke-width="2.5"/>`;
          return t + `<path d="M${e.tr - 10},340 Q${e.tr + 20},370 ${e.tr + 10},410" stroke="#d8cca8" stroke-width="8" fill="none"/>`;
        }),
        h:
          e0("#d8cca8") +
          (() => {
            let e = "";
            for (let t = 108; t < 270; t += 13) e += `<path d="M98,${t} L222,${t + 10}" stroke="#a89a70" stroke-width="2.5"/>`;
            return e;
          })() +
          '<path d="M112,158 L208,162 L206,180 L114,176Z" fill="#14100a"/>' +
          p(Q(138, 168, 10, 8, "#7ff0a0", 0.9)),
        leg: J("#a89a70"),
        cover: u,
      },
      olummelegi: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#d8d0e0",
          hairStyle: "kel",
          pantsColor: "#0a0a0e",
          shoeColor: "#0a0a0e",
          shoeStyle: "klasik",
          background: "#04040a",
        }),
        b: i(
          '<path d="M60,560 Q40,460 80,380 Q90,480 120,560Z M260,560 Q280,460 240,380 Q230,480 200,560Z" fill="#14141c" opacity=".7"/>',
          L1("#14141c", "#2a2a36"),
        ),
        t0: i(
          y("#14141c"),
          v("#14141c", { y: 340, bottom: 540, w: 30 }),
          ({ B: e }) =>
            `<path d="M${e.tl - 20},540 L${e.tl},520 L${e.tl + 20},548 L${e.tl + 50},520 L${e.tl + 80},550 L160,520 L${e.tr - 80},550 L${e.tr - 50},520 L${e.tr - 20},548 L${e.tr},520 L${e.tr + 20},540" fill="#14141c"/>`,
        ),
        hb: r0("#14141c"),
        h: l0("#14141c") + O0() + V("slit", "#ff4a4a", "#000", "#ff2020"),
        f: $.scythe(),
        cover: u,
      },
      zeus: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#e0ac69",
          hairStyle: "curly",
          hairColor: "#f2f2f2",
          facialHair: "full",
          eyebrowShape: "thick",
          eyeColor: "#3a5f7d",
          mouthShape: "neutral",
          pantsColor: "#f4f2ea",
          shoeColor: "#c9a066",
          shoeStyle: "sandalet",
          background: "#0c1a36",
        }),
        b: i(T("#ffe14a", 0.25), '<path d="M30,120 L56,160 L44,162 L64,206" stroke="#ffe14a" stroke-width="4" fill="none"/>'),
        t0: i(
          y("#f4f2ea"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 10} L${e.tr},380 L${e.tl + 40},380 L${e.tl},${e.ty + 70}Z" fill="#dcd8c8"/><path d="M${e.tr - 40},${e.ty - 2} L${e.tr},${e.ty + 20} L${e.tr},380 L${e.tr - 60},380Z" fill="#e0ac69"/>`,
          v("#f4f2ea", { y: 360, bottom: 470, w: 14 }),
        ),
        t: ({ B: e }) => `<path d="M${e.tl + 6},${e.ty + 10} L${e.tr - 40},380" stroke="#d4af37" stroke-width="7"/>`,
        h: p(
          '<path d="M104,140 Q110,112 128,98" stroke="#3a7a2a" stroke-width="3" fill="none"/>' +
            [
              [106, 132, -60],
              [112, 118, -40],
              [122, 106, -20],
              [136, 98, 0],
            ]
              .map(([e, t, a]) => `<ellipse cx="${e}" cy="${t}" rx="9" ry="4.5" fill="#d4af37" transform="rotate(${a} ${e} ${t})"/>`)
              .join(""),
        ),
        f: $.bolt(),
      },
      anubis: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#5a3a24",
          hairStyle: "kel",
          pantsColor: "#f4f2ea",
          shoeColor: "#d4af37",
          shoeStyle: "sandalet",
          background: "#1a1206",
        }),
        hb: '<path d="M98,150 L74,272 L116,272 L118,190Z M222,150 L246,272 L204,272 L202,190Z" fill="#d4af37"/><path d="M90,190 L114,190 M86,214 L114,214 M82,238 L114,238 M230,190 L206,190 M234,214 L206,214 M238,238 L206,238" stroke="#1d3d8f" stroke-width="7"/>',
        t0: i(I("#5a3a24"), v("#f4f2ea", { y: 356, bottom: 450, w: 10 })),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 4},${e.ty + 4} Q160,350 ${e.tr - 4},${e.ty + 4} L${e.tr - 30},${e.ty - 4} Q160,310 ${e.tl + 30},${e.ty - 4}Z" fill="#d4af37"/><path d="M${e.tl + 16},${e.ty + 14} Q160,330 ${e.tr - 16},${e.ty + 14}" stroke="#1d3d8f" stroke-width="5" fill="none"/><path d="M${e.tl + 24},${e.ty + 26} Q160,342 ${e.tr - 24},${e.ty + 26}" stroke="#c81d3f" stroke-width="4" fill="none"/>`,
          w("#d4af37", 352),
        ),
        h:
          '<path d="M102,180 Q98,128 120,110 L116,30 L150,98 Q160,96 170,98 L204,30 L200,110 Q222,128 218,180 Q214,200 196,208 L176,250 Q160,258 144,250 L124,208 Q106,200 102,180Z" fill="#141414"/><path d="M120,104 L120,50 L144,98Z M200,104 L200,50 L176,98Z" fill="#d4af37"/><ellipse cx="160" cy="244" rx="12" ry="8" fill="#000"/>' +
          p(
            '<path d="M120,160 Q134,150 150,162 Q134,168 120,160Z" fill="#ffd23f"/><path d="M118,164 L104,170" stroke="#d4af37" stroke-width="3"/>',
          ) +
          '<path d="M140,206 L180,206" stroke="#2a2a2a" stroke-width="3"/>',
        f: $.ankh(),
        leg: (e, t) => (t > 100 ? `<rect x="${-e - 1}" y="${t * 0.82}" width="${e * 2 + 2}" height="8" fill="#d4af37"/>` : ""),
        cover: u,
      },
      medusa: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#a8c890",
          hairStyle: "kel",
          eyelash: "dramatic",
          eyeColor: "#ffd23f",
          eyeShape: "narrow",
          mouthShape: "smirk",
          lipColor: "#2a5a3a",
          pantsColor: "#a8c890",
          shoeColor: "#d4af37",
          shoeStyle: "sandalet",
          background: "#0a1a10",
        }),
        t0: i(y("#1d5c3a"), v("#d4af37", { y: 340, bottom: 470, w: 22 })),
        t: i(w("#d4af37", 334), p0("#ffd23f", 11), '<path d="M150,470 L160,350 L170,470" fill="#1d5c3a"/>'),
        h:
          [
            [104, 140, -150],
            [96, 176, 170],
            [100, 214, 150],
            [118, 104, -120],
            [140, 88, -100],
            [162, 84, -80],
            [184, 90, -60],
            [204, 106, -40],
            [220, 140, -20],
            [226, 176, 10],
            [220, 214, 30],
          ]
            .map(([t, a, r]) => {
              let l = (r * Math.PI) / 180,
                o = t + Math.cos(l) * 34,
                f = a + Math.sin(l) * 34,
                n = t + Math.cos(l + 0.8) * 22,
                h = a + Math.sin(l + 0.8) * 22;
              return `<path d="M${t},${a} Q${n.toFixed(1)},${h.toFixed(1)} ${o.toFixed(1)},${f.toFixed(1)}" stroke="#3a8a3a" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M${t},${a} Q${n.toFixed(1)},${h.toFixed(1)} ${o.toFixed(1)},${f.toFixed(1)}" stroke="#7ac85a" stroke-width="3" fill="none" stroke-dasharray="3 5"/><circle cx="${o.toFixed(1)}" cy="${f.toFixed(1)}" r="8" fill="#2a7a2a"/><circle cx="${(o + 2).toFixed(1)}" cy="${(f - 2).toFixed(1)}" r="1.8" fill="#ffd23f"/>`;
            })
            .join("") +
          '<path d="M100,150 Q102,104 160,100 Q218,104 220,150 Q200,120 160,118 Q120,120 100,150Z" fill="#2a7a2a"/>' +
          b0("#d4af37", "#2a7a2a", -2).replace(
            "M112,124 L118,86 L138,108 L160,76 L182,108 L202,86 L208,124 Z",
            "M116,124 L160,96 L204,124Z",
          ),
        cover: ["head"],
      },
      vikingjarl: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#f1c27d",
          hairStyle: "long",
          hairColor: "#b8501a",
          facialHair: "full",
          eyebrowShape: "thick",
          eyeColor: "#3a5f7d",
          mouthShape: "neutral",
          pantsColor: "#4a3a28",
          shoeColor: "#5a3a1a",
          shoeStyle: "bot",
          background: "#0e1620",
        }),
        b: z("#5a4a3a", "#3a2a1a"),
        t0: i(
          y("#6b5a48"),
          ({ B: e }) =>
            `<path d="M${e.tl - 10},${e.ty + 30} Q${e.tl - 14},${e.ty - 20} ${e.tl + 40},${e.ty - 12} L${e.tr - 40},${e.ty - 12} Q${e.tr + 14},${e.ty - 20} ${e.tr + 10},${e.ty + 30} Q160,${e.ty + 10} ${e.tl - 10},${e.ty + 30}Z" fill="#d8c8a8"/>${(() => {
              let t = "";
              for (let a = e.tl; a < e.tr; a += 12)
                t += `<path d="M${a},${e.ty + 4} q4,10 0,18" stroke="#b8a888" stroke-width="2" fill="none"/>`;
              return t;
            })()}`,
        ),
        t: i(
          L("#3a2a1a", "#c9ced6"),
          '<path d="M152,236 L156,276 M168,236 L164,276" stroke="#b8501a" stroke-width="8"/><circle cx="154" cy="278" r="4" fill="#c9ced6"/><circle cx="166" cy="278" r="4" fill="#c9ced6"/>',
        ),
        h:
          '<path d="M104,148 Q104,90 160,88 Q216,90 216,148Z" fill="#8e98a2"/><path d="M104,148 Q104,90 160,88" stroke="#fff" stroke-width="4" opacity=".3" fill="none"/><rect x="102" y="136" width="116" height="14" fill="#6e7882"/><path d="M160,88 L160,146" stroke="#6e7882" stroke-width="8"/><rect x="155" y="146" width="10" height="38" rx="3" fill="#6e7882"/>' +
          p('<path d="M108,126 Q72,120 64,72 Q84,104 114,108Z" fill="#f2ead8" stroke="#c8bca0" stroke-width="2"/>'),
        f: $.axe(),
        leg: m(J("#2a1a10"), x1("#d8c8a8")),
        cover: ["head"],
      },
      valkur: {
        base: d({
          gender: S,
          build: "standart",
          skin: "#ffe0c2",
          hairStyle: "braids",
          hairColor: "#f0d878",
          eyelash: "natural",
          eyeColor: "#3a5f7d",
          eyebrowShape: "angled",
          mouthShape: "neutral",
          lipColor: "#c9636b",
          pantsColor: "#3a4048",
          shoeColor: "#8e98a2",
          shoeStyle: "bot",
          background: "#0c1624",
        }),
        b: i(z("#2a6bb8", "#1a3a6b"), g0("#f4f6fa", "#c9d1da")),
        t0: y("#5a646e"),
        t: i(N("#c9d1da", "#6e7882"), D("#c9d1da"), L("#3a2a1a", "#d4af37")),
        h:
          '<path d="M104,150 Q104,92 160,90 Q216,92 216,150 L206,146 Q160,128 114,146Z" fill="#c9d1da"/><path d="M104,150 Q104,92 160,90" stroke="#fff" stroke-width="4" opacity=".4" fill="none"/><rect x="104" y="138" width="112" height="10" fill="#d4af37"/>' +
          p(
            '<path d="M106,126 Q70,104 64,60 Q80,80 90,76 Q86,96 108,110Z" fill="#fff" stroke="#c9d1da" stroke-width="2"/><path d="M100,116 Q84,100 78,80" stroke="#c9d1da" stroke-width="1.5" fill="none"/>',
          ),
        f: $.spear("#6b3f1f", "#e8eef4"),
        leg: F("#c9d1da"),
        cover: ["head"],
      },
      firavun: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#a86b3c",
          hairStyle: "kel",
          eyelash: "long",
          eyeColor: "#1a1a1a",
          eyebrowShape: "straight",
          mouthShape: "neutral",
          pantsColor: "#a86b3c",
          shoeColor: "#d4af37",
          shoeStyle: "sandalet",
          background: "#1a1206",
        }),
        hb: `<path d="M100,150 L76,272 L118,272 L116,180Z M220,150 L244,272 L202,272 L204,180Z" fill="#d4af37"/>${[180, 200, 220, 240, 260].map((e) => `<path d="M${84 - (e - 180) * 0.12},${e} L116,${e} M${236 + (e - 180) * 0.12},${e} L204,${e}" stroke="#1d3d8f" stroke-width="8"/>`).join("")}`,
        t0: i(I("#a86b3c"), v("#f4f2ea", { y: 356, bottom: 450, w: 10 })),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 4},${e.ty + 4} Q160,350 ${e.tr - 4},${e.ty + 4} L${e.tr - 30},${e.ty - 4} Q160,310 ${e.tl + 30},${e.ty - 4}Z" fill="#d4af37"/><path d="M${e.tl + 16},${e.ty + 14} Q160,330 ${e.tr - 16},${e.ty + 14}" stroke="#1d3d8f" stroke-width="5" fill="none"/><path d="M${e.tl + 26},${e.ty + 26} Q160,340 ${e.tr - 26},${e.ty + 26}" stroke="#2fae8a" stroke-width="4" fill="none"/>`,
          w("#d4af37", 352),
          '<path d="M150,366 L170,366 L166,440 L154,440Z" fill="#d4af37"/>',
        ),
        h:
          `<path d="M98,170 Q96,96 160,92 Q224,96 222,170 L210,160 Q206,128 160,124 Q114,128 110,160Z" fill="#d4af37"/>${[104, 112, 120, 128, 136, 144].map((e, t) => `<path d="M${102 + t},${e + 6} Q160,${e - 22} ${218 - t},${e + 6}" stroke="#1d3d8f" stroke-width="5" fill="none"/>`).join("")}<path d="M156,96 Q150,84 160,78 Q170,84 164,96Z" fill="#2fae8a" stroke="#d4af37" stroke-width="2"/><path d="M150,226 L170,226 L168,262 L152,262Z" fill="#1d3d8f"/><path d="M150,236 h20 M150,248 h20" stroke="#d4af37" stroke-width="3"/>` +
          p('<path d="M126,169 L114,172" stroke="#111" stroke-width="3"/>'),
        f: $.crook(),
        cover: ["head"],
      },
      poseidon: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#c68863",
          hairStyle: "long",
          hairColor: "#2a8a8a",
          facialHair: "full",
          eyebrowShape: "thick",
          eyeColor: "#2a8a8a",
          mouthShape: "neutral",
          pantsColor: "#0a4f5a",
          shoeColor: "#d4af37",
          shoeStyle: "sandalet",
          background: "#031a24",
        }),
        b: i(
          z("#0a6a7a", "#063f4a"),
          '<path d="M20,520 Q50,500 80,520 Q110,540 140,520 Q170,500 200,520 Q230,540 260,520 Q290,500 310,520" stroke="#7ff0ff" stroke-width="4" fill="none" opacity=".5"/>',
        ),
        t0: i(I("#c68863"), v("#0a6a7a", { y: 350, bottom: 460, w: 14 })),
        t: i(
          ({ B: e }) => `<path d="M${e.tl + 6},${e.ty + 10} L${e.tr - 40},380" stroke="#d4af37" stroke-width="7"/>`,
          w("#d4af37", 346),
          ({ B: e }) =>
            g(
              [
                [e.tl + 16, e.ty + 16],
                [e.tl + 30, e.ty + 30],
              ],
              5,
              "#f4f1e8",
            ),
        ),
        h: (() => {
          let e = "";
          return (
            [
              [120, 118, -20],
              [140, 108, -8],
              [160, 104, 0],
              [180, 108, 8],
              [200, 118, 20],
            ].forEach(([t, a, r], l) => {
              let o = l === 2 ? 46 : l % 2 ? 34 : 26;
              e += `<g transform="rotate(${r} ${t} ${a})"><path d="M${t},${a} L${t},${a - o}" stroke="#ff6a4a" stroke-width="7" stroke-linecap="round"/><path d="M${t},${a - o * 0.5} L${t - 10},${a - o * 0.7} M${t},${a - o * 0.7} L${t + 9},${a - o * 0.9}" stroke="#ff6a4a" stroke-width="5" stroke-linecap="round"/></g>`;
            }),
            e + '<path d="M108,122 Q160,106 212,122" stroke="#d4af37" stroke-width="7" fill="none"/>'
          );
        })(),
        f: $.trident("#d4af37"),
        cover: ["head"],
      },
      ejdersovalye: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#f1c27d",
          hairStyle: "kel",
          pantsColor: "#5a646e",
          shoeColor: "#6e7882",
          shoeStyle: "bot",
          background: "#140808",
        }),
        b: z("#7a1018", "#3a0508"),
        t0: y("#6e7882"),
        t: i(N("#aab4be", "#4a525c"), D("#aab4be"), Y("dragon", "#7a1018", "#ffd23f", 22), L("#3a2a1a", "#d4af37"), R()),
        h: `<path d="M96,176 Q92,94 160,90 Q228,94 224,176 Q224,236 190,246 L130,246 Q96,236 96,176Z" fill="#aab4be"/><path d="M96,176 Q92,94 160,90 L160,246 L130,246 Q96,236 96,176Z" fill="#fff" opacity=".18"/><path d="M114,160 L206,160 L206,170 L114,170Z" fill="#14181e"/><path d="M160,170 L160,236" stroke="#6e7882" stroke-width="5"/>${[184, 198, 212].map((e) => `<path d="M128,${e} L148,${e} M172,${e} L192,${e}" stroke="#14181e" stroke-width="3"/>`).join("")}<path d="M160,90 Q150,60 166,40 Q176,58 196,52 Q186,74 200,84 Q180,86 172,94Z" fill="#7a1018"/><rect x="134" y="240" width="52" height="34" fill="#6e7882"/>`,
        f: $.sword(),
        leg: m(F("#aab4be"), X("#6e7882")),
        cover: u,
      },
      kitsune: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#ffe0c2",
          hairStyle: "kel",
          eyelash: "dramatic",
          eyeColor: "#c9922f",
          eyeShape: "narrow",
          mouthShape: "smirk",
          lipColor: "#c81d3f",
          pantsColor: "#ffe0c2",
          shoeColor: "#c81d3f",
          shoeStyle: "sandalet",
          background: "#1a0a14",
        }),
        b: (() => {
          let e = "";
          for (let t = 0; t < 9; t++) {
            let a = -70 + t * 17.5;
            e += `<g transform="rotate(${a} 160 400)"><path d="M150,400 Q120,300 160,190 Q200,300 170,400Z" fill="#f8f4ee" stroke="#e8d8c8" stroke-width="2"/><path d="M160,190 Q150,214 152,236 Q160,230 168,236 Q170,214 160,190Z" fill="#ff8a3a"/></g>`;
          }
          return e + Q(160, 300, 150, 150, "#ff8a3a", 0.15);
        })(),
        hb: E("#f8f4ee"),
        t0: i(k0("#f8f4ee", "#c81d3f"), v("#c81d3f", { y: 340, bottom: 470, w: 20 })),
        t: w("#1a1a1a", 336),
        h:
          O("#f8f4ee") +
          u1("#f8f4ee", "#ff8a3a", 46) +
          p('<path d="M120,186 L132,180 M120,194 L132,190" stroke="#c81d3f" stroke-width="2.5" stroke-linecap="round"/>') +
          '<g transform="translate(206,124) rotate(24)"><ellipse rx="22" ry="26" fill="#fff" stroke="#e8d8c8"/><path d="M-20,-10 L-26,-38 L-6,-22Z M20,-10 L26,-38 L6,-22Z" fill="#fff"/><path d="M-14,-4 Q-8,-10 -2,-4 M2,-4 Q8,-10 14,-4" stroke="#c81d3f" stroke-width="3" fill="none"/><circle cy="10" r="3" fill="#c81d3f"/></g>',
        f: `${Q(270, 300, 30, 30, "#4ab8ff", 0.6)}<path d="M270,322 Q250,300 262,280 Q266,296 278,290 Q276,276 270,268 Q292,282 286,306 Q282,320 270,322Z" fill="#7ad8ff"/>`,
      },
      keloglan: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#ffdbb0",
          hairStyle: "kel",
          faceShape: "round",
          eyeShape: "round",
          eyebrowShape: "arched",
          mouthShape: "smile",
          noseShape: "button",
          pantsColor: "#2a4a8a",
          shoeColor: "#c81d3f",
          shoeStyle: "klasik",
          background: "#1a2a10",
        }),
        t0: i(
          y("#f4f2ea"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 20} Q${e.tl},${e.ty - 2} ${e.tl + 24},${e.ty - 2} L146,${e.ty - 2} L150,360 L${e.tl},360Z M${e.tr},${e.ty + 20} Q${e.tr},${e.ty - 2} ${e.tr - 24},${e.ty - 2} L174,${e.ty - 2} L170,360 L${e.tr},360Z" fill="#8a3a1a"/><rect x="${e.tl + 14}" y="300" width="22" height="20" fill="#d8a020" transform="rotate(-8 ${e.tl + 25} 310)"/><rect x="${e.tr - 40}" y="320" width="20" height="18" fill="#2a8a4a" transform="rotate(10 ${e.tr - 30} 329)"/><path d="M${e.tl + 14},300 l22,20 M${e.tr - 40},320 l20,18" stroke="#5a2a10" stroke-width="1" stroke-dasharray="3 2"/>`,
        ),
        t: i(w("#c81d3f", 350), '<path d="M150,262 L160,276 L170,262" stroke="#d8d4c6" stroke-width="3" fill="none"/>'),
        h:
          '<ellipse cx="140" cy="122" rx="20" ry="10" fill="#fff" opacity=".5"/><ellipse cx="136" cy="118" rx="8" ry="4" fill="#fff" opacity=".7"/>' +
          p('<circle cx="124" cy="196" r="9" fill="#ff9a9a" opacity=".35"/>'),
        leg: L0("#2a4a8a"),
      },
      nasreddinhoca: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#e0ac69",
          hairStyle: "kel",
          hairColor: "#c9c9c9",
          facialHair: "full",
          eyebrowShape: "thick",
          eyeShape: "hooded",
          mouthShape: "smile",
          pantsColor: "#5a4a3a",
          shoeColor: "#8a3a1a",
          shoeStyle: "klasik",
          background: "#2a1e0a",
        }),
        t0: i(G("#2e6b3a", "#e8dcb8", { bottom: 500, lapel: "#24552e" })),
        t: i(w("#c8a050", 350), '<path d="M140,350 L180,350 L176,500 L144,500Z" fill="#e8dcb8"/>'),
        h: '<ellipse cx="160" cy="98" rx="76" ry="40" fill="#f4f1e8"/><path d="M90,110 Q160,70 230,110 M88,96 Q160,56 232,96 M96,80 Q160,46 224,80" stroke="#d8d0bc" stroke-width="4" fill="none"/><path d="M84,102 Q160,138 236,102 L234,112 Q160,146 86,112Z" fill="#e8e0cc"/><ellipse cx="160" cy="62" rx="28" ry="18" fill="#2e6b3a"/><ellipse cx="152" cy="56" rx="10" ry="5" fill="#fff" opacity=".2"/>',
        f: $.pot(),
        cover: ["head"],
      },
      karagoz: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#e8b080",
          hairStyle: "kel",
          hairColor: "#0d0a08",
          facialHair: "full",
          faceShape: "round",
          eyeShape: "round",
          eyebrowShape: "thick",
          mouthShape: "open",
          noseShape: "aquiline",
          pantsColor: "#2a6bb8",
          shoeColor: "#c81d3f",
          shoeStyle: "klasik",
          background: "#3a2a10",
        }),
        b: '<rect x="0" y="0" width="320" height="580" fill="#f6e8b8" opacity=".12"/>',
        t0: i(
          y("#c81d3f"),
          ({ B: e }) =>
            `<path d="M${e.tl + 20},${e.ty + 20} L${e.tl + 20},370 M${e.tr - 20},${e.ty + 20} L${e.tr - 20},370" stroke="#ffd23f" stroke-width="4" stroke-dasharray="2 8"/>${g(
              [
                [120, 300],
                [200, 300],
                [120, 340],
                [200, 340],
                [160, 320],
              ],
              5,
              "#f6e8b8",
              0.7,
            )}`,
        ),
        t: i(w("#2a8a4a", 350), '<path d="M120,264 Q160,300 200,264" stroke="#ffd23f" stroke-width="4" fill="none"/>'),
        h: `<path d="M110,128 Q100,70 150,56 Q190,50 214,80 Q226,98 210,128Z" fill="#c81d3f"/><path d="M110,128 L210,128" stroke="#ffd23f" stroke-width="7"/><path d="M150,56 Q186,40 200,64" stroke="#2a8a4a" stroke-width="6" fill="none"/>${g(
          [
            [140, 90],
            [170, 80],
            [190, 100],
            [126, 110],
          ],
          4,
          "#ffd23f",
        )}<path d="M98,190 Q100,262 160,268 Q220,262 222,190 Q206,236 160,234 Q114,236 98,190Z" fill="#0d0a08"/>`,
        leg: L0("#2a6bb8"),
        cover: ["head"],
      },
      hacivat: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#f0c890",
          hairStyle: "kel",
          hairColor: "#3a2a1a",
          facialHair: "goatee",
          faceShape: "long",
          eyeShape: "narrow",
          eyebrowShape: "arched",
          mouthShape: "smirk",
          noseShape: "aquiline",
          pantsColor: "#5a2a6b",
          shoeColor: "#d4af37",
          shoeStyle: "klasik",
          background: "#3a2a10",
        }),
        b: '<rect x="0" y="0" width="320" height="580" fill="#f6e8b8" opacity=".12"/>',
        t0: i(G("#2a8a6a", "#e8c860", { bottom: 470, lapel: "#1d6a4a" })),
        t: i(
          w("#c81d3f", 348),
          g(
            [
              [136, 300],
              [184, 300],
              [136, 400],
              [184, 400],
            ],
            4,
            "#ffd23f",
          ),
        ),
        h: '<path d="M118,128 L126,40 Q160,28 194,40 L202,128Z" fill="#f4f1e8"/><path d="M122,96 L198,96 M124,70 L196,70" stroke="#d8d0bc" stroke-width="4"/><path d="M110,128 Q160,108 210,128 L210,140 Q160,120 110,140Z" fill="#2a8a6a"/><path d="M152,222 Q160,268 168,222Z" fill="#3a2a1a"/>',
        leg: L0("#5a2a6b"),
        cover: ["head"],
      },
      dedekorkut: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#e0ac69",
          hairStyle: "long",
          hairColor: "#eef0f4",
          facialHair: "full",
          eyebrowShape: "thick",
          eyeShape: "hooded",
          mouthShape: "neutral",
          pantsColor: "#4a3a28",
          shoeColor: "#5a3a1a",
          shoeStyle: "bot",
          background: "#1a1408",
        }),
        b: z("#5a3a20", "#3a2410"),
        t0: i(G("#8a5a2b", "#c8a050", { bottom: 470, lapel: "#6b4220" })),
        t: i(w("#c81d3f", 348), '<path d="M140,236 Q160,340 180,236 Q186,320 160,370 Q134,320 140,236Z" fill="#eef0f4"/>'),
        h: `<path d="M104,132 Q98,74 160,70 Q222,74 216,132Z" fill="#3a2a1a"/>${(() => {
          let e = "";
          for (let t = 108; t < 214; t += 10)
            for (let a = 82; a < 130; a += 10) e += `<path d="M${t},${a} q4,-4 8,0" stroke="#5a4a3a" stroke-width="2" fill="none"/>`;
          return e;
        })()}<rect x="100" y="124" width="120" height="14" rx="6" fill="#5a4a3a"/>`,
        f: $.kopuz(),
        cover: ["head"],
      },
      yeniceri: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#e0ac69",
          hairStyle: "kel",
          hairColor: "#1a1410",
          facialHair: "mustache",
          eyebrowShape: "thick",
          mouthShape: "thin",
          pantsColor: "#2a4a8a",
          shoeColor: "#c8a020",
          shoeStyle: "bot",
          background: "#1a0606",
        }),
        hb: '<path d="M196,40 Q262,70 246,290 L226,290 Q236,96 188,66Z" fill="#f4f1e8"/><path d="M226,290 L246,290" stroke="#d8d0bc" stroke-width="4"/>',
        t0: i(G("#b8141e", "#2a4a8a", { bottom: 470, lapel: "#8a0a14" })),
        t: i(
          w("#d4af37", 348),
          g(
            [
              [148, 290],
              [148, 310],
              [148, 330],
              [172, 290],
              [172, 310],
              [172, 330],
            ],
            3.5,
            "#d4af37",
          ),
        ),
        h: '<path d="M118,128 L114,36 Q160,18 206,36 L202,128Z" fill="#f4f1e8"/><path d="M114,36 Q160,18 206,36" stroke="#fff" stroke-width="4" fill="none"/><path d="M200,40 L202,128" stroke="#d8d0bc" stroke-width="6"/><rect x="112" y="116" width="96" height="16" fill="#d4af37"/><path d="M146,116 L146,60 Q146,50 160,48 Q174,50 174,60 L174,116Z" fill="#d4af37"/><path d="M152,108 L152,70 Q152,60 160,60 Q168,60 168,70 L168,108Z" fill="#b8901a"/><ellipse cx="160" cy="62" rx="5" ry="7" fill="#f4f1e8"/>',
        f: $.yatagan(),
        leg: (e, t) =>
          t > 100 ? `<rect x="${-e - 2}" y="${t * 0.64}" width="${e * 2 + 4}" height="${t * 0.36 + 2}" rx="4" fill="#c8a020"/>` : "",
        cover: ["head"],
      },
      gokturkalp: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#d8a070",
          hairStyle: "kel",
          hairColor: "#1a1410",
          facialHair: "mustache",
          eyeShape: "narrow",
          eyebrowShape: "angled",
          mouthShape: "thin",
          pantsColor: "#3a2a1a",
          shoeColor: "#5a3a1a",
          shoeStyle: "bot",
          background: "#0c1624",
        }),
        b: i(
          z("#1d3d6b", "#0a1a3a"),
          F0,
          '<g transform="translate(46,120)"><rect x="-3" y="0" width="6" height="440" fill="#5a3a1a"/><path d="M3,6 L70,10 Q62,30 70,50 L3,46Z" fill="#2a6bb8"/><path d="M20,40 L24,22 L30,32 L38,20 L42,40 Q34,44 30,38 Q26,46 20,40Z" fill="#d4af37"/><circle cx="0" cy="-4" r="6" fill="#d4af37"/></g>',
        ),
        t0: y("#3a3020"),
        t: i(y0("#aab4be", "#4a525c"), w("#2a6bb8", 350), D("#8e98a2")),
        h:
          p(
            `<path d="M104,140 L98,236 Q124,254 140,238 L136,150Z" fill="#8e98a2"/>${g(
              [
                [106, 160],
                [114, 180],
                [106, 200],
                [120, 214],
                [112, 228],
                [126, 170],
                [128, 196],
              ],
              2.4,
              "#5a646e",
            )}`,
          ) +
          '<path d="M104,148 Q108,80 160,38 Q212,80 216,148Z" fill="#aab4be"/><path d="M104,148 Q108,80 160,38" stroke="#fff" stroke-width="4" opacity=".35" fill="none"/><path d="M160,38 L160,148" stroke="#6e7882" stroke-width="3"/><rect x="100" y="138" width="120" height="12" fill="#d4af37"/><rect x="156" y="148" width="8" height="40" rx="3" fill="#8e98a2"/><path d="M160,38 L160,20" stroke="#d4af37" stroke-width="4"/><path d="M160,22 Q176,10 186,22 Q172,22 160,30Z" fill="#c81d3f"/>',
        f: $.bow("#5a3a1a"),
        leg: m(M("#5a3a1a", 0.56, "#d4af37")),
        cover: ["head"],
      },
      zeybek: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#d8a070",
          hairStyle: "kel",
          hairColor: "#1a1410",
          facialHair: "horseshoe",
          eyebrowShape: "thick",
          mouthShape: "smirk",
          pantsColor: "#1d2a4a",
          shoeColor: "#1a1410",
          shoeStyle: "bot",
          background: "#0a1a24",
        }),
        t0: i(
          y("#f4f1e8"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 20} Q${e.tl},${e.ty - 2} ${e.tl + 24},${e.ty - 2} L144,${e.ty - 2} L140,330 L${e.tl},330Z M${e.tr},${e.ty + 20} Q${e.tr},${e.ty - 2} ${e.tr - 24},${e.ty - 2} L176,${e.ty - 2} L180,330 L${e.tr},330Z" fill="#1d2a4a"/><path d="M${e.tl + 6},${e.ty + 10} L${e.tl + 6},326 M${e.tr - 6},${e.ty + 10} L${e.tr - 6},326 M144,${e.ty} L140,326 M176,${e.ty} L180,326" stroke="#d4af37" stroke-width="3"/>`,
        ),
        t: i(
          ({ B: e }) =>
            `<rect x="${e.tl - 2}" y="330" width="${e.tr - e.tl + 4}" height="52" fill="#c81d3f"/>${[340, 352, 364, 376].map((t) => `<path d="M${e.tl},${t} L${e.tr},${t}" stroke="#8a0a14" stroke-width="2"/>`).join("")}`,
          '<g transform="translate(176,320) rotate(70)"><path d="M0,-4 Q50,-16 90,4 Q50,-4 0,4Z" fill="#dfe6ee"/><path d="M-30,-5 L0,-5 L0,5 L-30,5 Q-36,0 -30,-5Z" fill="#e8e0c8"/></g><rect x="128" y="334" width="12" height="44" rx="3" fill="#3a2a1a" transform="rotate(-12 134 356)"/>',
        ),
        h: `<path d="M128,124 L132,40 Q160,32 188,40 L192,124Z" fill="#b8141e"/><path d="M106,126 Q160,100 214,126 L214,142 Q160,118 106,142Z" fill="#2a8a4a"/><path d="M110,118 Q160,92 210,118" stroke="#ffd23f" stroke-width="4" fill="none" stroke-dasharray="6 4"/>${(() => {
          let e = "";
          for (let t = 108; t <= 212; t += 7) {
            let a = 140 - Math.abs(t - 160) * 0.12;
            e += `<path d="M${t},${a} l0,12" stroke="#ffd23f" stroke-width="2.5"/><circle cx="${t}" cy="${a + 13}" r="2" fill="#ffd23f"/>`;
          }
          return e;
        })()}<path d="M188,44 Q220,40 230,76 Q236,104 224,120" stroke="#2a8a4a" stroke-width="8" fill="none"/>`,
        leg: (e, t) =>
          `<path d="M${-e - 4},0 Q${-e - 10},${t * 0.3} ${-e - 2},${t * 0.5} L${e + 2},${t * 0.5} Q${e + 10},${t * 0.3} ${e + 4},0Z" fill="#1d2a4a"/>` +
          (t > 100
            ? `<rect x="${-e - 1}" y="${t * 0.5}" width="${e * 2 + 2}" height="${t * 0.5 + 2}" fill="#f4f1e8"/><path d="M${-e},${t * 0.6} L${e},${t * 0.6} M${-e},${t * 0.72} L${e},${t * 0.72} M${-e},${t * 0.84} L${e},${t * 0.84}" stroke="#c81d3f" stroke-width="2"/>`
            : ""),
        cover: ["head"],
      },
      siberninja: {
        base: d({
          gender: k,
          build: "zayif",
          skin: "#e0ac69",
          hairStyle: "kel",
          pantsColor: "#0d0d14",
          shoeColor: "#0d0d14",
          shoeStyle: "bot",
          background: "#14041a",
        }),
        b: T("#ff2e88", 0.25),
        t0: y("#101018"),
        t: i(
          ({ B: e }) =>
            `<path d="M${e.tl + 8},${e.ty + 20} L130,320 L130,380 M${e.tr - 8},${e.ty + 20} L190,320 L190,380 M130,320 L190,320" stroke="#ff2e88" stroke-width="3" fill="none"/>${Q(160, 320, 40, 8, "#ff2e88", 0.6)}`,
          L("#0d0d14", "#ff2e88"),
        ),
        h:
          $0("#101018") +
          `<path d="M106,150 Q160,138 214,150 L212,176 Q160,166 108,176Z" fill="#1a0a1e"/><path d="M110,162 Q160,150 210,162" stroke="#ff2e88" stroke-width="5" fill="none"/>${Q(160, 162, 60, 12, "#ff2e88", 0.6)}<path d="M120,210 L200,210 M126,222 L194,222" stroke="#ff2e88" stroke-width="2" opacity=".7"/>`,
        f: $.laserKatana("#ff2e88"),
        leg: m(U("#ff2e88")),
        cover: u,
      },
      pikselmaske: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#e0ac69",
          hairStyle: "kel",
          pantsColor: "#1a1a22",
          shoeColor: "#22d3ee",
          shoeStyle: "spor",
          background: "#04141a",
        }),
        t0: i(
          y("#1a1a22"),
          '<path d="M120,262 Q160,286 200,262 L200,274 Q160,300 120,274 Z" fill="#101016"/><path d="M148,266 L152,320 M172,266 L168,320" stroke="#22d3ee" stroke-width="3"/><rect x="128" y="330" width="64" height="30" rx="4" fill="#101016"/>',
        ),
        t: '<text x="160" y="312" font-size="14" font-family="monospace" font-weight="700" text-anchor="middle" fill="#22d3ee">&lt;/&gt;</text>',
        hb: r0("#1a1a22"),
        h:
          l0("#1a1a22", "#22d3ee") +
          '<rect x="116" y="140" width="88" height="96" rx="12" fill="#060608"/>' +
          (() => {
            let e = (a, r, l) => `<rect x="${124 + a * 8}" y="${148 + r * 8}" width="7" height="7" fill="${l}"/>`,
              t = "";
            return (
              [
                [1, 2],
                [2, 2],
                [7, 2],
                [8, 2],
                [1, 3],
                [2, 3],
                [7, 3],
                [8, 3],
              ].forEach(([a, r]) => (t += e(a, r, "#22d3ee"))),
              [
                [1, 7],
                [2, 8],
                [3, 9],
                [4, 9],
                [5, 9],
                [6, 9],
                [7, 8],
                [8, 7],
              ].forEach(([a, r]) => (t += e(a, r, "#ff2e88"))),
              t + Q(160, 186, 50, 50, "#22d3ee", 0.25)
            );
          })(),
        f: '<g transform="translate(236,300) rotate(-8)"><rect width="22" height="40" rx="4" fill="#111"/><rect x="2" y="4" width="18" height="30" fill="#0a2a2a"/><path d="M5,10 h10 M5,16 h6 M5,22 h12" stroke="#22d3ee" stroke-width="2"/></g>',
        cover: u,
      },
      neonsamuray: {
        base: d({
          gender: k,
          build: "standart",
          skin: "#f1c27d",
          hairStyle: "kel",
          pantsColor: "#1a1e26",
          shoeColor: "#eef3f8",
          shoeStyle: "bot",
          background: "#041420",
        }),
        b: T("#22d3ee", 0.28),
        t0: y("#1a1e26"),
        t: i(y0("#eef3f8", "#22d3ee"), D("#eef3f8"), w("#22d3ee", 350), `${Q(160, 357, 80, 8, "#22d3ee", 0.5)}`),
        h: `<path d="M98,150 Q98,86 160,84 Q222,86 222,150Z" fill="#eef3f8"/><path d="M98,140 L66,196 L100,190 L104,150Z M222,140 L254,196 L220,190 L216,150Z" fill="#eef3f8" stroke="#22d3ee" stroke-width="2.5"/><path d="M106,72 Q160,124 214,72 Q196,116 160,118 Q124,116 106,72Z" fill="none" stroke="#22d3ee" stroke-width="5"/>${Q(160, 100, 50, 26, "#22d3ee", 0.5)}<path d="M108,176 Q160,166 212,176 L208,236 Q160,250 112,236Z" fill="#1a1e26"/><path d="M118,190 L148,190 M172,190 L202,190" stroke="#22d3ee" stroke-width="4"/>${p('<path d="M120,166 L150,162" stroke="#22d3ee" stroke-width="5" stroke-linecap="round"/>')}${[204, 216, 228].map((e) => `<path d="M130,${e} L190,${e}" stroke="#2a3a48" stroke-width="3"/>`).join("")}`,
        f: $.laserKatana("#22d3ee"),
        leg: m(F("#eef3f8"), U("#22d3ee")),
        cover: u,
      },
      hologramdj: {
        base: d({
          gender: S,
          build: "zayif",
          skin: "#8d5524",
          hairStyle: "afro",
          hairColor: "#b44cff",
          eyelash: "long",
          mouthShape: "smile",
          lipColor: "#ff2e88",
          pantsColor: "#1a1a22",
          shoeColor: "#f4f4f4",
          shoeStyle: "spor",
          background: "#140a24",
        }),
        b: '<path d="M20,500 L20,420 M40,500 L40,380 M60,500 L60,440 M260,500 L260,400 M280,500 L280,360 M300,500 L300,430" stroke="#22d3ee" stroke-width="8" opacity=".5" stroke-linecap="round"/>',
        t0: i(
          y("#b8c8ff"),
          ({ B: e }) =>
            `<path d="M${e.tl},${e.ty + 30} L${e.tr},${e.ty + 70} M${e.tl},${e.ty + 70} L${e.tr},${e.ty + 30}" stroke="#ff9ad5" stroke-width="18" opacity=".45"/><path d="M${e.tl + 6},${e.ty + 30} L${e.tr - 6},340" stroke="#7ff0ff" stroke-width="10" opacity=".4"/>`,
        ),
        t: '<path d="M150,262 L160,320 L170,262" stroke="#1a1a22" stroke-width="4" fill="none"/>',
        h:
          '<path d="M98,170 Q98,92 160,90 Q222,92 222,170" stroke="#1a1a22" stroke-width="10" fill="none"/>' +
          p(
            '<rect x="82" y="148" width="28" height="48" rx="12" fill="#1a1a22"/><rect x="88" y="156" width="16" height="32" rx="7" fill="#ff2e88"/>',
          ) +
          y1("#22d3ee", 0.75),
        f: $.mic(),
        cover: ["head", "face"],
      },
      siberbaba: {
        base: d({
          gender: k,
          build: "iri",
          skin: "#e0ac69",
          hairStyle: "slick",
          hairColor: "#c9c9c9",
          facialHair: "vandyke",
          eyebrowShape: "thick",
          mouthShape: "smirk",
          clothing: "suit",
          clothColor: "#e8e6df",
          neckAcc: "tie",
          pantsColor: "#e8e6df",
          shoeColor: "#1a1a1a",
          shoeStyle: "klasik",
          background: "#14040a",
        }),
        t: i(
          '<path d="M154,262 L166,262 L172,304 L160,322 L148,304 Z" fill="#c81d3f"/>',
          ({ B: e }) =>
            `<path d="M${e.tl + 20},${e.ty + 30} L${e.tl + 40},${e.ty + 30} L${e.tl + 46},${e.ty + 50}" stroke="#ff2e88" stroke-width="2" fill="none" opacity=".8"/>`,
        ),
        h:
          `<path d="M160,104 Q216,106 218,170 Q218,226 160,236Z" fill="#aab4be"/><path d="M160,104 Q216,106 218,170 Q218,226 160,236" stroke="#6e7882" stroke-width="3" fill="none"/><path d="M168,130 L210,140 M166,200 L206,190 M172,150 L172,190" stroke="#6e7882" stroke-width="2"/><ellipse cx="190" cy="148" rx="20" ry="8" fill="#e8eef4" opacity=".3"/><circle cx="182" cy="169" r="11" fill="#1a0a0a"/><circle cx="182" cy="169" r="6" fill="#ff2020"/>${Q(182, 169, 22, 22, "#ff2020", 0.6)}<rect x="214" y="160" width="12" height="24" rx="3" fill="#6e7882"/>` +
          $.cigar(),
        cover: ["face"],
      },
    };
  function _0(e) {
    return typeof e != "string" || !Object.prototype.hasOwnProperty.call(o0, e) ? null : o0[e];
  }
  var m1 = [
      "#0d0d0d",
      "#f4f4f4",
      "#9aa4b2",
      "#d4af37",
      "#c81d3f",
      "#ff6a1a",
      "#ffd23f",
      "#4ade80",
      "#1d7a42",
      "#22d3ee",
      "#2a6bff",
      "#1d2a6b",
      "#b44cff",
      "#ff2e88",
      "#8a5a2b",
      "#5c1a24",
    ],
    w1 = [
      "#0d0a08",
      "#2b2118",
      "#5c3a21",
      "#8a6a3a",
      "#e8d98a",
      "#b0b0b0",
      "#f4f4f4",
      "#c81d3f",
      "#ff6a1a",
      "#ff2e88",
      "#b44cff",
      "#22d3ee",
      "#2a6bff",
      "#4ade80",
    ],
    Q1 = ["Sa\xE7", "Sakal"],
    D0 = (e) => (Q1.includes(e) ? w1 : m1),
    f0 = {
      volt: [
        ["Kost\xFCm", "#14161f"],
        ["I\u015F\u0131k", "#22d3ee"],
      ],
      gecekartali: [
        ["Kost\xFCm", "#123a34"],
        ["Mi\u011Ffer", "#e8eef4"],
        ["Detay", "#c81d3f"],
      ],
      alevkralice: [
        ["Sa\xE7", "#ff4d1a", "#ffb42a", "#ff6a1a"],
        ["Kost\xFCm", "#a3201a"],
        ["Maske", "#d4af37"],
      ],
      buzmuhafiz: [["Buz", "#7fb8dc"]],
      dalgakaptani: [
        ["Kost\xFCm", "#0e6e7a"],
        ["I\u015F\u0131k", "#7ff0ff"],
        ["Sa\xE7", "#e8f6ff"],
      ],
      kuantum: [
        ["Kost\xFCm", "#3b1a6b"],
        ["I\u015F\u0131k", "#e879f9"],
      ],
      golgehancer: [["Kost\xFCm", "#2a1a3a"]],
      demirtitan: [
        ["Z\u0131rh", "#eef3f6"],
        ["I\u015F\u0131k", "#2ee6d6"],
      ],
      yildiztozu: [
        ["Kost\xFCm", "#2a1a6b"],
        ["Sa\xE7", "#f4c6ff"],
        ["Y\u0131ld\u0131z", "#ffd23f"],
      ],
      kasirga: [
        ["Kost\xFCm", "#3d5a4a"],
        ["R\xFCzg\xE2r", "#9fe0c0"],
        ["Sa\xE7", "#e8d98a"],
      ],
      kozmikmuhafiz: [
        ["Alt\u0131n", "#d4af37"],
        ["Kost\xFCm", "#151515"],
      ],
      miknatis: [
        ["Kost\xFCm", "#c9ced6"],
        ["Pembe", "#ff2e88"],
      ],
      zirhlibozkurt: [
        ["Z\u0131rh", "#20b2aa"],
        ["Kost\xFCm", "#1a5a64"],
        ["K\xFCrk", "#cfd8dc"],
      ],
      isikhizi: [
        ["Kost\xFCm", "#f6f3ea"],
        ["Alt\u0131n", "#d4af37"],
        ["Sa\xE7", "#ffffff"],
      ],
      kumfirtinasi: [
        ["Kum", "#d9b06a"],
        ["Deri", "#5a4020"],
      ],
      lalemuhafizi: [
        ["Kost\xFCm", "#8e1330"],
        ["Alt\u0131n", "#d4af37"],
        ["Sa\xE7", "#0d0a08"],
      ],
      karakusak: [
        ["Kimono", "#f4f2ea"],
        ["Ku\u015Fak", "#141414"],
        ["Sa\xE7", "#0d0a08"],
      ],
      kungfu: [
        ["G\xF6mlek", "#b8141e"],
        ["Sa\xE7", "#0d0a08"],
      ],
      boksor: [
        ["\u015Eort", "#c81d3f"],
        ["Sa\xE7", "#0d0a08"],
      ],
      ejderyumruk: [
        ["Aura", "#ff3b3b"],
        ["Kimono", "#1a1a1a"],
        ["Sa\xE7", "#f4f4f4"],
      ],
      ninja: [
        ["Kost\xFCm", "#1b1b1f"],
        ["Bant", "#8a1d1d"],
      ],
      kunoichi: [
        ["Kost\xFCm", "#3a2258"],
        ["I\u015F\u0131k", "#b44cff"],
      ],
      samuray: [
        ["Z\u0131rh", "#7a1018"],
        ["Alt\u0131n", "#d4af37"],
      ],
      baspehlivan: [
        ["K\u0131spet", "#2b1a10"],
        ["Kemer", "#d4af37"],
      ],
      sumo: [
        ["Ku\u015Fak", "#1d2a4a"],
        ["Sa\xE7", "#0d0a08"],
      ],
      sokakdovuscusu: [
        ["Kap\xFC\u015Fon", "#4a4d55"],
        ["Bandana", "#c81d3f"],
        ["Sa\xE7", "#1a1410"],
      ],
      lucha: [
        ["Maske", "#e01b84"],
        ["Desen", "#ffd23f"],
        ["\xC7izgi", "#2ad4ff"],
      ],
      shaolin: [
        ["C\xFCbbe", "#f08a24"],
        ["Ku\u015Fak", "#c81d3f"],
      ],
      ruzgarkilici: [
        ["Haori", "#1a1a22"],
        ["Astar", "#c81d3f"],
        ["Sa\xE7", "#eef2f6"],
      ],
      ringkralicesi: [
        ["Alt\u0131n", "#d4af37"],
        ["Sa\xE7", "#1a1410"],
      ],
      atesperisi: [
        ["Kanat", "#ff7a2a"],
        ["Elbise", "#c8321a"],
        ["Sa\xE7", "#3a0f0a"],
      ],
      superisi: [
        ["Kanat", "#5ae3ff"],
        ["Elbise", "#0f8f9a"],
        ["Sa\xE7", "#1aa7a0"],
      ],
      ormanperisi: [
        ["Kanat", "#8fd36a"],
        ["Elbise", "#2f7a3a"],
        ["Sa\xE7", "#6b3a1a"],
      ],
      ayperisi: [
        ["Kanat", "#c9b8f0"],
        ["Elbise", "#5b4a9a"],
        ["Sa\xE7", "#d8dce8"],
      ],
      safakperisi: [
        ["Kanat", "#ffb3c8"],
        ["Elbise", "#f28aa0"],
        ["Sa\xE7", "#f6e2b8"],
      ],
      kristalprenses: [
        ["Elbise", "#8fc8f0"],
        ["Sa\xE7", "#f4f8ff"],
      ],
      yildizbuyucusu: [
        ["C\xFCbbe", "#1d2a6b"],
        ["Y\u0131ld\u0131z", "#ffd23f"],
        ["Sakal", "#eef0f4"],
      ],
      karabuyucu: [
        ["C\xFCbbe", "#1a0f28"],
        ["B\xFCy\xFC", "#9b30ff"],
      ],
      kelebekkralice: [["Kanat", "#ff8a1a"]],
      elfokcu: [
        ["Pelerin", "#1d5c2a"],
        ["K\u0131yafet", "#2f6b2a"],
        ["Sa\xE7", "#c43a1a"],
      ],
      yesilgezgin: [
        ["Ten", "#7bd36a"],
        ["Tulum", "#c9d0d8"],
      ],
      kristaluzayli: [
        ["Kristal", "#7fc8ff"],
        ["K\u0131yafet", "#eef3f8"],
      ],
      tentakul: [
        ["Ten", "#8a5ac8"],
        ["Ceket", "#2a1a40"],
        ["G\xF6z", "#c8f04a"],
      ],
      lavagolemi: [
        ["Lav", "#ff7a1a"],
        ["Kaya", "#2a2224"],
      ],
      tenekerobot: [
        ["G\xF6vde", "#aab4be"],
        ["I\u015F\u0131k", "#ffd23f"],
      ],
      androidx: [
        ["G\xF6vde", "#eef2f6"],
        ["I\u015F\u0131k", "#22a8ee"],
      ],
      astronot: [
        ["Tulum", "#eef0f2"],
        ["Detay", "#ff8a1f"],
        ["Sa\xE7", "#5c3a21"],
      ],
      galaksikorsani: [
        ["Ten", "#4a8ad8"],
        ["Ceket", "#2a1a3a"],
        ["Sa\xE7", "#ff2e88"],
      ],
      mechpilot: [
        ["Tulum", "#f08a24"],
        ["Sa\xE7", "#1a1410"],
      ],
      superteyze: [
        ["Pelerin", "#e0115f"],
        ["H\u0131rka", "#ff9ac0"],
        ["Sa\xE7", "#c9c9cf"],
      ],
      kurnaztilki: [
        ["K\xFCrk", "#e8782a"],
        ["Yelek", "#2f6b3a"],
      ],
      uykucupanda: [
        ["Desen", "#15151a"],
        ["Tulum", "#f7f7f5"],
      ],
      cilginbilim: [
        ["\u0130ksir", "#4ade80"],
        ["Kravat", "#c81d3f"],
        ["Sa\xE7", "#f4f4f4"],
      ],
      kopekbaligi: [["K\xF6pekbal\u0131\u011F\u0131", "#5a6e86"]],
      dinozor: [
        ["Dino", "#4caf50"],
        ["Diken", "#ffd23f"],
      ],
      kartonrobot: [["Karton", "#c8945a"]],
      palyaco: [
        ["Tulum", "#7ad8ff"],
        ["Pantolon", "#b44cff"],
      ],
      morcanavar: [["T\xFCy", "#8a5ac8"]],
      hamburger: [["Pantolon", "#c81d3f"]],
      korsankaptan: [
        ["Ceket", "#9a1a1a"],
        ["Sa\xE7", "#0d0a08"],
      ],
      kovboy: [
        ["G\xF6mlek", "#c0602a"],
        ["\u015Eapka", "#8a5a2b"],
        ["Sa\xE7", "#5c3a21"],
      ],
      gizliajan: [
        ["Tak\u0131m", "#2b2b33"],
        ["Sa\xE7", "#2b2118"],
      ],
      gladyator: [["Bronz", "#b8742a"]],
      spartali: [
        ["Pelerin", "#9a1414"],
        ["Bronz", "#c8902a"],
      ],
      uzaykomando: [
        ["Z\u0131rh", "#eef0f2"],
        ["Detay", "#ff8a1f"],
      ],
      colkasifi: [
        ["G\xF6mlek", "#c8b88a"],
        ["Sa\xE7", "#8a6a3a"],
      ],
      kiyamet: [
        ["Deri", "#4a3a2a"],
        ["Sa\xE7", "#c81d3f"],
      ],
      rockyildizi: [
        ["Gitar", "#c81d3f"],
        ["Sa\xE7", "#0d0d0d"],
      ],
      sihirbaz: [
        ["Astar", "#b8141e"],
        ["Sa\xE7", "#0d0a08"],
      ],
      mafyababasi: [
        ["Tak\u0131m", "#1a1d26"],
        ["G\xFCl", "#c81d3f"],
        ["Sa\xE7", "#b0b0b0"],
      ],
      kontvlad: [
        ["Astar", "#8a0a1a"],
        ["Sa\xE7", "#0d0a08"],
      ],
      kurtadam: [
        ["K\xFCrk", "#5a4030"],
        ["Pantolon", "#2b3550"],
      ],
      zombi: [
        ["Ten", "#8aa880"],
        ["Tak\u0131m", "#4a4a52"],
      ],
      iskeletkral: [
        ["C\xFCbbe", "#4a1a7a"],
        ["Ta\xE7", "#d4af37"],
      ],
      kabakkafa: [
        ["Kabak", "#f08a1a"],
        ["G\xF6mlek", "#5a7a3a"],
      ],
      cadi: [
        ["Elbise", "#24203a"],
        ["Sa\xE7", "#6b3fa0"],
      ],
      mumya: [["G\xF6z", "#7ff0a0"]],
      olummelegi: [["G\xF6z", "#ff4a4a"]],
      zeus: [
        ["\u015Eim\u015Fek", "#ffe14a"],
        ["Sa\xE7", "#f2f2f2"],
      ],
      anubis: [
        ["Alt\u0131n", "#d4af37"],
        ["Desen", "#1d3d8f"],
      ],
      medusa: [
        ["Y\u0131lan", "#3a8a3a"],
        ["Elbise", "#1d5c3a"],
      ],
      vikingjarl: [
        ["Pelerin", "#5a4a3a"],
        ["Sa\xE7", "#b8501a"],
      ],
      valkur: [
        ["Pelerin", "#2a6bb8"],
        ["Sa\xE7", "#f0d878"],
      ],
      firavun: [
        ["Alt\u0131n", "#d4af37"],
        ["Desen", "#1d3d8f"],
      ],
      poseidon: [
        ["Pelerin", "#0a6a7a"],
        ["Mercan", "#ff6a4a"],
        ["Sa\xE7", "#2a8a8a"],
      ],
      ejdersovalye: [
        ["Pelerin", "#7a1018"],
        ["Z\u0131rh", "#aab4be"],
      ],
      kitsune: [
        ["Etek", "#c81d3f"],
        ["Ate\u015F", "#7ad8ff"],
        ["Sa\xE7", "#f8f4ee"],
      ],
      keloglan: [
        ["Yelek", "#8a3a1a"],
        ["\u015Ealvar", "#2a4a8a"],
      ],
      nasreddinhoca: [
        ["C\xFCbbe", "#2e6b3a"],
        ["Sakal", "#c9c9c9"],
      ],
      karagoz: [
        ["K\u0131yafet", "#c81d3f"],
        ["\u015Ealvar", "#2a6bb8"],
      ],
      hacivat: [
        ["Kaftan", "#2a8a6a"],
        ["\u015Ealvar", "#5a2a6b"],
      ],
      dedekorkut: [
        ["Kaftan", "#8a5a2b"],
        ["Sakal", "#eef0f4"],
      ],
      yeniceri: [
        ["Kaftan", "#b8141e"],
        ["\u015Ealvar", "#2a4a8a"],
      ],
      gokturkalp: [
        ["Pelerin", "#1d3d6b"],
        ["Z\u0131rh", "#aab4be"],
      ],
      zeybek: [
        ["Fes", "#b8141e"],
        ["Yelek", "#1d2a4a"],
        ["Atk\u0131", "#2a8a4a"],
      ],
      siberninja: [["Neon", "#ff2e88"]],
      pikselmaske: [
        ["Neon", "#22d3ee"],
        ["Kap\xFC\u015Fon", "#1a1a22"],
      ],
      neonsamuray: [
        ["Neon", "#22d3ee"],
        ["Z\u0131rh", "#eef3f8"],
      ],
      hologramdj: [
        ["Ceket", "#b8c8ff"],
        ["Viz\xF6r", "#22d3ee"],
        ["Sa\xE7", "#b44cff"],
      ],
      siberbaba: [
        ["Tak\u0131m", "#e8e6df"],
        ["G\xF6z", "#ff2020"],
        ["Sa\xE7", "#c9c9c9"],
      ],
    };

// --- v160: renk yuvası düzeltmeleri ------------------------------------------------------
// Prototipte bazı tiplerde "Elbise / Takım" rengi değişmiyordu (elbise yuvanın ana renginden
// farklı bir tonla çizilmiş) ya da koyu kıyafet saç rengine bağlanıyordu (siyah takım, saç
// değişince değişiyordu). Bu tiplerde yuvalar elle düzeltildi: 3. sıradan sonraki renkler o
// yuvaya KESİN aittir.
const TINT_FIX = {
  atesperisi: [['Kanat', '#ff7a2a', '#ff6a1a'], ['Elbise', '#e0561e', '#c8321a'], ['Saç', '#3a0f0a']],
  superisi: [['Kanat', '#5ae3ff', '#e8fbff', '#3ab8ff'], ['Elbise', '#18b4b4', '#0f8f9a'], ['Saç', '#1aa7a0']],
  safakperisi: [['Kanat', '#ffb3c8'], ['Elbise', '#ffb8a0', '#f28aa0'], ['Saç', '#f6e2b8']],
  kovboy: [['Yelek', '#5a3a1a'], ['Şapka', '#8a5a2b', '#3a2410', '#c9a066'], ['Saç', '#5c3a21']],
  gizliajan: [['Takım', '#0d0d0d', '#16161c', '#2b2b33'], ['Saç', '#2b2118']],
  kungfu: [['Gömlek', '#b8141e'], ['Pantolon', '#141414'], ['Saç', '#0d0a08']],
  sihirbaz: [['Kostüm', '#0d0d0d'], ['Astar', '#b8141e'], ['Saç', '#0d0a08']],
  kontvlad: [['Pelerin', '#0d0d0d', '#1a0a0e'], ['Astar', '#8a0a1a'], ['Saç', '#0d0a08']],
  rockyildizi: [['Kıyafet', '#141418', '#1a1a1a'], ['Gitar', '#c81d3f'], ['Saç', '#0d0d0d']],
  mechpilot: [['Tulum', '#f08a24', '#e8761a'], ['Kask', '#2a2a2a'], ['Saç', '#1a1410']],
  cilginbilim: [['Önlük', '#f4f6f8', '#dfe4ea'], ['Kravat', '#c81d3f'], ['Saç', '#f4f4f4']],
  zeus: [['Toga', '#f4f2ea', '#dcd8c8'], ['Şimşek', '#ffe14a'], ['Saç', '#f2f2f2']],
  kozmikmuhafiz: [['Altın', '#d4af37'], ['Kostüm', '#151515', '#111', '#111111']],
  ringkralicesi: [['Altın', '#d4af37'], ['Mayo', '#111', '#111111'], ['Saç', '#1a1410']],
  kelebekkralice: [['Kanat', '#ff8a1a'], ['Saç', '#111111']],
  olummelegi: [['Cübbe', '#14141c', '#05050a', '#2a2a36'], ['Göz', '#ff4a4a', '#ff2020']],
  siberninja: [['Neon', '#ff2e88'], ['Kostüm', '#101018', '#0d0d14', '#1a0a1e']],
  neonsamuray: [['Neon', '#22d3ee'], ['Zırh', '#eef3f8'], ['Kostüm', '#1a1e26']],
  hologramdj: [['Ceket', '#b8c8ff'], ['Pantolon', '#1a1a22'], ['Saç', '#b44cff']],
  samuray: [['Zırh', '#7a1018'], ['Hakama', '#1a1a1a'], ['Altın', '#d4af37']],
  tenekerobot: [['Gövde', '#aab4be', '#8e98a2', '#c9d1da'], ['Işık', '#ffd23f']],
  cadi: [['Elbise', '#24203a', '#1a1a22'], ['Saç', '#6b3fa0']],
  superteyze: [['Elbise', '#5a4a7a'], ['Hırka', '#ff9ac0'], ['Saç', '#c9c9cf']],
  valkur: [['Pelerin', '#2a6bb8'], ['Zırh', '#c9d1da'], ['Saç', '#f0d878']],
  demirtitan: [['Zırh', '#eef3f6', '#c9d6dc', '#dfe7ec'], ['Işık', '#2ee6d6']],
  miknatis: [['Kostüm', '#c9ced6', '#a9b0ba'], ['Pembe', '#ff2e88']],
  ejderyumruk: [['Aura', '#ff3b3b'], ['Kimono', '#1a1a1a', '#171717'], ['Saç', '#f4f4f4']],
};
// hiçbir yuvaya bağlanmayan (hep aynı kalan) renkler: ör. kovboyun gömleği saçla, Valkür'ün
// miğfer altını saçla değişmesin
const TINT_KEEP = {
  kovboy: ['#c0602a'],
  valkur: ['#d4af37', '#3a2a1a'],
};
// --- v160: renk uygulama (prototipteki ton eşleme + düzeltmeler) ---------------------------
//  • Her yuvanın ana rengi ve kesin renkleri o yuvaya gider.
//  • Diğer renkler ton (renkli) / açıklık (gri-siyah-beyaz) yakınlığıyla en yakın yuvaya gider.
//  • Saç / Sakal yuvası gri-siyah-beyaz renkleri YAKINLIKLA almaz (koyu kıyafet saçla
//    birlikte değişmesin) — sadece kendi rengini ve kesin renklerini.
//  • Ten (s): eski tenin bütün gölge tonları yeni tenin aynı gölgelerine çevrilir.
const HEX_RE = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const norm = (h) => (h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h).toLowerCase();
const HAIRISH = ['Saç', 'Sakal'];
const ACHRO = 0.1;
function hsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const c = mx - mn;
  let h = 0;
  if (c) h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return { h: (h * 60 + 360) % 360, s: c ? c / (1 - Math.abs(2 * l - 1)) : 0, l, c };
}
function fromHsl({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0')).join('');
}
const hueD = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
export function shadeHex(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return '#' + (16777216 + (Math.round((t - r) * p) + r) * 65536 + (Math.round((t - g) * p) + g) * 256 + (Math.round((t - b) * p) + b)).toString(16).slice(1);
}
function nearestSlot(c, bases, hairish) {
  let best = -1;
  let bestD = Infinity;
  bases.forEach((b, i) => {
    let d;
    if (b.c < ACHRO) {
      if (c.c >= ACHRO || hairish[i] || Math.abs(c.l - b.l) > 0.1) return;
      d = Math.abs(c.l - b.l);
    } else {
      if (c.c < ACHRO * 0.8 || hueD(c.h, b.h) > 18) return;
      d = hueD(c.h, b.h) / 18 + Math.abs(c.l - b.l);
    }
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
function retone(c, base, want) {
  const h = (c.h + (want.h - base.h) + 360) % 360;
  const s = base.c < ACHRO || base.s < 0.05 ? want.s : Math.min(1, c.s * (want.s / base.s));
  const l = c.l <= base.l ? (base.l ? want.l * (c.l / base.l) : want.l) : want.l + (1 - want.l) * ((c.l - base.l) / (1 - base.l || 1));
  // ana renk gri/siyah/beyazsa tonu anlamsız → doğrudan istenen ton (eskiden ton kayıp yeşile dönüyordu)
  return fromHsl({ h: want.c < ACHRO || base.c < ACHRO ? want.h : h, s: want.c < ACHRO ? Math.min(s, want.s + 0.05) : s, l: Math.min(1, Math.max(0, l)) });
}
// svg: çizilmiş avatar · id: tip · tint: { 0|1|2: #hex, s: #hex } · st: birleşik avatar durumu
// (st.skin = YENİ ten) · origSkin: tipin kendi teni
export function tintLook(svg, id, tint, st, origSkin) {
  const slots = f0[id];
  if (!slots || !tint) return svg;
  // sadece #rrggbb (başka oyuncunun profilinden gelen bozuk değer SVG'ye girmesin)
  tint = Object.fromEntries(Object.entries(tint).filter(([, v]) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)));
  // ten: eski tenin gölgeleri → yeni tenin gölgeleri (önce)
  const skinMap = new Map();
  if (tint.s && origSkin && norm(tint.s) !== norm(origSkin)) {
    for (let p = -40; p <= 40; p++) skinMap.set(norm(shadeHex(norm(origSkin), p)), norm(shadeHex(norm(tint.s), p)));
  }
  const bases = slots.map(([, b]) => hsl(norm(b)));
  const wants = slots.map((_, i) => (tint[String(i)] ? hsl(norm(tint[String(i)])) : null));
  const hairish = slots.map(([lb]) => HAIRISH.includes(lb));
  const anySlot = wants.some(Boolean);
  if (!anySlot && !skinMap.size) return svg;
  const baseSet = new Set(slots.map(([, b]) => norm(b)));
  const keep = new Set(['#000000', '#ffffff', '#111111', '#f4f1e8', '#f2efe4']);
  if (st) {
    for (let p = -40; p <= 40; p++) keep.add(norm(shadeHex(norm(st.skin), p)));
    keep.add(norm(st.eyeColor || '#000000'));
    keep.add(norm(st.lipColor || '#000000'));
  }
  (TINT_KEEP[id] || []).forEach((x) => keep.add(norm(x)));
  baseSet.forEach((b) => keep.delete(b));
  const exact = new Map();
  slots.forEach(([, b, ...extra], i) => {
    exact.set(norm(b), i);
    extra.forEach((x) => {
      exact.set(norm(x), i);
      keep.delete(norm(x));
    });
  });
  const memo = new Map();
  return svg.replace(HEX_RE, (m) => {
    const k = norm(m);
    if (memo.has(k)) return memo.get(k);
    let out = m;
    if (skinMap.has(k) && !exact.has(k)) out = skinMap.get(k);
    else if (anySlot && !keep.has(k)) {
      const c = hsl(k);
      const i = exact.has(k) ? exact.get(k) : nearestSlot(c, bases, hairish);
      if (i >= 0 && wants[i]) out = retone(c, bases[i], wants[i]);
    }
    memo.set(k, out);
    return out;
  });
}
// saç yuvası: kaş / sakal saçla aynı renkte çizilsin diye
export function lookHairColor(id) {
  const s = f0[id]?.find(([lb]) => lb === 'Saç');
  return s ? norm(s[1]) : null;
}
export function getLookHairSlot(id) {
  return (f0[id] || []).findIndex(([lb]) => lb === 'Saç');
}
// ten değiştirilebilir mi: tenin kendisi bir renk yuvası değilse (ör. yeşil uzaylının "Ten" yuvası)
export function lookSkinnable(id) {
  const a = o0[id];
  if (!a) return false;
  const sk = norm(a.base?.skin || '#c68863');
  return !(f0[id] || []).some(([, b]) => norm(b) === sk);
}
// ten paleti (avatar oluşturucudaki tonlar + birkaç fantastik ton). avatarShapes.js'ten içe
// aktarılmaz (döngüsel içe aktarma olmasın)
export const SKIN_PALETTE = ['#ffe0c2', '#ffdbb0', '#f1c27d', '#e0ac69', '#c68863', '#a86b3c', '#8d5524', '#6b4226', '#5c3a21', '#3d2a1c', '#8aa880', '#7bd36a', '#4a8ad8', '#8a5ac8', '#d8d0e0'];

Object.assign(f0, TINT_FIX);

export { o0 as LOOK_ART, f0 as LOOK_TINT, D0 as tintPalette, _0 as getLook };
