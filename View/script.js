// ========== DATOS GLOBALES ==========
let currentUser = null;
let users = [];
let projects = [];
let comments = [];

// ========== FUNCIONES DE HASH Y SEGURIDAD ==========
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
        return c;
    });
}

// ========== PERSISTENCIA (localStorage) ==========
function loadData() {
    const storedUsers = localStorage.getItem('portfolio_users');
    if (storedUsers) users = JSON.parse(storedUsers);
    else users = [];

    const storedProjects = localStorage.getItem('portfolio_projects');
    if (storedProjects) projects = JSON.parse(storedProjects);
    else projects = [];

    const storedComments = localStorage.getItem('portfolio_comments');
    if (storedComments) comments = JSON.parse(storedComments);
    else comments = [];
}

function saveUsers() { localStorage.setItem('portfolio_users', JSON.stringify(users)); }
function saveProjects() { localStorage.setItem('portfolio_projects', JSON.stringify(projects)); updateSkillsAndProjectsUI(); }
function saveComments() { localStorage.setItem('portfolio_comments', JSON.stringify(comments)); renderComments(); }

// Crear admin por defecto si no existe
async function createAdminIfNotExists() {
    const adminExists = users.some(u => u.email === 'admin@romero.dev');
    if (!adminExists) {
        const hashed = await hashPassword('admin123');
        users.push({ email: 'admin@romero.dev', passwordHash: hashed, role: 'admin', name: 'Administrador' });
        saveUsers();
    }
}

// ========== LÓGICA DE HABILIDADES (dinámicas) ==========
function computeSkillsFromProjects() {
    if (!projects.length) return {};
    const techCount = {};
    projects.forEach(proj => {
        proj.technologies.forEach(tech => {
            techCount[tech] = (techCount[tech] || 0) + 1;
        });
    });
    const totalProjects = projects.length;
    const skillsPercent = {};
    for (let tech in techCount) {
        skillsPercent[tech] = Math.round((techCount[tech] / totalProjects) * 100);
    }
    return skillsPercent;
}

function renderSkills() {
    const skillsPercent = computeSkillsFromProjects();
    const container = document.getElementById('skills-container');
    if (!container) return;
    if (Object.keys(skillsPercent).length === 0 && projects.length === 0) {
        container.innerHTML = `<div class="col-span-2 text-center py-8 text-gray-500">Aún no hay proyectos. Agrega proyectos como administrador para ver tus habilidades.</div>`;
        return;
    }
    let html = `<div class="grid md:grid-cols-2 gap-10 col-span-2">`;
    const entries = Object.entries(skillsPercent);
    const half = Math.ceil(entries.length / 2);
    const firstHalf = entries.slice(0, half);
    const secondHalf = entries.slice(half);
    html += `<div>`;
    firstHalf.forEach(([tech, percent]) => {
        html += `<div class="mb-5"><div class="flex justify-between"><span>${escapeHtml(tech)}</span><span>${percent}%</span></div><div class="skill-bar"><div class="skill-progress" data-width="${percent}" style="width:0%"></div></div></div>`;
    });
    html += `</div><div>`;
    secondHalf.forEach(([tech, percent]) => {
        html += `<div class="mb-5"><div class="flex justify-between"><span>${escapeHtml(tech)}</span><span>${percent}%</span></div><div class="skill-bar"><div class="skill-progress" data-width="${percent}" style="width:0%"></div></div></div>`;
    });
    html += `</div></div>`;
    container.innerHTML = html;
    setTimeout(() => {
        document.querySelectorAll('.skill-progress').forEach(bar => {
            const w = bar.getAttribute('data-width');
            if (w) bar.style.width = w + '%';
        });
    }, 100);
}

function renderProjects() {
    const container = document.getElementById('projects-list');
    if (!container) return;
    if (projects.length === 0) {
        container.innerHTML = `<div class="col-span-3 text-center py-8 text-gray-500">No hay proyectos aún. Agrega el primero desde el panel admin.</div>`;
        return;
    }
    let html = '';
    projects.forEach(proj => {
        const techs = proj.technologies.map(t => `<span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">${escapeHtml(t)}</span>`).join('');
        html += `<div class="bg-gray-50 rounded-2xl shadow-md overflow-hidden hover-lift"><div class="h-40 bg-gradient-to-r from-indigo-400 to-purple-400 flex items-center justify-center"><i class="${proj.icon || 'fas fa-laptop-code'} text-5xl text-white"></i></div><div class="p-5"><h3 class="text-xl font-bold">${escapeHtml(proj.title)}</h3><p class="text-gray-600 mt-2">${escapeHtml(proj.description)}</p><div class="mt-3 flex gap-2 flex-wrap">${techs}</div></div></div>`;
    });
    container.innerHTML = html;
}

