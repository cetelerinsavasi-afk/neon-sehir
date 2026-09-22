import { DEFAULT_AVATAR } from './avatarShapes';

// tvAnchors.js — "Neon TV" spikerleri (madde 3). Karakol/Camii NPC'lerinde
// olduğu gibi (bkz. KarakolWorldScreen OFFICER_NPC/COMMISSIONER_NPC) sabit,
// dışa açık avatar tanımları — oyuncunun kendi avatarı DEĞİL, kanalın kendi
// "spikeri". Her kanalın kendi karakteri olsun diye üç ayrı görünüm var.
export const TV_ANCHORS = {
  haber: {
    name: 'Sunucu Derya',
    avatar: {
      ...DEFAULT_AVATAR,
      gender: 'kadin',
      build: 'standart',
      skin: '#e8b48a',
      hairStyle: 'long',
      hairColor: '#1a1210',
      clothing: 'suit',
      clothColor: '#12182b',
      neckAcc: 'none',
      background: 'transparent',
    },
  },
  spor: {
    name: 'Spiker Kaan',
    avatar: {
      ...DEFAULT_AVATAR,
      gender: 'erkek',
      build: 'standart',
      skin: '#c68863',
      hairStyle: 'short',
      hairColor: '#0d0a08',
      clothing: 'suit',
      clothColor: '#1f2a40',
      neckAcc: 'tie',
      background: 'transparent',
    },
  },
  yatirim: {
    name: 'Analist Elif',
    avatar: {
      ...DEFAULT_AVATAR,
      gender: 'kadin',
      build: 'standart',
      skin: '#f1c27d',
      hairStyle: 'slick',
      hairColor: '#2b1a12',
      clothing: 'suit',
      clothColor: '#3a1f2e',
      neckAcc: 'none',
      background: 'transparent',
    },
  },
};
