function botUsername(app) {
  return String(app?.config?.botUsername || 'FunTalchik_Botik').replace(/^@/, '');
}

function botInviteUrl(app) {
  return `https://t.me/${botUsername(app)}?startgroup=true`;
}

module.exports = {
  botInviteUrl,
  botUsername,
};