function updateSkillsAndProjectsUI() {
    renderSkills();
    renderProjects();
}

// ========== GESTIÓN DE USUARIOS ==========
async function register(email, password, name = email.split('@')[0]) {
    const exists = users.find(u => u.email === email);
    if (exists) throw new Error('El email ya está registrado');
    const hash = await hashPassword(password);
    users.push({ email, passwordHash: hash, role: 'user', name });
    saveUsers();
    return true;
}

async function login(email, password) {
    const user = users.find(u => u.email === email);
    if (!user) throw new Error('Usuario no encontrado');
    const hash = await hashPassword(password);
    if (user.passwordHash !== hash) throw new Error('Contraseña incorrecta');
    return user;
}

function setCurrentUser(user) {
    currentUser = user;
    if (user) {
        localStorage.setItem('currentUser', JSON.stringify({ email: user.email, role: user.role, name: user.name }));
    } else {
        localStorage.removeItem('currentUser');
    }
    updateUIForUser();
}

function loadCurrentUser() {
    const stored = localStorage.getItem('currentUser');
    if (stored) {
        const u = JSON.parse(stored);
        const fullUser = users.find(user => user.email === u.email);
        if (fullUser) currentUser = fullUser;
        else currentUser = null;
    } else currentUser = null;
    updateUIForUser();
}

