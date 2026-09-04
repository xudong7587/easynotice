import { createApp } from './app.js';
import { db } from './db.js';
import { host, port } from './config.js';
import { startWorker, stopWorker } from './worker.js';
import { startUgreenCollectors, stopUgreenCollectors } from './ugreen-collector.js';

const app = createApp();
const server = app.listen(port, host, () => {
  console.log(`EasyNotice is listening on http://${host}:${port}`);
});

startWorker();
startUgreenCollectors();

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down EasyNotice`);
  stopWorker();
  stopUgreenCollectors();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
