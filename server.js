const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 2.5e7 // 25 MB fallback limit for files & voice notes
});

app.use(express.static(path.join(__dirname, 'public')));

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    
    // 1. Room Creation
    socket.on('create-room', ({ name }) => {
        const code = generateCode();
        socket.join(code);
        socket.data.name = name || 'User 1';
        socket.data.room = code;
        socket.emit('room-created', { code });
    });

    // 2. Join Room (Single correct block)
    socket.on('join-room', ({ code, name }) => {
        const cleanCode = (code || '').trim().toUpperCase();
        const room = io.sockets.adapter.rooms.get(cleanCode);
        
        if (!room || room.size === 0) {
            return socket.emit('error-msg', 'Invalid or expired pairing code.');
        }
        if (room.size >= 2) {
            return socket.emit('error-msg', 'This private chat already has 2 people.');
        }
        
        socket.join(cleanCode);
        socket.data.name = name || 'User 2';
        socket.data.room = cleanCode;
        
        io.to(cleanCode).emit('paired', { code: cleanCode });
        socket.to(cleanCode).emit('start-webrtc');
    });

    // 3. Text messages
    socket.on('chat-msg', ({ room, name, text }) => {
        socket.to(room).emit('chat-msg', { name, text });
    });

    // 4. Fallback File & Voice relay
    socket.on('relay-media', (payload) => {
        socket.to(payload.room).emit('relay-media', payload);
    });

    // 5. View Once Photo Expired Handler
    socket.on('mark-photo-viewed', ({ room, id }) => {
        if (room) {
            socket.to(room).emit('photo-expired', { id });
        } else {
            io.emit('photo-expired', { id });
        }
    });

    // 6. WebRTC P2P signaling
    socket.on('signal', ({ room, data }) => {
        socket.to(room).emit('signal', data);
    });

    // 7. Disconnect
    socket.on('disconnect', () => {
        const room = socket.data.room;
        if (room) socket.to(room).emit('partner-left');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sngi Share running on port ${PORT}`));