function updateUIForUser() {
    const userNameSpan = document.getElementById('user-name-display');
    if (userNameSpan) userNameSpan.textContent = currentUser ? currentUser.name : 'Invitado';
    const isAdmin = currentUser && currentUser.role === 'admin';
    const adminOptions = document.querySelectorAll('#admin-panel-option, #mobile-admin-btn, #admin-add-project-btn');
    adminOptions.forEach(el => {
        if (isAdmin) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
    const loginOptions = document.querySelectorAll('#login-option, #register-option, #mobile-login-btn, #mobile-register-btn');
    const logoutOptions = document.querySelectorAll('#logout-option, #mobile-logout-btn');
    if (currentUser) {
        loginOptions.forEach(btn => btn.classList.add('hidden'));
        logoutOptions.forEach(btn => btn.classList.remove('hidden'));
        const commentBtn = document.getElementById('submit-comment-btn');
        if (commentBtn) { commentBtn.disabled = false; commentBtn.textContent = 'Publicar comentario'; }
    } else {
        loginOptions.forEach(btn => btn.classList.remove('hidden'));
        logoutOptions.forEach(btn => btn.classList.add('hidden'));
        const commentBtn = document.getElementById('submit-comment-btn');
        if (commentBtn) { commentBtn.disabled = true; commentBtn.textContent = 'Inicia sesión para comentar'; }
    }
}

// ========== COMENTARIOS ==========
function renderComments() {
    const container = document.getElementById('comments-list');
    if (!container) return;
    if (comments.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center">No hay comentarios aún. ¡Sé el primero!</p>';
        return;
    }
    let html = '';
    comments.slice().reverse().forEach(c => {
        html += `<div class="bg-white rounded-xl shadow p-4 comment-card"><div class="flex items-center gap-2"><i class="fas fa-user-circle text-indigo-500 text-xl"></i><span class="font-bold">${escapeHtml(c.userName)}</span><span class="text-xs text-gray-400">${new Date(c.date).toLocaleString()}</span></div><p class="mt-2 text-gray-700">${escapeHtml(c.text)}</p></div>`;
    });
    container.innerHTML = html;
}

async function addComment(text) {
    if (!currentUser) throw new Error('Debes iniciar sesión');
    const newComment = { id: Date.now(), userName: currentUser.name, text: text.trim(), date: new Date().toISOString() };
    comments.push(newComment);
    saveComments();
}

// ========== PROYECTOS (ADMIN) ==========
async function addProject(title, description, techString, icon) {
    const techs = techString.split(',').map(t => t.trim()).filter(t => t);
    const newProject = { id: Date.now(), title, description, technologies: techs, icon: icon || 'fas fa-laptop-code' };
    projects.push(newProject);
    saveProjects();
}

// ========== ANIMACIÓN DE FÚTBOL (CANVAS) ==========
function initFootballAnimation() {
    const canvas = document.getElementById('footballCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Tamaño fijo del canvas (600x200) pero responsive por CSS
    canvas.width = 600;
    canvas.height = 200;
    
    let frame = 0;
    let whiteX = 80;
    let redX = 500;
    let ballX = 300;
    let ballY = 100;
    let directionWhite = 1;   // 1 derecha, -1 izquierda
    let directionRed = -1;
    let ballDir = 1;
    
    function drawField() {
        // Césped
        ctx.fillStyle = '#2e7d32';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Líneas
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvas.width/2, 0);
        ctx.lineTo(canvas.width/2, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(canvas.width/2, canvas.height/2, 20, 0, 2 * Math.PI);
        ctx.stroke();
        // Área
        ctx.strokeRect(30, canvas.height/2 - 30, 40, 60);
        ctx.strokeRect(canvas.width - 70, canvas.height/2 - 30, 40, 60);
    }
    
    function drawPlayer(x, y, color) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Ojos
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(x - 4, y - 3, 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 4, y - 3, 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x - 4, y - 3, 1, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 4, y - 3, 1, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    function drawBall(x, y) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#f5f5dc';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Detalles
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x + 4, y);
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y + 4);
        ctx.stroke();
    }
    
    function updatePositions() {
        // Movimiento de jugadores
        whiteX += directionWhite * 1.5;
        redX += directionRed * 1.2;
        
        if (whiteX > canvas.width - 40) directionWhite = -1;
        if (whiteX < 40) directionWhite = 1;
        if (redX > canvas.width - 40) directionRed = -1;
        if (redX < 40) directionRed = 1;
        
        // Movimiento del balón (persigue al jugador blanco o rojo según frame)
        if (frame % 120 < 60) {
            // Persigue al blanco
            if (ballX < whiteX) ballX += 1.2;
            else if (ballX > whiteX) ballX -= 1.2;
            if (ballY < 100) ballY += 0.8;
            else if (ballY > 100) ballY -= 0.8;
        } else {
            // Persigue al rojo
            if (ballX < redX) ballX += 1.2;
            else if (ballX > redX) ballX -= 1.2;
            if (ballY < 100) ballY += 0.8;
            else if (ballY > 100) ballY -= 0.8;
        }
        
        // Limitar el balón dentro del campo
        ballX = Math.min(Math.max(ballX, 10), canvas.width - 10);
        ballY = Math.min(Math.max(ballY, 20), canvas.height - 20);
        
        frame++;
    }
    
    function animate() {
        updatePositions();
        drawField();
        drawPlayer(whiteX, 100, '#ffffff'); // Blanco
        drawPlayer(redX, 100, '#e53935');   // Rojo
        drawBall(ballX, ballY);
        requestAnimationFrame(animate);
    }
    
    animate();
}

// ========== EVENTOS DE LA UI ==========
function setupEventListeners() {
    // Menú móvil
    const menuBtn = document.getElementById('menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
        menuBtn.onclick = () => {
            if (mobileMenu.style.maxHeight && mobileMenu.style.maxHeight !== '0px') mobileMenu.style.maxHeight = '0px';
            else mobileMenu.style.maxHeight = mobileMenu.scrollHeight + 'px';
        };
    }

    // Perfil dropdown
    const profileBtn = document.getElementById('profile-btn');
    const dropdown = document.getElementById('dropdown-menu');
    if (profileBtn && dropdown) {
        profileBtn.onclick = (e) => { e.stopPropagation(); dropdown.classList.toggle('hidden'); };
        document.addEventListener('click', () => dropdown.classList.add('hidden'));
    }

    // Modal auth
    const modal = document.getElementById('auth-modal');
    const openLogin = () => { document.getElementById('auth-mode').value = 'login'; document.getElementById('modal-title').innerText = 'Iniciar sesión'; modal.classList.remove('hidden'); };
    const openRegister = () => { document.getElementById('auth-mode').value = 'register'; document.getElementById('modal-title').innerText = 'Registrarse'; modal.classList.remove('hidden'); };
    document.getElementById('login-option')?.addEventListener('click', openLogin);
    document.getElementById('register-option')?.addEventListener('click', openRegister);
    document.getElementById('mobile-login-btn')?.addEventListener('click', openLogin);
    document.getElementById('mobile-register-btn')?.addEventListener('click', openRegister);
    document.getElementById('close-modal')?.addEventListener('click', () => modal.classList.add('hidden'));

    document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        const mode = document.getElementById('auth-mode').value;
        const errorSpan = document.getElementById('auth-error');
        try {
            if (mode === 'register') {
                await register(email, password);
                errorSpan.innerText = 'Registro exitoso. Ahora inicia sesión.';
                document.getElementById('auth-mode').value = 'login';
                document.getElementById('modal-title').innerText = 'Iniciar sesión';
            } else {
                const user = await login(email, password);
                setCurrentUser(user);
                modal.classList.add('hidden');
            }
        } catch (err) { errorSpan.innerText = err.message; }
    });

    // Logout
    const logout = () => { setCurrentUser(null); location.reload(); };
    document.getElementById('logout-option')?.addEventListener('click', logout);
    document.getElementById('mobile-logout-btn')?.addEventListener('click', logout);

    // Admin modal
    const adminModal = document.getElementById('admin-modal');
    const openAdminModal = () => adminModal.classList.remove('hidden');
    const closeAdminModal = () => adminModal.classList.add('hidden');
    document.getElementById('admin-panel-option')?.addEventListener('click', openAdminModal);
    document.getElementById('mobile-admin-btn')?.addEventListener('click', openAdminModal);
    document.getElementById('admin-add-project-btn')?.addEventListener('click', openAdminModal);
    document.getElementById('close-admin-modal')?.addEventListener('click', closeAdminModal);
    document.getElementById('project-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('proj-title').value;
        const desc = document.getElementById('proj-desc').value;
        const tech = document.getElementById('proj-tech').value;
        const icon = document.getElementById('proj-icon').value;
        await addProject(title, desc, tech, icon);
        closeAdminModal();
        document.getElementById('project-form').reset();
    });

    // Comentarios
    document.getElementById('new-comment-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const textarea = document.getElementById('comment-text');
        const text = textarea.value.trim();
        if (!text) return;
        try {
            await addComment(text);
            textarea.value = '';
            renderComments();
        } catch (err) { alert(err.message); }
    });
}

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', async () => {
    loadData();
    await createAdminIfNotExists();
    loadCurrentUser();
    setupEventListeners();
    renderProjects();
    renderSkills();
    renderComments();
    initFootballAnimation(); // Iniciar la animación del fútbol

    // Typing effect
    const typedSpan = document.getElementById('typed-text');
    const roles = ["Desarrollador Full Stack", "SQL Nivel Medio", "PHP Básico", "JavaScript Moderno"];
    let i = 0, j = 0, del = false;
    function type() {
        if (!typedSpan) return;
        let cur = roles[i];
        if (del) {
            typedSpan.textContent = cur.substring(0, j - 1);
            j--;
            if (j === 0) { del = false; i = (i + 1) % roles.length; setTimeout(type, 400); return; }
            setTimeout(type, 60);
        } else {
            typedSpan.textContent = cur.substring(0, j + 1);
            j++;
            if (j === cur.length) { del = true; setTimeout(type, 1800); return; }
            setTimeout(type, 100);
        }
    }
    type();

    // Scroll reveal
    const reveals = document.querySelectorAll('.reveal');
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1 });
    reveals.forEach(r => obs.observe(r));

