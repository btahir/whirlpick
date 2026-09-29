// Loaded with NODE_OPTIONS=--import into the MCP server during tests (ACCEPTANCE H6):
// any attempt to open a network connection throws and is logged to stderr.
import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

const block = (what) => () => {
  process.stderr.write(`NET-GUARD: blocked ${what}\n`);
  throw new Error(`network access blocked by test guard: ${what}`);
};
net.connect = block('net.connect');
net.createConnection = block('net.createConnection');
tls.connect = block('tls.connect');
http.request = block('http.request');
http.get = block('http.get');
https.request = block('https.request');
https.get = block('https.get');
dgram.createSocket = block('dgram.createSocket');
globalThis.fetch = block('fetch');
if (globalThis.WebSocket) globalThis.WebSocket = block('WebSocket');
