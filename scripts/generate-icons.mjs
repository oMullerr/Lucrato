/**
 * Gera src/app/shared/ui/icon/icons.ts a partir de node_modules/lucide-static.
 *
 * Uso: node scripts/generate-icons.mjs
 *
 * Adicionar um ícone novo = incluir o nome (kebab, nomenclatura Lucide) em
 * NAMES e rodar de novo. O union IconName pega typo em tempo de compilação.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'node_modules', 'lucide-static', 'icons');
const outFile = join(root, 'src', 'app', 'shared', 'ui', 'icon', 'icons.ts');

/** Nomes Lucide usados pelo app (mapeamento Material→Lucide documentado abaixo). */
const NAMES = [
  // Shell e navegação
  'menu', 'globe', 'check', 'chevron-down', 'chevron-up', 'chevron-right',
  'chevrons-up-down', 'user', 'log-out', 'sun', 'moon', 'package',
  'chart-column', 'chart-spline', 'chart-no-axes-combined', 'landmark',
  'shopping-cart', 'tag', 'tags', 'sliders-horizontal', 'book-open', 'layout-grid',
  // Ações
  'plus', 'circle-plus', 'x', 'undo-2', 'save', 'pencil', 'trash', 'trash-2',
  'search', 'send', 'refresh-cw', 'rotate-ccw', 'download', 'upload',
  'file-up', 'file-down', 'hard-drive-download', 'filter-x', 'calculator',
  'arrow-right', 'arrow-up', 'arrow-down', 'arrow-left-right', 'package-check',
  'ban', 'eye', 'eye-off', 'key', 'key-round', 'lock-open',
  // Status e feedback
  'triangle-alert', 'circle-alert', 'octagon-alert', 'circle-check',
  'circle-check-big', 'info', 'bell', 'cloud-off', 'cloud-alert', 'hourglass',
  'clock', 'lightbulb', 'party-popper', 'trophy', 'minus',
  // Domínio (dinheiro, datas, revenda)
  'piggy-bank', 'banknote', 'receipt-text', 'ruler', 'truck', 'store',
  'shopping-bag', 'mail', 'mail-check', 'mail-warning', 'trending-up',
  'trending-down', 'calendar', 'calendar-days', 'calendar-range', 'calendar-x',
  'calendar-check', 'calendar-clock', 'calendar-fold', 'shapes', 'clipboard-list',
];

/* Mapeamento de migração (Material → Lucide), consumido manualmente nas fases 2–6:
   menu→menu · language→globe · check→check · expand_more→chevron-down ·
   expand_less→chevron-up · chevron_right→chevron-right · unfold_more→chevrons-up-down ·
   person→user · logout→log-out · light_mode→sun · dark_mode→moon ·
   inventory_2→package · analytics→chart-column · insights→chart-spline ·
   auto_graph→chart-no-axes-combined · account_balance→landmark ·
   shopping_cart→shopping-cart · sell→tag · local_offer→tags · tune→sliders-horizontal ·
   menu_book→book-open · apps→layout-grid · add→plus · add_circle→circle-plus ·
   close→x · undo→undo-2 · save→save · edit→pencil · delete_outline→trash ·
   delete_forever→trash-2 · search→search · send→send · refresh→refresh-cw ·
   restart_alt→rotate-ccw · download→download · upload→upload · upload_file→file-up ·
   file_download→file-down · download_for_offline→hard-drive-download ·
   filter_alt_off→filter-x · calculate→calculator · arrow_forward→arrow-right ·
   arrow_upward→arrow-up · arrow_downward→arrow-down · keyboard_arrow_up→arrow-up ·
   keyboard_arrow_down→arrow-down · sync_alt→arrow-left-right ·
   move_to_inbox→package-check · block→ban · visibility→eye · visibility_off→eye-off ·
   vpn_key→key · key→key-round · lock_reset→lock-open · warning→triangle-alert ·
   error_outline→circle-alert · priority_high→octagon-alert · check_circle→circle-check ·
   task_alt→circle-check-big · info→info · notifications→bell · cloud_off→cloud-off ·
   sync_problem→cloud-alert · hourglass_top→hourglass · schedule→clock ·
   lightbulb→lightbulb · celebration→party-popper · emoji_events→trophy ·
   trending_flat→minus · savings→piggy-bank · payments→banknote ·
   receipt_long→receipt-text · straighten→ruler · local_shipping→truck ·
   store→store · storefront→shopping-bag · email→mail · mark_email_read→mail-check ·
   mark_email_unread→mail-warning · trending_up→trending-up · trending_down→trending-down ·
   event→calendar · calendar_month→calendar-days · date_range→calendar-range ·
   event_busy→calendar-x · event_available→calendar-check · today→calendar-clock ·
   event_note→calendar-fold · category→shapes · list_alt→clipboard-list */

const missing = [];
const entries = [];

for (const name of [...NAMES].sort()) {
  let svg;
  try {
    svg = readFileSync(join(iconsDir, `${name}.svg`), 'utf8');
  } catch {
    missing.push(name);
    continue;
  }
  // Mantém só o conteúdo interno; o wrapper <svg> é renderizado pelo componente.
  const inner = svg
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  entries.push(`  '${name}': '${inner.replace(/'/g, "\\'")}',`);
}

if (missing.length) {
  console.error(`ERRO: ícones inexistentes no lucide-static instalado:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const out = `/* GERADO por scripts/generate-icons.mjs — NÃO EDITAR À MÃO.
 * Fonte: lucide-static (ISC License — https://lucide.dev).
 * Para adicionar um ícone: inclua o nome no script e rode
 *   node scripts/generate-icons.mjs
 */

/* eslint-disable max-len */
export const ICONS = {
${entries.join('\n')}
} as const;

export type IconName = keyof typeof ICONS;
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, out, 'utf8');
console.log(`OK: ${entries.length} ícones -> ${outFile}`);