// ==================== LÓGICA DEL PARTIDO DE FÚTBOL 11 vs 11 ====================
class Vector2 {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vector2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vector2(this.x * s, this.y * s); }
    mag() { return Math.hypot(this.x, this.y); }
    normalize() { let m = this.mag(); return m === 0 ? new Vector2(0,0) : new Vector2(this.x/m, this.y/m); }
}

class Player {
    constructor(x, y, team, id) {
        this.pos = new Vector2(x, y);
        this.team = team; // 'white' or 'red'
        this.id = id;
        this.radius = 10;
        this.speed = 3;
        this.hasBall = false;
        this.kickCooldown = 0;
    }
}

class FootballMatch {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.players = [];
        this.ball = { pos: new Vector2(this.width/2, this.height/2), radius: 6, owner: null };
        this.whiteScore = 0;
        this.redScore = 0;
        this.initPlayers();
        this.lastTimestamp = 0;
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initPlayers() {
        // Porteros: blanco en (50, height/2), rojo en (width-50, height/2)
        // Defensas, mediocampistas, delanteros distribuidos en formación 4-4-2
        const whitePositions = [
            {x: 50, y: this.height/2}, // portero
            {x: 150, y: this.height/2 - 70}, {x: 150, y: this.height/2 + 70}, {x: 200, y: this.height/2 - 40}, {x: 200, y: this.height/2 + 40}, // defensas
            {x: 320, y: this.height/2 - 60}, {x: 320, y: this.height/2 + 60}, {x: 380, y: this.height/2 - 30}, {x: 380, y: this.height/2 + 30}, // medios
            {x: 500, y: this.height/2 - 50}, {x: 500, y: this.height/2 + 50}, {x: 580, y: this.height/2} // delanteros
        ];
        const redPositions = [
            {x: this.width-50, y: this.height/2}, // portero
            {x: this.width-150, y: this.height/2 - 70}, {x: this.width-150, y: this.height/2 + 70}, {x: this.width-200, y: this.height/2 - 40}, {x: this.width-200, y: this.height/2 + 40},
            {x: this.width-320, y: this.height/2 - 60}, {x: this.width-320, y: this.height/2 + 60}, {x: this.width-380, y: this.height/2 - 30}, {x: this.width-380, y: this.height/2 + 30},
            {x: this.width-500, y: this.height/2 - 50}, {x: this.width-500, y: this.height/2 + 50}, {x: this.width-580, y: this.height/2}
        ];
        for(let i=0; i<11; i++) {
            this.players.push(new Player(whitePositions[i].x, whitePositions[i].y, 'white', i));
        }
        for(let i=0; i<11; i++) {
            this.players.push(new Player(redPositions[i].x, redPositions[i].y, 'red', i+11));
        }
        // Asignar balón aleatoriamente a un jugador del equipo blanco para empezar
        const starter = this.players.find(p => p.team === 'white');
        if(starter) {
            this.ball.owner = starter;
            starter.hasBall = true;
            this.ball.pos = starter.pos;
        }
    }

