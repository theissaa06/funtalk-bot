function baseMeta() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function createAppData() {
  return {
    meta: baseMeta(),
    counters: {
      users: 0,
      chats: 0,
      supportTickets: 0,
      supportMessages: 0,
    },
    users: [],
    chats: [],
    supportTickets: [],
    supportMessages: [],
  };
}

function createEconomyData() {
  return {
    meta: baseMeta(),
    counters: {
      transactions: 0,
    },
    users: [],
    transactions: [],
  };
}

function createModerationData() {
  return {
    meta: baseMeta(),
    counters: {
      members: 0,
      warnings: 0,
      modLog: 0,
    },
    members: [],
    warnings: [],
    modLog: [],
    chatSettings: [],
    shields: [],
    pinnedLeaderboards: [],
  };
}

module.exports = {
  createAppData,
  createEconomyData,
  createModerationData,
};
