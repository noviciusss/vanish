import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initializeSocketServer } from './lib/socket-server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    if (req.url && req.url.startsWith('/socket.io/')) {
      return; // Handled directly by Socket.io engine
    }
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Initialize Socket.io
  initializeSocketServer(server);

  server.listen(port, () => {
    console.log(`> Anon Chat Server ready on http://${hostname}:${port}`);
    console.log(`> Ephemeral Realtime Socket.io active`);
  });
});
