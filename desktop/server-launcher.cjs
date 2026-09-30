// The bundled Node ABI matches better-sqlite3. End the service if its launcher disappears.
const parent = Number(process.env.TRIP_MAP_PARENT_PID);
if (Number.isInteger(parent) && parent > 0) setInterval(() => {
  try { process.kill(parent, 0); } catch { process.exit(0); }
}, 2000).unref();
require('./server.js');
