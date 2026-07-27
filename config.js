require('dotenv').config();

const MODES = [
  'Crystal', 'Sword', 'Mace', 'Netheritepot',
  'Axenshield', 'Pot', 'Vanilla', 'SMP', 'UHC'
];

const TIERS = [
  'HT1', 'LT1', 'HT2', 'LT2', 'HT3', 'LT3', 'HT4', 'LT4', 'HT5', 'LT5'
];

function envKey(mode) {
  return mode.toUpperCase();
}

function buildModeRoleMap(prefix) {
  const map = {};
  for (const mode of MODES) {
    const key = `${prefix}_${envKey(mode)}`;
    const value = process.env[key];
    if (!value) {
      console.warn(`⚠️  Thiếu biến .env: ${key} — role cho mode "${mode}" sẽ không hoạt động.`);
    }
    map[mode] = value || null;
  }
  return map;
}

function buildTierRoleMap() {
  const map = {};
  for (const tier of TIERS) {
    map[tier] = {};
    for (const mode of MODES) {
      const key = `TIER_ROLE_${tier}_${envKey(mode)}`;
      const value = process.env[key];
      if (!value) {
        console.warn(`⚠️  Thiếu biến .env: ${key} — role tier "${tier}" cho mode "${mode}" sẽ không hoạt động.`);
      }
      map[tier][mode] = value || null;
    }
  }
  return map;
}

module.exports = {
  MODES,
  TIERS,
  VERIFY_ROLE_ID: process.env.VERIFY_ROLE_ID || null,
  RESULTS_CHANNEL_ID: process.env.RESULTS_CHANNEL_ID || null,
  WELCOME_CHANNEL_ID: process.env.WELCOME_CHANNEL_ID || null,
  COOLDOWN_HOURS: Number(process.env.COOLDOWN_HOURS) || 120,
  waitlistRoles: buildModeRoleMap('WAITLIST_ROLE'),
  testerRoles: buildModeRoleMap('TESTER_ROLE'),
  tierRoles: buildTierRoleMap(),
};
