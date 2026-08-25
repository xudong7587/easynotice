import { createApp } from './app.js';
import { db } from './db.js';
import { port } from './config.js';
import { startWorker, stopWorker } from './worker.js';

const app = createApp();
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`EasyNotice is listening on http://0.0.0.0:${port}`);
});

startWorker();

function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down EasyNotice`);
  stopWorker();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
