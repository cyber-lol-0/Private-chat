const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const db = require('./database'); // This is now the Postgres Pool

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Allow connections from anywhere
});

app.use(express.static('public'));
app.use(express.json());

const onlineUsers = new Set();

function getTime() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
}

io.on('connection', (socket) => {

    // --- LOGIN ---
    socket.on('login', async ({ username, password }) => {
        try {
            // Postgres uses $1, $2 syntax
            const res = await db.query('SELECT * FROM users WHERE username = $1', [username]);
            const user = res.rows[0];

            if (user && bcrypt.compareSync(password, user.password)) {
                // Ensure ID is a number
                const userId = parseInt(user.id);
                
                socket.userData = { id: userId, username: user.username, color: user.avatar_color, isAdmin: user.isadmin }; // Postgres lowercases columns often
                socket.join(`user_${userId}`);
                onlineUsers.add(userId);

                socket.emit('login_success', socket.userData);

                // Fetch Users & Groups
                const usersRes = await db.query('SELECT id, username, avatar_color FROM users');
                const groupsRes = await db.query('SELECT * FROM groups');
                
                socket.emit('init_data', { 
                    users: usersRes.rows, 
                    groups: groupsRes.rows, 
                    online_ids: Array.from(onlineUsers) 
                });

                socket.broadcast.emit('user_status', { id: userId, status: 'online' });
            } else {
                socket.emit('login_error', 'Invalid Credentials');
            }
        } catch (e) { console.error("Login Error:", e); }
    });

    // --- ADMIN ACTIONS ---
    socket.on('admin_create_user', async ({ newUsername, newPassword }) => {
        if (!socket.userData || !socket.userData.isAdmin) return;

        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(newPassword, salt);
        const color = '#' + Math.floor(Math.random()*16777215).toString(16);

        try {
            await db.query('INSERT INTO users (username, password, avatar_color) VALUES ($1, $2, $3)', [newUsername, hash, color]);
            
            const usersRes = await db.query('SELECT id, username, avatar_color FROM users');
            const groupsRes = await db.query('SELECT * FROM groups');

            io.emit('refresh_data', { users: usersRes.rows, groups: groupsRes.rows });
            socket.emit('notification', `User "${newUsername}" created!`);
        } catch (e) {
            socket.emit('notification', 'Error: Username taken.');
        }
    });

    socket.on('admin_create_group', async ({ groupName }) => {
        if (!socket.userData || !socket.userData.isAdmin) return;

        const color = '#' + Math.floor(Math.random()*16777215).toString(16);
        try {
            await db.query('INSERT INTO groups (name, avatar_color) VALUES ($1, $2)', [groupName, color]);
            
            const usersRes = await db.query('SELECT id, username, avatar_color FROM users');
            const groupsRes = await db.query('SELECT * FROM groups');

            io.emit('refresh_data', { users: usersRes.rows, groups: groupsRes.rows });
            socket.emit('notification', `Group "${groupName}" created!`);
        } catch (e) {
            socket.emit('notification', 'Error: Group name taken.');
        }
    });

    // --- MESSAGING ---
    socket.on('send_message', async (data) => {
        const sender_id = parseInt(data.sender_id);
        const target_id = parseInt(data.target_id);
        const content = data.content;
        const is_group = data.is_group;
        const time = getTime();

        try {
            let res;
            if (is_group) {
                res = await db.query(
                    'INSERT INTO messages (sender_id, group_id, content, status) VALUES ($1, $2, $3, $4) RETURNING id', 
                    [sender_id, target_id, content, 'sent']
                );
                io.emit('receive_message', { id: res.rows[0].id, sender_id, group_id: target_id, is_group: true, content, timestamp: time, status: 'sent' });
            } else {
                res = await db.query(
                    'INSERT INTO messages (sender_id, receiver_id, content, status) VALUES ($1, $2, $3, $4) RETURNING id',
                    [sender_id, target_id, content, 'sent']
                );
                const msg = { id: res.rows[0].id, sender_id, receiver_id: target_id, is_group: false, content, timestamp: time, status: 'sent' };
                
                io.to(`user_${target_id}`).emit('receive_message', msg);
                socket.emit('receive_message', msg);
            }
        } catch (e) { console.error("Message Error:", e); }
    });

    socket.on('disconnect', () => {
        if (socket.userData) {
            onlineUsers.delete(socket.userData.id);
            io.emit('user_status', { id: socket.userData.id, status: 'offline' });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Alone Chat Pro running on port ${PORT}`);
});