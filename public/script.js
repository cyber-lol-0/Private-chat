const socket = io();

let me = null;
let activeChat = { type: null, id: null };
let onlineUsers = new Set();

// --- KEYBOARD HANDLING (UPDATED) ---
function handleKey(e, type) {
    // 1. Enter Key Logic
    if (e.key === 'Enter') {
        e.preventDefault(); // Stop default behavior
        if (type === 'login') doLogin();
        if (type === 'chat') sendMsg();
        return;
    }

    // 2. Arrow Key Navigation for Login
    if (type === 'login') {
        const target = e.target;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault(); // Stop cursor from moving to end of text
            if (target.id === 'login-user') document.getElementById('login-pass').focus();
            else if (target.id === 'login-pass') document.getElementById('login-btn').focus();
        }
        
        if (e.key === 'ArrowUp') {
            e.preventDefault(); 
            if (target.id === 'login-pass') document.getElementById('login-user').focus();
            else if (target.id === 'login-btn') document.getElementById('login-pass').focus();
        }
    }
}

function doLogin() {
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    if (u && p) socket.emit('login', { username: u, password: p });
}

function logout() { location.reload(); }

// --- SOCKET EVENTS ---
socket.on('login_error', (msg) => {
    document.getElementById('login-error').innerText = msg;
});

socket.on('login_success', (user) => {
    me = user;
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');

    if (me.isAdmin) {
        document.getElementById('admin-badge').classList.remove('hidden');
        document.getElementById('admin-tab-btn').classList.remove('hidden');
    }
});

socket.on('init_data', ({ users, groups, online_ids }) => {
    onlineUsers = new Set(online_ids);
    renderSidebar(users, groups);
});

socket.on('refresh_data', ({ users, groups }) => {
    renderSidebar(users, groups);
});

socket.on('notification', (msg) => alert(msg));

// --- ADMIN FUNCTIONS ---
function adminCreateUser() {
    const u = document.getElementById('new-user-name').value;
    const p = document.getElementById('new-user-pass').value;
    if (u && p) {
        socket.emit('admin_create_user', { newUsername: u, newPassword: p });
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-pass').value = '';
    } else {
        alert("Please enter both username and password");
    }
}

function adminCreateGroup() {
    const g = document.getElementById('new-group-name').value;
    if (g) {
        socket.emit('admin_create_group', { groupName: g });
        document.getElementById('new-group-name').value = '';
    }
}

function showSection(section) {
    if (section === 'chats') {
        document.getElementById('chat-list').classList.remove('hidden');
        document.getElementById('admin-panel').classList.add('hidden');
    } else {
        document.getElementById('chat-list').classList.add('hidden');
        document.getElementById('admin-panel').classList.remove('hidden');
    }
}

// --- RENDER & CHAT ---
function renderSidebar(users, groups) {
    const list = document.getElementById('chat-list');
    list.innerHTML = '';

    // Groups
    groups.forEach(g => list.appendChild(createItem(g.id, g.name, g.avatar_color, 'group')));
    
    // Users
    users.forEach(u => {
        if (u.id !== me.id) list.appendChild(createItem(u.id, u.username, u.avatar_color, 'user'));
    });
}

function createItem(id, name, color, type) {
    const div = document.createElement('div');
    div.className = 'item';
    div.id = `item-${type}-${id}`;
    div.onclick = () => loadChat(type, id, name, div);
    
    div.innerHTML = `
        <div class="avatar" style="background:${color}">${name[0].toUpperCase()}</div>
        <span>${name}</span>
    `;
    return div;
}

function loadChat(type, id, name, el) {
    activeChat = { type, id };
    document.querySelectorAll('.item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');

    document.getElementById('chat-title').innerText = name;
    document.getElementById('chat-status').innerText = (type === 'user' && onlineUsers.has(id)) ? 'Online' : '';
    document.getElementById('messages').innerHTML = ''; 
}

function sendMsg() {
    const input = document.getElementById('msg-input');
    const txt = input.value.trim();
    if (!txt || !activeChat.id) return;

    socket.emit('send_message', {
        sender_id: me.id,
        target_id: activeChat.id,
        is_group: activeChat.type === 'group',
        content: txt
    });
    input.value = '';
}

socket.on('receive_message', (msg) => {
    const isRelevant = 
        (msg.is_group && activeChat.type === 'group' && msg.group_id === activeChat.id) ||
        (!msg.is_group && activeChat.type === 'user' && (msg.sender_id === activeChat.id || msg.receiver_id === activeChat.id));
    
    if (isRelevant) {
        const div = document.createElement('div');
        div.className = `msg ${msg.sender_id === me.id ? 'sent' : 'received'}`;
        div.innerHTML = `${msg.content} <span class="meta">${msg.timestamp}</span>`;
        document.getElementById('messages').appendChild(div);
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
    }
});

socket.on('user_status', ({ id, status }) => {
    if (status === 'online') onlineUsers.add(id);
    else onlineUsers.delete(id);
    
    if (activeChat.type === 'user' && activeChat.id === id) {
        document.getElementById('chat-status').innerText = status === 'online' ? 'Online' : '';
    }
});