    update() {
        // Movimiento de jugadores (IA simple: se mueven hacia el balón si no lo tienen, o hacia la portería contraria si lo tienen)
        for(let player of this.players) {
            if(player.hasBall) {
                // Moverse hacia la portería contraria (blancos hacia derecha, rojos izquierda)
                let targetX = player.team === 'white' ? this.width - 80 : 80;
                let targetY = this.height/2;
                let dir = new Vector2(targetX - player.pos.x, targetY - player.pos.y).normalize();
                player.pos = player.pos.add(dir.mul(player.speed));
                // Limitar dentro del campo
                player.pos.x = Math.min(Math.max(player.pos.x, 30), this.width-30);
                player.pos.y = Math.min(Math.max(player.pos.y, 40), this.height-40);
                this.ball.pos = player.pos; // balón sigue al jugador
                // Disparar a portería si está cerca y fuera del cooldown
                if(player.kickCooldown <= 0) {
                    let goalX = (player.team === 'white') ? this.width - 20 : 20;
                    let goalY = this.height/2;
                    let distToGoal = Math.hypot(player.pos.x - goalX, player.pos.y - goalY);
                    if(distToGoal < 100 && Math.random() < 0.02) { // 2% de disparo por frame
                        this.shoot(player, goalX, goalY);
                        player.kickCooldown = 30;
                    }
                    // Pase a compañero cercano
                    let teammates = this.players.filter(p => p.team === player.team && p !== player);
                    let bestTeammate = null;
                    let minDist = 150;
                    for(let mate of teammates) {
                        let d = Math.hypot(player.pos.x - mate.pos.x, player.pos.y - mate.pos.y);
                        if(d < minDist && d > 20 && mate.kickCooldown === 0) {
                            minDist = d;
                            bestTeammate = mate;
                        }
                    }
                    if(bestTeammate && Math.random() < 0.01) { // 1% de pase
                        this.pass(player, bestTeammate);
                        player.kickCooldown = 20;
                    }
                }
                if(player.kickCooldown > 0) player.kickCooldown--;
            } else {
                // Sin balón: moverse hacia el balón
                let dir = new Vector2(this.ball.pos.x - player.pos.x, this.ball.pos.y - player.pos.y).normalize();
                player.pos = player.pos.add(dir.mul(player.speed * 0.8));
                player.pos.x = Math.min(Math.max(player.pos.x, 30), this.width-30);
                player.pos.y = Math.min(Math.max(player.pos.y, 40), this.height-40);
                // Robar balón si está muy cerca y balón no tiene dueño o dueño rival
                let distToBall = Math.hypot(player.pos.x - this.ball.pos.x, player.pos.y - this.ball.pos.y);
                if(distToBall < player.radius + this.ball.radius && !this.ball.owner) {
                    this.ball.owner = player;
                    player.hasBall = true;
                } else if(distToBall < player.radius + this.ball.radius && this.ball.owner && this.ball.owner.team !== player.team) {
                    // robar a rival
                    if(this.ball.owner) this.ball.owner.hasBall = false;
                    this.ball.owner = player;
                    player.hasBall = true;
                }
            }
        }
        // Si el balón está libre (sin dueño) se mueve aleatoriamente
        if(!this.ball.owner) {
            this.ball.pos = this.ball.pos.add(new Vector2((Math.random() - 0.5)*2, (Math.random()-0.5)*2));
            this.ball.pos.x = Math.min(Math.max(this.ball.pos.x, 20), this.width-20);
            this.ball.pos.y = Math.min(Math.max(this.ball.pos.y, 20), this.height-20);
        }
        // Revisar goles
        this.checkGoal();
    }

