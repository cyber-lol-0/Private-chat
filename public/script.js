const socket = io();
let me = null, activeChat = { type: null, id: null }, onlineUsers = new Set();

function handleKey(e, type) {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (type === 'login') doLogin();
        if (type === 'chat') sendMsg();
        if (type === 'admin_user') adminCreateUser();
        if (type === 'admin_group') adminCreateGroup();
        return;
    }
    if (type === 'login') {
        const t = e.target.id;
        if (e.key === 'ArrowDown') t === 'login-user' ? document.getElementById('login-pass').focus() : document.getElementById('login-btn').focus();
        if (e.key === 'ArrowUp') t === 'login-pass' ? document.getElementById('login-user').focus() : document.getElementById('login-pass').focus();
    }
}

function doLogin() {
    const u = document.getElementById('login-user').value, p = document.getElementById('login-pass').value;
    if (u && p) socket.emit('login', { username: u, password: p });
}
function logout() { location.reload(); }

socket.on('login_error', msg => document.getElementById('login-error').innerText = msg);
socket.on('login_success', user => {
    me = user;
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');
    if (me.isAdmin) {
        document.getElementById('admin-badge').classList.remove('hidden');
        document.getElementById('admin-tab-btn').classList.remove('hidden');
    }
});
socket.on('init_data', d => { onlineUsers = new Set(d.online_ids); renderSidebar(d.users, d.groups); });
socket.on('refresh_data', d => renderSidebar(d.users, d.groups));
socket.on('notification', msg => alert(msg));

function adminCreateUser() {
    const u = document.getElementById('new-user-name').value, p = document.getElementById('new-user-pass').value;
    if (u && p) { socket.emit('admin_create_user', { newUsername: u, newPassword: p }); document.getElementById('new-user-name').value=''; document.getElementById('new-user-pass').value=''; document.getElementById('new-user-name').focus(); }
}
function adminCreateGroup() {
    const g = document.getElementById('new-group-name').value;
    if (g) { socket.emit('admin_create_group', { groupName: g }); document.getElementById('new-group-name').value=''; }
}

function showSection(s) {
    document.getElementById('chat-list').classList.toggle('hidden', s !== 'chats');
    document.getElementById('admin-panel').classList.toggle('hidden', s !== 'admin');
}

function renderSidebar(users, groups) {
    const l = document.getElementById('chat-list'); l.innerHTML = '';
    groups.forEach(g => l.appendChild(createItem(g.id, g.name, g.avatar_color, 'group')));
    users.forEach(u => { if (u.id !== me.id) l.appendChild(createItem(u.id, u.username, u.avatar_color, 'user')); });
}
function createItem(id, n, c, t) {
    const d = document.createElement('div'); d.className = 'item'; d.id = `item-${t}-${id}`;
    d.onclick = () => loadChat(t, id, n, d);
    d.innerHTML = `<div class="avatar" style="background:${c}">${n[0].toUpperCase()}</div><span>${n}</span>`;
    return d;
}

// --- NEW MOBILE LOGIC ---
function loadChat(t, id, n, el) {
    activeChat = { type: t, id };
    document.querySelectorAll('.item').forEach(i => i.classList.remove('active')); el.classList.add('active');
    document.getElementById('chat-title').innerText = n;
    document.getElementById('chat-status').innerText = (t === 'user' && onlineUsers.has(id)) ? 'Online' : '';
    document.getElementById('messages').innerHTML = '';
    
    // Toggle Mobile View
    document.body.classList.add('chat-open'); 
}

function closeChat() {
    // Go back to list on mobile
    document.body.classList.remove('chat-open');
    activeChat = { type: null, id: null };
}
// ------------------------

function sendMsg() {
    const i = document.getElementById('msg-input'), txt = i.value.trim();
    if (!txt || !activeChat.id) return;
    socket.emit('send_message', { sender_id: me.id, target_id: activeChat.id, is_group: activeChat.type === 'group', content: txt });
    i.value = '';
}

socket.on('receive_message', msg => {
    const mid = parseInt(me.id), sid = parseInt(msg.sender_id), rid = parseInt(msg.receiver_id), gid = parseInt(msg.group_id), aid = parseInt(activeChat.id);
    const relevant = (msg.is_group && activeChat.type === 'group' && gid === aid) || (!msg.is_group && activeChat.type === 'user' && (sid === aid || rid === aid));
    
    if (relevant) {
        const d = document.createElement('div'); d.className = `msg ${sid === mid ? 'sent' : 'received'}`;
        let ticks = sid === mid ? '<span class="material-icons tick">done</span>' : '';
        d.innerHTML = `${msg.content} <div class="meta">${msg.timestamp} ${ticks}</div>`;
        const c = document.getElementById('messages'); c.appendChild(d); c.scrollTop = c.scrollHeight;
    }
});

socket.on('user_status', ({ id, status }) => {
    status === 'online' ? onlineUsers.add(id) : onlineUsers.delete(id);
    if (activeChat.type === 'user' && activeChat.id === id) document.getElementById('chat-status').innerText = status === 'online' ? 'Online' : '';
});
