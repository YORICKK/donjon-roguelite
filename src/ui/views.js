// Gabarits HTML des écrans. Fonctions pures : (app, état) -> chaîne HTML.
// Un fichier par écran : common (éléments partagés), menu, lobby (salon), game (partie).
export { ROOM_ICONS, portraitUrl, itemChip, tileChip, currentWheel } from './common.js';
export { renderName, renderMenu, renderLeaderboard, renderInventory } from './menu.js';
export { renderLobby } from './lobby.js';
export { renderGame } from './game.js';
