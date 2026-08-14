import {
  Factory,
  Cog,
  Settings,
  Hammer,
  Wrench,
  Flame,
  Zap,
  Package,
  Truck,
  Warehouse,
  Cpu,
  Boxes,
  Container,
  Gauge,
  Layers,
  Recycle,
  Shield,
  Anchor,
  Beaker,
  Leaf,
} from 'lucide-react';

// factoryLogoOptions — kullanıcının gönderdiği "fabrika logosu
// tasarımcısı" örneğinin sadeleştirilmiş uyarlaması (bkz. Futbol
// modülündeki aynı desen: FutbolCrest/FutbolLogoEditor). Şekil ve ikon
// listeleri, functions/index.js'deki FACTORY_LOGO_SHAPES/FACTORY_LOGO_ICONS
// ile BİREBİR aynı olmalı — sunucu bu setlere karşı doğrulama yapıyor.

export const FACTORY_LOGO_SHAPES = [
  { id: 'hexagon', label: 'Altıgen' },
  { id: 'circle', label: 'Yuvarlak' },
  { id: 'shield', label: 'Kalkan' },
  { id: 'square', label: 'Kare' },
  { id: 'diamond', label: 'Elmas' },
];

export const FACTORY_LOGO_ICONS = [
  { id: 'factory', Comp: Factory, label: 'Fabrika' },
  { id: 'cog', Comp: Cog, label: 'Dişli' },
  { id: 'settings', Comp: Settings, label: 'Ayarlar' },
  { id: 'hammer', Comp: Hammer, label: 'Çekiç' },
  { id: 'wrench', Comp: Wrench, label: 'Anahtar' },
  { id: 'flame', Comp: Flame, label: 'Alev' },
  { id: 'zap', Comp: Zap, label: 'Şimşek' },
  { id: 'package', Comp: Package, label: 'Paket' },
  { id: 'truck', Comp: Truck, label: 'Kamyon' },
  { id: 'warehouse', Comp: Warehouse, label: 'Depo' },
  { id: 'cpu', Comp: Cpu, label: 'İşlemci' },
  { id: 'boxes', Comp: Boxes, label: 'Kutular' },
  { id: 'container', Comp: Container, label: 'Konteyner' },
  { id: 'gauge', Comp: Gauge, label: 'Gösterge' },
  { id: 'layers', Comp: Layers, label: 'Katmanlar' },
  { id: 'recycle', Comp: Recycle, label: 'Geri Dönüşüm' },
  { id: 'shield', Comp: Shield, label: 'Kalkan İkonu' },
  { id: 'anchor', Comp: Anchor, label: 'Çapa' },
  { id: 'beaker', Comp: Beaker, label: 'Deney Tüpü' },
  { id: 'leaf', Comp: Leaf, label: 'Yaprak' },
];

export const FACTORY_LOGO_ICON_MAP = Object.fromEntries(
  FACTORY_LOGO_ICONS.map((i) => [i.id, i.Comp])
);

export const FACTORY_LOGO_PRESETS = [
  { name: 'Çelik Mavisi', bg: '#28394B', metal: '#E7EEF4', trim: '#4A90D9' },
  { name: 'Endüstriyel Turuncu', bg: '#3B2A1A', metal: '#E8DCC8', trim: '#E8862B' },
  { name: 'Pas Kızılı', bg: '#3A1F1B', metal: '#E9D8CF', trim: '#C1442B' },
  { name: 'Bakır Parlak', bg: '#2E2118', metal: '#F0D9B5', trim: '#C97A34' },
  { name: 'Zehirli Yeşil', bg: '#1B2E1E', metal: '#DDEFD8', trim: '#5CC24C' },
  { name: 'Kömür Siyahı', bg: '#17191C', metal: '#D9DCE0', trim: '#8A939E' },
];

// DEFAULT_FACTORY_LOGO — henüz özel logo tasarlamamış (Firestore'da
// `logo` alanı olmayan) eski/yeni fabrikalar için güvenli görsel varsayılan.
export const DEFAULT_FACTORY_LOGO = {
  shape: 'hexagon',
  icon: 'factory',
  bg: FACTORY_LOGO_PRESETS[5].bg,
  metal: FACTORY_LOGO_PRESETS[5].metal,
  trim: FACTORY_LOGO_PRESETS[5].trim,
  hazard: false,
  rivets: false,
};
