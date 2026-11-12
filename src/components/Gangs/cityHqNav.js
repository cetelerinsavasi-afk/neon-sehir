// v157.4 — Çeteler paneli şehrin içinde açıldığında karargaha giriş şehirden çıkarak yapılır
// (karargah ayrı bir 3D mekân; şehir sahnesiyle aynı anda açık kalmaz).
import { createContext } from 'react';

export const CityHqContext = createContext(null);
export const InitialHqContext = createContext(null);
