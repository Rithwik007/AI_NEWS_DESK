const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const IST_OFFSET = 5.5 * HOUR;

function startOfDeskDay(now = new Date()) {
  const day = Math.floor((now.getTime() + IST_OFFSET) / DAY);
  return new Date(day * DAY - IST_OFFSET);
}

function currentEdition(now = new Date()) {
  const start = startOfDeskDay(now).getTime();
  const hours = (now.getTime() - start) / HOUR;
  if (hours < 8) return null;
  const morning = hours < 18;
  return { runType: morning ? 'morning' : 'evening', scheduledAt: new Date(start + (morning ? 8 : 18) * HOUR) };
}

module.exports = { startOfDeskDay, currentEdition };
