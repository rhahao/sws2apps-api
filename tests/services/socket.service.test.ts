import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, Server as HTTPServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as Client, type Socket as ClientSocket } from 'socket.io-client';
import cookie from 'cookie';
import { initSocketIO } from '../../src/services/socket.service.js';
import { GenericObject } from '../../src/types/index.js';

vi.mock('../../src/utils/logger.js');

describe('Socket Service Integration', () => {
  let io: Server;
  let httpServer: HTTPServer;
  let clientSocketA: ClientSocket;
  let clientSocketB: ClientSocket;
  let port: number;

  beforeAll(async () => {
    httpServer = createServer();
    io = initSocketIO(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        port = (httpServer.address() as AddressInfo).port;

        clientSocketA = Client(`http://localhost:${port}`, {
          extraHeaders: {
            cookie: cookie.serialize('visitorid', 'test-session-id-A'),
          },
        });

        clientSocketB = Client(`http://localhost:${port}`, {
          extraHeaders: {
            cookie: cookie.serialize('visitorid', 'test-session-id-B'),
          },
        });

        let connected = 0;

        const onConnect = () => {
          connected++;
          if (connected === 2) resolve();
        };

        clientSocketA.once('connect', onConnect);
        clientSocketB.once('connect', onConnect);
      });
    });
  });

  afterAll(() => {
    clientSocketA.disconnect();
    clientSocketB.disconnect();
    io.close();
    httpServer.close();
  });

  it('should broadcast event_response to other clients when my_event is received', async () => {
    const [responseFromA, responseFromB] = await new Promise<GenericObject[]>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Client B did not receive broadcast'));
        }, 2000);

        let receivedByA: GenericObject;
        let receivedByB: GenericObject;

        clientSocketA.once('event_response', (data) => {
          receivedByA = data;
        });

        clientSocketB.once('event_response', (data) => {
          receivedByB = data;
        });

        clientSocketA.emit('my_event', {
          message: 'Data received successfully',
        });

        setTimeout(() => {
          clearTimeout(timeout);
          resolve([receivedByA, receivedByB]);
        }, 300);
      }
    );

    expect(responseFromB.message).toBe('Data received successfully');

    // Assert that client A does NOT receive the message
    expect(responseFromA).toBeUndefined();
  });
});