    shoot(shooter, targetX, targetY) {
        // Dirección del disparo hacia la portería
        let dir = new Vector2(targetX - shooter.pos.x, targetY - shooter.pos.y).normalize();
        let power = 12;
        this.ball.owner = null;
        shooter.hasBall = false;
        let velocity = dir.mul(power);
        // Simular trayectoria del balón (en update después se moverá)
        let ballSim = { pos: shooter.pos, vel: velocity };
        // Detectar si el portero ataja
        let goalkeeper = this.players.find(p => p.team !== shooter.team && (p.id === 0 || p.id === 11));
        if(goalkeeper) {
            let gkPos = goalkeeper.pos;
            let ballFinalX = ballSim.pos.x + ballSim.vel.x * 10;
            let ballFinalY = ballSim.pos.y + ballSim.vel.y * 10;
            let distToGK = Math.hypot(ballFinalX - gkPos.x, ballFinalY - gkPos.y);
            if(distToGK < goalkeeper.radius + 10 && Math.random() < 0.7) {
                // Atajó
                this.ball.pos = gkPos;
                this.ball.owner = goalkeeper;
                goalkeeper.hasBall = true;
                return;
            }
        }
        // Si no ataja, marcar gol
        let isGoal = false;
        if(shooter.team === 'white' && targetX === this.width-20) {
            this.whiteScore++;
            isGoal = true;
        } else if(shooter.team === 'red' && targetX === 20) {
            this.redScore++;
            isGoal = true;
        }
        if(isGoal) {
            this.updateScoreUI();
            this.resetAfterGoal();
        } else {
            // Balón sigue su curso, se asigna a jugador cercano
            this.ball.pos = ballSim.pos;
            let nearest = null;
            let minD = 50;
            for(let p of this.players) {
                let d = Math.hypot(this.ball.pos.x - p.pos.x, this.ball.pos.y - p.pos.y);
                if(d < minD) { minD = d; nearest = p; }
            }
            if(nearest) {
                this.ball.owner = nearest;
                nearest.hasBall = true;
            }
        }
    }

    pass(passer, receiver) {
        passer.hasBall = false;
        receiver.hasBall = true;
        this.ball.owner = receiver;
        this.ball.pos = receiver.pos;
    }

    checkGoal() {
        // Gol si balón entra en portería (blanca: x<30 y y cerca del centro; roja: x>width-30)
        if(this.ball.pos.x < 30 && Math.abs(this.ball.pos.y - this.height/2) < 50) {
            this.redScore++; // gol en contra de blanco? Revisar: si balón entra portería blanca es gol de rojo
            this.updateScoreUI();
            this.resetAfterGoal();
        } else if(this.ball.pos.x > this.width-30 && Math.abs(this.ball.pos.y - this.height/2) < 50) {
            this.whiteScore++;
            this.updateScoreUI();
            this.resetAfterGoal();
        }
    }

