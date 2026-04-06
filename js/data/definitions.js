// ==== GAME DATA (used on client for UI rendering) ====

const RACES = {
  humano: {
    name: 'Humano', displayName: 'Humano',
    icon: '🧑', description: '+1 em todos os atributos',
    bonuses: { for: 1, des: 1, con: 1, int: 1, sab: 1, car: 1 },
  },
  elfo: {
    name: 'Elfo', displayName: 'Elfo',
    icon: '🧝', description: '+2 Destreza, +1 Sabedoria',
    bonuses: { des: 2, sab: 1 },
  },
  anao: {
    name: 'Anão', displayName: 'Anão',
    icon: '⛏️', description: '+2 Constituição, +1 Força',
    bonuses: { con: 2, for: 1 },
  },
  halfling: {
    name: 'Halfling', displayName: 'Halfling',
    icon: '🧒', description: '+2 Destreza, +1 Carisma',
    bonuses: { des: 2, car: 1 },
  },
  draconato: {
    name: 'Draconato', displayName: 'Draconato',
    icon: '🐉', description: '+2 Força, +1 Carisma',
    bonuses: { for: 2, car: 1 },
  },
};

const CLASSES = {
  guerreiro: {
    name: 'Guerreiro', icon: '⚔️',
    description: 'Mestre em combate corpo a corpo', hitDie: 10, primaryAttr: 'for',
  },
  mago: {
    name: 'Mago', icon: '🔮',
    description: 'Manipula os elementos usando mana', hitDie: 6, primaryAttr: 'int',
  },
  ladino: {
    name: 'Ladino', icon: '🗡️',
    description: 'Ágil e sorrateiro', hitDie: 8, primaryAttr: 'des',
  },
  clerigo: {
    name: 'Clérigo', icon: '✨',
    description: 'Curandeiro divino', hitDie: 8, primaryAttr: 'sab',
  },
  ranger: {
    name: 'Ranger', icon: '🏹',
    description: 'Arqueiro e rastreador', hitDie: 10, primaryAttr: 'des',
  },
};

const ATTR_NAMES = {
  for: 'Força', des: 'Destreza', con: 'Const.',
  int: 'Inteligência', sab: 'Sabedoria', car: 'Carisma',
};

const LOCATIONS = [
  { name: 'Floresta Sombria', type: 'forest', encounterChance: 0.4 },
  { name: 'Masmorra Antiga', type: 'dungeon', encounterChance: 0.5 },
  { name: 'Vila Pacífica', type: 'village', encounterChance: 0.1 },
  { name: 'Montanha Gelada', type: 'mountain', encounterChance: 0.35 },
  { name: 'Pântano Verde', type: 'swamp', encounterChance: 0.45 },
];

const UNIT_ICONS = {
  guerreiro: '⚔️', mago: '🔮', ladino: '🗡️', clerigo: '✨', ranger: '🏹',
};
const ENEMY_ICONS = {'Goblin':'👹','Orc':'👹','Esqueleto':'💀','Lobo':'🐺','Slime':'🟢','Bandido':'🥷','Ogro':'👺','Dragão Jovem':'🐉'};
