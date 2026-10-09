// v80 — oyun salonu oyunları (kimlik → modül). Yayın izleyicisi oynanan oyunu
// aynı çizimle gösterebilsin diye tek yerde toplanır.
import headSoccer from './headSoccer';
import fighter from './fighter';
import racer from './racer';
import spaceRun from './spaceRun';
import tanks from './tanks';
import sumo from './sumo';
import bomb from './bomb';
import paint from './paint';

export const ARCADE_GAMES = [spaceRun, tanks, sumo, bomb, paint, racer, headSoccer, fighter];
export const ARCADE_BY_ID = Object.fromEntries(ARCADE_GAMES.map((g) => [g.id, g]));
