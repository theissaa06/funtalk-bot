const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function audit(data) {
  const duplicateAchievements = [];
  const duplicateRewards = [];

  for (const user of data.users || []) {
    const seen = new Map();
    for (const achievement of user.achievements || []) {
      const id = typeof achievement === 'string' ? achievement : achievement?.id;
      if (!id) continue;
      seen.set(id, (seen.get(id) || 0) + 1);
    }
    for (const [achievementId, count] of seen.entries()) {
      if (count > 1) {
        duplicateAchievements.push({
          telegramId: user.telegramId,
          achievementId,
          count,
        });
      }
    }
  }

  const rewardKeys = new Map();
  for (const transaction of data.transactions || []) {
    if (transaction.type !== 'achievement_reward' || !transaction.reason) continue;
    const key = `${transaction.telegramId}:${transaction.reason}`;
    const row = rewardKeys.get(key) || {
      telegramId: transaction.telegramId,
      achievementId: transaction.reason,
      count: 0,
      totalAmount: 0,
    };
    row.count += 1;
    row.totalAmount += Number(transaction.amount) || 0;
    rewardKeys.set(key, row);
  }
  for (const row of rewardKeys.values()) {
    if (row.count > 1) duplicateRewards.push(row);
  }

  return { duplicateAchievements, duplicateRewards };
}

const storePath = path.resolve(process.argv[2] || process.env.ECONOMY_STORE_PATH || path.join(__dirname, '..', 'data', 'economy_store.json'));
const result = audit(readJson(storePath));

console.log(JSON.stringify({
  storePath,
  duplicateAchievementUsers: result.duplicateAchievements.length,
  duplicateRewardUsers: result.duplicateRewards.length,
  duplicateAchievements: result.duplicateAchievements,
  duplicateRewards: result.duplicateRewards,
}, null, 2));

if (result.duplicateAchievements.length || result.duplicateRewards.length) {
  process.exitCode = 2;
}
