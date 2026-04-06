// ==== DICE ENGINE ====

const Dice = {
  roll(sides) { return Math.floor(Math.random() * sides) + 1; },

  parseAndRoll(expression) {
    const match = String(expression).match(/(\d+)?d(\d+)\s*([+-]\s*\d+)?/);
    if (!match) return 0;
    const count = parseInt(match[1] || '1');
    const sides = parseInt(match[2]);
    const mod = parseInt((match[3] || '0').replace(/\s/g, ''));
    let total = 0;
    for (let i = 0; i < count; i++) total += this.roll(sides);
    return total + mod;
  },

  mod(score) { return Math.floor((score - 10) / 2); },
};
