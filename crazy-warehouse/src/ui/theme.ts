/**
 * 全站只用四個色相：柔藍 / 奶油黃 / 薰衣草紫 / 珊瑚粉，外加白與中性灰墨色。
 * 其餘（地板、桌子、底色）都是這四色的淡化色調或中性灰。
 * Tailwind 端的同名色票定義在 src/index.css 的 @theme。
 */
export const PALETTE = {
  blue: '#86BEE8',
  butter: '#F4D58A',
  lavender: '#B9A8E8',
  coral: '#F5A59B',
} as const;

export const TINT = {
  butter: '#FCF4DC',
  coral: '#FCE7E4',
  floor: '#F2F4F8',
  desk: '#C9D2E2',
} as const;

export const INK = '#3B4256';
export const MUTE = '#667085';
export const LINE = '#E6E9F0';
