/* ============================================================
   Builder title generator
   Deterministic per (name + roll) so a given card is reproducible,
   but the RE-ROLL button walks the sequence.
   Flavour: Goa / sea / shipping-code.
   ============================================================ */

const ADJ = [
  'Midnight', 'Barefoot', 'Salt-Crusted', 'Low-Tide', 'Monsoon',
  'Sunburnt', 'Offline', 'Feral', 'Caffeinated', 'Tidal',
  'Susegad', 'Moonlit', 'Unshipped', 'Reckless', 'Hammock',
  'Two-Thirty-AM', 'Sandy', 'Undocumented', 'Deep-End', 'Coastal',
];

const NOUN = [
  'Shipper', 'Tide Chaser', 'Merge Conflict', 'Prototype', 'Deploy',
  'Rewrite', 'Wanderer', 'Pipeline', 'Beachhead', 'Refactor',
  'Signal', 'Latency Whisperer', 'Prompt Smith', 'Edge Case', 'Daemon',
  'Bootloader', 'Hotfix', 'Sunrise Commit', 'Rogue Branch', 'Lighthouse',
];

/* Role-flavoured nouns get a strong bias so the title feels earned. */
const BY_ROLE = [
  { re: /front|ui|ux|css|react|next/i,          nouns: ['Pixel Pusher', 'Frame Perfectionist', 'Viewport Nomad', 'Repaint Artist'] },
  { re: /back|server|infra|devops|api|rust|go\b/i, nouns: ['Latency Whisperer', 'Uptime Keeper', 'Queue Tamer', 'Cold Start Slayer'] },
  { re: /ai|ml|llm|agent|data/i,                nouns: ['Prompt Smith', 'Token Burner', 'Context Window', 'Hallucination Handler'] },
  { re: /chain|solidity|crypto|web3|contract/i, nouns: ['Block Producer', 'Gas Optimiser', 'Chain Runner', 'Mempool Ghost'] },
  { re: /design|brand|motion|figma/i,           nouns: ['Kerning Purist', 'Grid Breaker', 'Curve Bender', 'Palette Thief'] },
  { re: /product|pm|growth|market/i,            nouns: ['Roadmap Rewriter', 'Funnel Digger', 'Launch Caller', 'Narrative Builder'] },
  { re: /found|ceo|solo/i,                      nouns: ['One-Person Army', 'Runway Runner', 'Pitch Machine', 'Cap Table'] },
];

/* Small, fast, well-mixed string hash (FNV-1a). */
function hash(str){
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * @param {string} name
 * @param {string} roleOrStack  role + stack, used to bias the noun
 * @param {number} roll         increment to walk to a different title
 * @returns {string} e.g. "The Midnight Shipper"
 */
export function builderTitle(name, roleOrStack = '', roll = 0){
  const seed = hash(`${name.trim().toLowerCase()}|${roll}`);

  const adj = ADJ[seed % ADJ.length];

  // Role-specific nouns win when the role matches something we know.
  let pool = NOUN;
  for (const entry of BY_ROLE){
    if (entry.re.test(roleOrStack)){
      // Blend: mostly the role pool, occasionally the general one.
      pool = (seed >>> 8) % 4 === 0 ? NOUN : entry.nouns;
      break;
    }
  }
  const noun = pool[(seed >>> 5) % pool.length];

  return `The ${adj} ${noun}`;
}
