const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const db = require('./database'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));
app.use(express.json());

const onlineUsers = new Set();

function getTime() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
}

io.on('connection', (socket) => {

    // --- NORMAL LOGIN ---
    socket.on('login', async ({ username, password }) => {
        try {
            const res = await db.query('SELECT * FROM users WHERE username = $1', [username]);
            let user = res.rows[0];

            // Emergency Admin Check
            if (!user && username === 'Admin' && password === 'admin123') {
                const hash = bcrypt.hashSync('admin123', 10);
                const color = '#7289da';
                const newRes = await db.query(
                    'INSERT INTO users (username, password, avatar_color, isAdmin) VALUES ($1, $2, $3, $4) RETURNING *',
                    ['Admin', hash, color, true]
                );
                user = newRes.rows[0];
            }

            if (user && bcrypt.compareSync(password, user.password)) {
                setupUserSession(socket, user);
            } else {
                socket.emit('login_error', 'Invalid Credentials');
            }
        } catch (e) { console.error(e); }
    });

    // --- RELOGIN (Auto-Login on Refresh) ---
    socket.on('relogin', async ({ user_id }) => {
        try {
            const res = await db.query('SELECT * FROM users WHERE id = $1', [user_id]);
            const user = res.rows[0];
            if (user) {
                setupUserSession(socket, user);
            } else {
                socket.emit('login_error', 'Session Expired');
            }
        } catch (e) { console.error(e); }
    });

    // Helper to join rooms and send data
    async function setupUserSession(socket, user) {
        const userId = parseInt(user.id);
        socket.userData = { id: userId, username: user.username, color: user.avatar_color, isAdmin: user.isadmin };
        socket.join(`user_${userId}`);
        onlineUsers.add(userId);

        socket.emit('login_success', socket.userData);
        
        const uRes = await db.query('SELECT id, username, avatar_color FROM users');
        const gRes = await db.query('SELECT * FROM groups');
        socket.emit('init_data', { users: uRes.rows, groups: gRes.rows, online_ids: Array.from(onlineUsers) });
        
        socket.broadcast.emit('user_status', { id: userId, status: 'online' });
    }

    // LOAD HISTORY
    socket.on('get_history', async ({ target_id, is_group }) => {
        if (!socket.userData) return;
        const myId = socket.userData.id;
        const otherId = parseInt(target_id);

        try {
            let res;
            if (is_group) {
                res = await db.query('SELECT * FROM messages WHERE group_id = $1 ORDER BY timestamp ASC', [otherId]);
            } else {
                res = await db.query(
                    'SELECT * FROM messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) ORDER BY timestamp ASC',
                    [myId, otherId]
                );
            }
            socket.emit('history_loaded', res.rows);
        } catch (e) { console.error(e); }
    });

    // ADMIN ACTIONS
    socket.on('admin_create_user', async ({ newUsername, newPassword }) => {
        if (!socket.userData?.isAdmin) return;
        const hash = bcrypt.hashSync(newPassword, 10);
        const color = '#' + Math.floor(Math.random()*16777215).toString(16);
        try {
            await db.query('INSERT INTO users (username, password, avatar_color) VALUES ($1, $2, $3)', [newUsername, hash, color]);
            const u = await db.query('SELECT id, username, avatar_color FROM users');
            const g = await db.query('SELECT * FROM groups');
            io.emit('refresh_data', { users: u.rows, groups: g.rows });
            socket.emit('notification', `User created!`);
        } catch (e) { socket.emit('notification', 'Username taken.'); }
    });

    socket.on('admin_create_group', async ({ groupName }) => {
        if (!socket.userData?.isAdmin) return;
        const color = '#' + Math.floor(Math.random()*16777215).toString(16);
        try {
            await db.query('INSERT INTO groups (name, avatar_color) VALUES ($1, $2)', [groupName, color]);
            const u = await db.query('SELECT id, username, avatar_color FROM users');
            const g = await db.query('SELECT * FROM groups');
            io.emit('refresh_data', { users: u.rows, groups: g.rows });
            socket.emit('notification', `Group created!`);
        } catch (e) { socket.emit('notification', 'Name taken.'); }
    });

    // MESSAGING
    socket.on('send_message', async (data) => {
        const sender_id = parseInt(data.sender_id);
        const target_id = parseInt(data.target_id);
        const content = data.content;
        const is_group = data.is_group;
        const time = getTime();

        try {
            let res;
            if (is_group) {
                res = await db.query('INSERT INTO messages (sender_id, group_id, content, status) VALUES ($1, $2, $3, $4) RETURNING id', [sender_id, target_id, content, 'sent']);
                io.emit('receive_message', { id: res.rows[0].id, sender_id, group_id: target_id, is_group: true, content, timestamp: time, status: 'sent' });
            } else {
                res = await db.query('INSERT INTO messages (sender_id, receiver_id, content, status) VALUES ($1, $2, $3, $4) RETURNING id', [sender_id, target_id, content, 'sent']);
                const msg = { id: res.rows[0].id, sender_id, receiver_id: target_id, is_group: false, content, timestamp: time, status: 'sent' };
                io.to(`user_${target_id}`).emit('receive_message', msg);
                socket.emit('receive_message', msg);
            }
        } catch (e) { console.error(e); }
    });

    socket.on('disconnect', () => {
        if (socket.userData) {
            onlineUsers.delete(socket.userData.id);
            io.emit('user_status', { id: socket.userData.id, status: 'offline' });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