    resetAfterGoal() {
        // Reiniciar posiciones y balón
        this.players.forEach(p => p.hasBall = false);
        // Recolocar jugadores en formaciones iniciales
        const whitePositions = [
            {x: 50, y: this.height/2},
            {x: 150, y: this.height/2 - 70}, {x: 150, y: this.height/2 + 70}, {x: 200, y: this.height/2 - 40}, {x: 200, y: this.height/2 + 40},
            {x: 320, y: this.height/2 - 60}, {x: 320, y: this.height/2 + 60}, {x: 380, y: this.height/2 - 30}, {x: 380, y: this.height/2 + 30},
            {x: 500, y: this.height/2 - 50}, {x: 500, y: this.height/2 + 50}, {x: 580, y: this.height/2}
        ];
        const redPositions = [
            {x: this.width-50, y: this.height/2},
            {x: this.width-150, y: this.height/2 - 70}, {x: this.width-150, y: this.height/2 + 70}, {x: this.width-200, y: this.height/2 - 40}, {x: this.width-200, y: this.height/2 + 40},
            {x: this.width-320, y: this.height/2 - 60}, {x: this.width-320, y: this.height/2 + 60}, {x: this.width-380, y: this.height/2 - 30}, {x: this.width-380, y: this.height/2 + 30},
            {x: this.width-500, y: this.height/2 - 50}, {x: this.width-500, y: this.height/2 + 50}, {x: this.width-580, y: this.height/2}
        ];
        for(let i=0; i<11; i++) {
            this.players[i].pos = new Vector2(whitePositions[i].x, whitePositions[i].y);
        }
        for(let i=0; i<11; i++) {
            this.players[i+11].pos = new Vector2(redPositions[i].x, redPositions[i].y);
        }
        this.ball.pos = new Vector2(this.width/2, this.height/2);
        // Nuevo dueño aleatorio del equipo blanco
        let starter = this.players.find(p => p.team === 'white');
        this.ball.owner = starter;
        starter.hasBall = true;
    }

    updateScoreUI() {
        document.getElementById('score-white').innerText = this.whiteScore;
        document.getElementById('score-red').innerText = this.redScore;
    }

    drawField() {
        let ctx = this.ctx;
        ctx.fillStyle = '#2e7d32';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.width/2, 0);
        ctx.lineTo(this.width/2, this.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.width/2, this.height/2, 40, 0, 2*Math.PI);
        ctx.stroke();
        ctx.strokeRect(40, this.height/2-60, 40, 120);
        ctx.strokeRect(this.width-80, this.height/2-60, 40, 120);
        // Círculo central
        ctx.beginPath();
        ctx.arc(this.width/2, this.height/2, 10, 0, 2*Math.PI);
        ctx.fillStyle = 'white';
        ctx.fill();
    }

    drawPlayer(p) {
        let ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius, 0, 2*Math.PI);
        ctx.fillStyle = p.team === 'white' ? '#f8fafc' : '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Ojos
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(p.pos.x-3, p.pos.y-3, 2, 0, 2*Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.pos.x+3, p.pos.y-3, 2, 0, 2*Math.PI);
        ctx.fill();
        if(p.hasBall) {
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, p.radius+3, 0, 2*Math.PI);
            ctx.strokeStyle = 'gold';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    drawBall() {
        let ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(this.ball.pos.x, this.ball.pos.y, this.ball.radius, 0, 2*Math.PI);
        ctx.fillStyle = '#facc15';
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(this.ball.pos.x-3, this.ball.pos.y);
        ctx.lineTo(this.ball.pos.x+3, this.ball.pos.y);
        ctx.moveTo(this.ball.pos.x, this.ball.pos.y-3);
        ctx.lineTo(this.ball.pos.x, this.ball.pos.y+3);
        ctx.stroke();
    }

    draw() {
        this.drawField();
        for(let p of this.players) this.drawPlayer(p);
        this.drawBall();
    }

    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(this.animate);
    }
}

// Iniciar el partido cuando el DOM esté listo (dentro del DOMContentLoaded existente)
// Añadir al final del bloque DOMContentLoaded:
function initFootball() {
    if(document.getElementById('footballCanvas')) {
        new FootballMatch('footballCanvas');
    }
}
// Llamar a initFootball() dentro del DOMContentLoaded existente (después de los demás)

});