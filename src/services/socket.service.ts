import { Server, Socket } from 'socket.io';
import http from 'http';
import cookie from 'cookie'
import cookieParser from 'cookie-parser';
import Config from '../config/index.js';
import Utility from '../utils/index.js';

export const init = (server: http.Server) => {
  const io = new Server(server);

  io.use((socket, next) => {
    const rawCookies = socket.handshake.headers.cookie;
    
    if (!rawCookies) {
      return next(new Error('api.auth.no_cookies'));
    }

    // 1. Parse the cookies
    const parsedCookies = cookie.parse(rawCookies);
    
    // 2. Extract and Unsign the specific cookie
    // 'ENV.COOKIE_SECRET' must match the one used in Express
    const signedVisitorId = parsedCookies['visitorid'];

    if (!signedVisitorId) {
      return next(new Error('api.auth.no_cookies'));
    }

    const unsignedVisitorId = cookieParser.signedCookie(signedVisitorId, Config.ENV.secEncryptKey);

    if (!unsignedVisitorId) {
      return next(new Error('api.auth.invalid_signature'));
    }

    // Attach the session ID to the socket for later use (like room joining)
    socket.data.sessionId = unsignedVisitorId;
    next();
  });

  io.on('connection', (socket: Socket) => {
    Utility.Logger.info(`A user connected ${socket.id}`);

    // Add your socket event listeners here
    socket.on('my_event', (data) => {
      Utility.Logger.info('Received data:', data);
      // Broadcast to all clients
      socket.broadcast.emit('event_response', data); 
    });

    socket.on('disconnect', () => {
      Utility.Logger.info('User disconnected');
    });
  });

  return io;
};