// Variáveis globais
let authToken = localStorage.getItem('authToken');
let currentFolderId = 0; // 0 = pasta raiz
let currentUser = null;
let viewMode = 'grid'; // grid ou list
let selectedItems = [];

// Variáveis para controle de token
let tokenRefreshTimer = null;
let lastActivity = Date.now();
const TOKEN_REFRESH_INTERVAL = 8 * 60 * 1000; // 8 minutos (antes dos 10 minutos de expiração)
const ACTIVITY_CHECK_INTERVAL = 30 * 1000; // Verifica atividade a cada 30 segundos

// Inicialização
document.addEventListener('DOMContentLoaded', async function() {
    // Primeiro, verificar se estamos em modo de setup (sem DB)
    try {
        const resp = await fetch('/api/setup/status');
        if (resp.ok) {
            const data = await resp.json();
            if (data.mode === 'setup') {
                showSetup();
                // Preencher presets, se houver
                const p = data.preset || {};
                if (p) {
                    if (p.host) document.getElementById('setup-host').value = p.host;
                    if (p.port) document.getElementById('setup-port').value = p.port;
                    if (p.db) document.getElementById('setup-db').value = p.db;
                    if (p.user) document.getElementById('setup-user').value = p.user;
                }
                bindSetupHandlers();
                return; // não seguir fluxo de login/dashboard
            }
        }
    } catch (e) {
        // segue fluxo normal
    }

    if (authToken) {
        // Verificar se o token ainda é válido
        const tokenValid = await validateToken();
        if (tokenValid) {
            showDashboard();
            startTokenManagement();
        } else {
            handleTokenExpired();
        }
    } else {
        showLogin();
    }
    
    setupEventListeners();
});

// === GERENCIAMENTO DE TOKEN JWT ===

async function validateToken() {
    if (!authToken) return false;
    
    try {
        const response = await fetch('/api/user-info', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function refreshToken() {
    if (!authToken) return false;
    
    // Mostrar indicador de renovação
    showTokenStatus(true);
    
    try {
        const response = await fetch('/api/refresh-token', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            authToken = data.access_token;
            localStorage.setItem('authToken', authToken);
            console.log('Token renovado automaticamente');
            return true;
        } else {
            console.log('Falha ao renovar token:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Erro ao renovar token:', error);
        return false;
    } finally {
        // Esconder indicador após um pequeno delay
        setTimeout(() => showTokenStatus(false), 1000);
    }
}

function showTokenStatus(show) {
    const tokenStatus = document.getElementById('token-status');
    if (tokenStatus) {
        tokenStatus.style.display = show ? 'flex' : 'none';
    }
}

function startTokenManagement() {
    // Configurar renovação automática do token
    tokenRefreshTimer = setInterval(async () => {
        const renewed = await refreshToken();
        if (!renewed) {
            handleTokenExpired();
        }
    }, TOKEN_REFRESH_INTERVAL);
    
    // Monitorar atividade do usuário
    startActivityMonitoring();
}

function stopTokenManagement() {
    if (tokenRefreshTimer) {
        clearInterval(tokenRefreshTimer);
        tokenRefreshTimer = null;
    }
    stopActivityMonitoring();
}

function startActivityMonitoring() {
    // Registrar atividade em eventos do usuário
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    activityEvents.forEach(event => {
        document.addEventListener(event, updateLastActivity, true);
    });
    
    // Verificar inatividade periodicamente
    setInterval(checkInactivity, ACTIVITY_CHECK_INTERVAL);
}

function stopActivityMonitoring() {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    activityEvents.forEach(event => {
        document.removeEventListener(event, updateLastActivity, true);
    });
}

function updateLastActivity() {
    lastActivity = Date.now();
}

function checkInactivity() {
    const inactiveTime = Date.now() - lastActivity;
    const maxInactiveTime = 15 * 60 * 1000; // 15 minutos de inatividade
    
    if (inactiveTime > maxInactiveTime && authToken) {
        handleTokenExpired('Sessão expirada por inatividade');
    }
}

function handleTokenExpired(message = 'Sessão expirada por segurança') {
    stopTokenManagement();
    
    // Limpar dados de autenticação
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    currentFolderId = 0;
    selectedItems = [];
    
    // Mostrar notificação
    showNotification(message, 'warning');
    
    // Redirecionar para login após um pequeno delay
    setTimeout(() => {
        showLogin();
    }, 1500);
}

// === INTERCEPTADOR DE REQUISIÇÕES ===

// Função auxiliar para fazer requisições com tratamento automático de token expirado
async function makeAuthenticatedRequest(url, options = {}) {
    if (!authToken) {
        throw new Error('Token de autenticação não encontrado');
    }
    
    // Adicionar cabeçalho de autenticação
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${authToken}`
    };
    
    const requestOptions = {
        ...options,
        headers
    };
    
    try {
        const response = await fetch(url, requestOptions);
        
        // Se token expirou (401), tentar renovar uma vez
        if (response.status === 401) {
            const renewed = await refreshToken();
            if (renewed) {
                // Tentar novamente com o token renovado
                requestOptions.headers['Authorization'] = `Bearer ${authToken}`;
                return await fetch(url, requestOptions);
            } else {
                // Não foi possível renovar, fazer logout
                handleTokenExpired('Token expirado - faça login novamente');
                throw new Error('Token expirado');
            }
        }
        
        return response;
    } catch (error) {
        throw error;
    }
}

// Event Listeners
function setupEventListeners() {
    // Forms de login e registro
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    
    // Navegação entre telas
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        showRegister();
    });
    
    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        showLogin();
    });
    
    // Navegação da sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            showSection(section);
        });
    });
    
    // Upload de arquivos
    setupUploadHandlers();
    
    // Busca
    document.getElementById('search-input').addEventListener('input', handleSearch);
    
    // Breadcrumb navigation
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('breadcrumb-item')) {
            e.preventDefault();
            const folderId = parseInt(e.target.dataset.folderId);
            navigateToFolder(folderId);
        }
    });
    
    // Context menu (desktop)
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            closeSidebar();
        }
    });

    // Context menu (mobile) - long press
    bindLongPressContextMenu();

    // Sidebar toggle (mobile)
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    if (sidebarToggle && !sidebarToggle.__bound) {
        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarToggle.__bound = true;
    }
    if (sidebarBackdrop && !sidebarBackdrop.__bound) {
        sidebarBackdrop.addEventListener('click', closeSidebar);
        sidebarBackdrop.__bound = true;
    }

    // Bottom nav (mobile)
    const btnBottomFolder = document.getElementById('btn-bottom-folder');
    const btnBottomUpload = document.getElementById('btn-bottom-upload');
    const btnBottomSearch = document.getElementById('btn-bottom-search');
    if (btnBottomFolder && !btnBottomFolder.__bound) {
        btnBottomFolder.addEventListener('click', () => {
            showCreateFolderModal();
        });
        btnBottomFolder.__bound = true;
    }
    if (btnBottomUpload && !btnBottomUpload.__bound) {
        btnBottomUpload.addEventListener('click', () => {
            showUploadModal();
        });
        btnBottomUpload.__bound = true;
    }
    if (btnBottomSearch && !btnBottomSearch.__bound) {
        btnBottomSearch.addEventListener('click', () => {
            const input = document.getElementById('search-input');
            if (input) input.focus();
        });
        btnBottomSearch.__bound = true;
    }
    
    // Fechar dropdown do usuário ao clicar fora
    document.addEventListener('click', function(e) {
        const userMenuContainer = e.target.closest('.user-menu-container');
        const userDropdown = document.getElementById('user-dropdown');
        
        if (!userMenuContainer && userDropdown) {
            userDropdown.classList.remove('show');
        }
    });
    
    // Modal handlers
    document.getElementById('create-folder-form').addEventListener('submit', (e) => {
        e.preventDefault();
        createFolder();
    });
}

// Autenticação
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            const data = await response.json();
            authToken = data.access_token;
            currentUser = { id: data.user_id, username: data.username };
            localStorage.setItem('authToken', authToken);
            
            showDashboard();
            startTokenManagement(); // Iniciar gerenciamento de tokens
            showNotification('Login realizado com sucesso!', 'success');
        } else {
            const error = await response.json();
            showNotification('Erro no login: ' + (error.error || 'Credenciais inválidas'), 'error');
        }
    } catch (error) {
        showNotification('Erro de conexão: ' + error.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        if (response.ok) {
            showNotification('Conta criada com sucesso! Faça login.', 'success');
            showLogin();
        } else {
            const error = await response.json();
            showNotification('Erro no cadastro: ' + (error.error || 'Dados inválidos'), 'error');
        }
    } catch (error) {
        showNotification('Erro de conexão: ' + error.message, 'error');
    }
}

function logout() {
    // Fechar dropdown
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
    
    // Confirmar logout
    if (confirm('Tem certeza que deseja sair?')) {
        // Parar gerenciamento de tokens
        stopTokenManagement();
        
        // Limpar dados locais
        localStorage.removeItem('authToken');
        authToken = null;
        currentUser = null;
        currentFolderId = 0;
        selectedItems = [];
        
        // Limpar interface
        document.getElementById('files-grid').innerHTML = '';
        document.getElementById('username-display').textContent = 'Usuário';
        
        // Mostrar notificação
        showNotification('Logout realizado com sucesso!', 'success');
        
        // Voltar para tela de login
        setTimeout(() => {
            showLogin();
        }, 1000);
    }
}

// Navegação de telas
function showLogin() {
    hideAllScreens();
    document.getElementById('login-screen').classList.add('active');
}

function showRegister() {
    hideAllScreens();
    document.getElementById('register-screen').classList.add('active');
}

function showSetup() {
    hideAllScreens();
    const el = document.getElementById('setup-screen');
    if (el) el.classList.add('active');
}

function showDashboard() {
    hideAllScreens();
    document.getElementById('dashboard-screen').classList.add('active');
    if (currentUser) {
        document.getElementById('username-display').textContent = currentUser.username;
    }
    loadUserInfo();
    showSection('files');
}

function hideAllScreens() {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
}

// ===== Setup Handlers =====
function bindSetupHandlers() {
    const form = document.getElementById('setup-form');
    const testBtn = document.getElementById('setup-test-btn');
    if (form && !form.__bound) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = collectSetupPayload();
            const statusEl = document.getElementById('setup-status');
            statusEl.textContent = 'Aplicando configuração...';
            try {
                const resp = await fetch('/api/setup/db', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await resp.json().catch(()=>({}));
                if (!resp.ok || data.error) {
                    statusEl.textContent = 'Erro: ' + (data.error || 'Falha desconhecida');
                    return;
                }
                statusEl.textContent = 'Configuração aplicada! Carregando login...';
                setTimeout(() => {
                    // Após aplicar, mostrar tela de login
                    showLogin();
                }, 1000);
            } catch (e) {
                statusEl.textContent = 'Erro: ' + e.message;
            }
        });
        form.__bound = true;
    }
    if (testBtn && !testBtn.__bound) {
        testBtn.addEventListener('click', async () => {
            const payload = collectSetupPayload();
            const statusEl = document.getElementById('setup-status');
            statusEl.textContent = 'Testando conexão...';
            try {
                const resp = await fetch('/api/setup/db/ping', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await resp.json().catch(()=>({}));
                if (data.status === 'ok') {
                    statusEl.textContent = 'Conexão OK';
                } else {
                    statusEl.textContent = 'Erro: ' + (data.error || 'Falha na conexão');
                }
            } catch (e) {
                statusEl.textContent = 'Erro: ' + e.message;
            }
        });
        testBtn.__bound = true;
    }
}

function collectSetupPayload() {
    const host = document.getElementById('setup-host').value.trim();
    const port = document.getElementById('setup-port').value.trim() || '3306';
    const db = document.getElementById('setup-db').value.trim();
    const user = document.getElementById('setup-user').value.trim();
    const password = document.getElementById('setup-pass').value;
    const payload = { host, port, db, user };
    if (password !== '') payload.password = password;
    // Dados do primeiro usuário (opcionais)
    const fUser = (document.getElementById('first-username')?.value || '').trim();
    const fEmail = (document.getElementById('first-email')?.value || '').trim();
    const fPass = (document.getElementById('first-password')?.value || '').trim();
    const fAdmin = !!document.getElementById('first-is-admin')?.checked;
    if (fUser && fEmail && fPass) {
        payload.first_username = fUser;
        payload.first_email = fEmail;
        payload.first_password = fPass;
        payload.first_is_admin = fAdmin;
    }
    return payload;
}

// Navegação de seções
function showSection(sectionName) {
    // Atualizar navegação ativa
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section=\"${sectionName}\"]`).classList.add('active');
    
    // Esconder todas as seções
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    
    // Mostrar seção selecionada
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
    }
    
    // Atualizar título
    const titles = {
        'files': 'Meus Arquivos',
        'recent': 'Arquivos Recentes',
        'shares': 'Compartilhamentos',
        'favorites': 'Favoritos',
        'trash': 'Lixeira',
        'activities': 'Atividades',
        'system': 'Sistema',
        'users': 'Gerenciar Usuários',
        'profile': 'Configurações'
    };
    
    document.getElementById('section-title').textContent = titles[sectionName] || 'Dashboard';
    
    // Carregar conteúdo específico
    switch(sectionName) {
        case 'files':
            loadFiles(currentFolderId);
            refreshUserQuota(); // Atualizar cota quando abrir a seção de arquivos
            break;
        case 'recent':
            loadRecentFiles();
            break;
        case 'shares':
            loadShares();
            break;
        case 'activities':
            loadActivities();
            break;
        case 'system':
            loadSystemInfo();
            break;
        case 'profile':
            loadDbSettings();
            break;
        case 'users':
            loadUsers();
            break;
    }
}

// Gerenciamento de arquivos e pastas
async function loadFiles(folderId = 0) {
    try {
        const response = await makeAuthenticatedRequest(`/api/files?folder_id=${folderId}`);
        
        if (response.ok) {
            const data = await response.json();
            displayFiles(data.files || []);
            displayFolders(data.folders || []);
            updateBreadcrumb(data.path || []);
            currentFolderId = folderId;
        } else {
            showNotification('Erro ao carregar arquivos', 'error');
        }
    } catch (error) {
        if (error.message !== 'Token expirado') {
            showNotification('Erro de conexão: ' + error.message, 'error');
        }
    }
}

function displayFiles(files) {
    const grid = document.getElementById('files-grid');
    const emptyState = document.getElementById('empty-state');
    
    // Limpar grid existente (manter pastas)
    const existingFolders = grid.querySelectorAll('.folder-card');
    grid.innerHTML = '';
    existingFolders.forEach(folder => grid.appendChild(folder));
    
    if (files.length === 0 && grid.children.length === 0) {
        emptyState.classList.remove('d-none');
        return;
    } else {
        emptyState.classList.add('d-none');
    }
    
    files.forEach(file => {
        const fileCard = createFileCard(file);
        grid.appendChild(fileCard);
    });
}

function displayFolders(folders) {
    const grid = document.getElementById('files-grid');
    
    // Remover pastas existentes
    grid.querySelectorAll('.folder-card').forEach(folder => folder.remove());
    
    // Adicionar novas pastas no início
    folders.forEach((folder, index) => {
        const folderCard = createFolderCard(folder);
        grid.insertBefore(folderCard, grid.children[index]);
    });
}

function createFileCard(file) {
    const card = document.createElement('div');
    card.className = 'file-card fade-in';
    card.dataset.fileId = file.id;
    card.dataset.fileName = file.filename;
    card.dataset.fileData = JSON.stringify(file);
    
    const icon = getFileIcon(file.filename);
    const size = formatFileSize(file.size);
    const date = formatDate(file.upload_date);
    
    card.innerHTML = `
        <div class="file-actions">
            <button class="action-btn" onclick="previewFile(${file.id})" title="Visualizar">
                <i class="fas fa-eye"></i>
            </button>
            <button class="action-btn" onclick="downloadFile(${file.id})" title="Download">
                <i class="fas fa-download"></i>
            </button>
            <button class="action-btn" onclick="showShareModal(${file.id}, 'file')" title="Compartilhar">
                <i class="fas fa-share-alt"></i>
            </button>
            <button class="action-btn" onclick="deleteFile(${file.id})" title="Excluir">
                <i class="fas fa-trash"></i>
            </button>
            <button class="action-btn" onclick="showFileOptions(${file.id})" title="Mais opções">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
        <div class="file-icon">
            <i class="${icon}"></i>
        </div>
        <div class="file-name" title="${file.filename}">${file.filename}</div>
        <div class="file-info">
            <span>${size}</span>
            <span>${date}</span>
        </div>
    `;
    
    // Double click para preview
    card.addEventListener('dblclick', () => {
        previewFile(file.id);
    });
    
    return card;
}

function createFolderCard(folder) {
    const card = document.createElement('div');
    card.className = 'folder-card fade-in';
    card.dataset.folderId = folder.id;
    card.dataset.folderName = folder.name;
    
    const date = formatDate(folder.created_at);
    
    card.innerHTML = `
        <div class="file-actions">
            <button class="action-btn" onclick="showShareModal(${folder.id}, 'folder')" title="Compartilhar">
                <i class="fas fa-share-alt"></i>
            </button>
            <button class="action-btn" onclick="showFolderOptions(${folder.id})" title="Mais opções">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
        <div class="folder-icon">
            <i class="fas fa-folder"></i>
        </div>
        <div class="folder-name" title="${folder.name}">${folder.name}</div>
        <div class="file-info">
            <span>Pasta</span>
            <span>${date}</span>
        </div>
    `;
    
    // Double click para navegar
    card.addEventListener('dblclick', () => {
        navigateToFolder(folder.id);
    });
    
    return card;
}

// Navegação de pastas
function navigateToFolder(folderId) {
    currentFolderId = folderId;
    loadFiles(folderId);
}

function updateBreadcrumb(path) {
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = `
        <a href="#" class="breadcrumb-item" data-folder-id="0">
            <i class="fas fa-home"></i> Início
        </a>
    `;
    
    path.forEach((folder, index) => {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.innerHTML = '<i class="fas fa-chevron-right"></i>';
        breadcrumb.appendChild(separator);
        
        const item = document.createElement('a');
        item.href = '#';
        item.className = 'breadcrumb-item';
        item.dataset.folderId = folder.id;
        item.textContent = folder.name;
        
        if (index === path.length - 1) {
            item.classList.add('active');
        }
        
        breadcrumb.appendChild(item);
    });
}

// Criação de pasta
async function createFolder() {
    const name = document.getElementById('folder-name').value.trim();
    
    if (!name) {
        showNotification('Digite um nome para a pasta', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                parent_id: currentFolderId
            })
        });
        
        if (response.ok) {
            closeModal('create-folder-modal');
            document.getElementById('folder-name').value = '';
            showNotification('Pasta criada com sucesso!', 'success');
            loadFiles(currentFolderId);
        } else {
            const error = await response.json();
            showNotification('Erro ao criar pasta: ' + (error.error || 'Erro desconhecido'), 'error');
        }
    } catch (error) {
        showNotification('Erro de conexão: ' + error.message, 'error');
    }
}

// Upload de arquivos
function setupUploadHandlers() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    
    fileInput.addEventListener('change', handleFileSelect);
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    uploadFiles(files);
}

async function uploadFiles(files) {
    const progressContainer = document.getElementById('upload-progress-container');
    progressContainer.innerHTML = '';
    
    for (const file of files) {
        await uploadSingleFile(file, progressContainer);
    }
    
    // Recarregar arquivos e atualizar cota após upload
    setTimeout(() => {
        loadFiles(currentFolderId);
        refreshUserQuota();
        closeModal('upload-modal');
    }, 1000);
}

async function uploadSingleFile(file, progressContainer) {
    const progressDiv = document.createElement('div');
    progressDiv.className = 'progress-container';
    progressDiv.innerHTML = `
        <div class="progress-item">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span class="file-name">${file.name}</span>
                <span class="progress-status">0%</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: 0%"></div>
            </div>
        </div>
    `;
    progressContainer.appendChild(progressDiv);
    
    const progressBar = progressDiv.querySelector('.progress-bar');
    const progressStatus = progressDiv.querySelector('.progress-status');
    
    const formData = new FormData();
    formData.append('file', file);
    if (currentFolderId > 0) {
        formData.append('folder_id', currentFolderId);
    }
    
    try {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressBar.style.width = percent + '%';
                progressStatus.textContent = percent + '%';
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                progressStatus.textContent = 'Concluído';
                progressBar.style.backgroundColor = 'var(--accent-color)';
            } else {
                progressStatus.textContent = 'Erro';
                progressBar.style.backgroundColor = 'var(--danger-color)';
            }
        });
        
        xhr.addEventListener('error', () => {
            progressStatus.textContent = 'Erro';
            progressBar.style.backgroundColor = 'var(--danger-color)';
        });
        
        xhr.open('POST', '/api/upload');
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.send(formData);
        
    } catch (error) {
        progressStatus.textContent = 'Erro: ' + error.message;
        progressBar.style.backgroundColor = 'var(--danger-color)';
    }
}

// Utilitários
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        // Imagens
        'jpg': 'fas fa-image', 'jpeg': 'fas fa-image', 'png': 'fas fa-image', 'gif': 'fas fa-image',
        'bmp': 'fas fa-image', 'svg': 'fas fa-image', 'webp': 'fas fa-image',
        
        // Documentos
        'pdf': 'fas fa-file-pdf', 'doc': 'fas fa-file-word', 'docx': 'fas fa-file-word',
        'xls': 'fas fa-file-excel', 'xlsx': 'fas fa-file-excel', 'ppt': 'fas fa-file-powerpoint',
        'pptx': 'fas fa-file-powerpoint', 'txt': 'fas fa-file-alt',
        
        // Código
        'html': 'fas fa-file-code', 'css': 'fas fa-file-code', 'js': 'fas fa-file-code',
        'py': 'fas fa-file-code', 'java': 'fas fa-file-code', 'cpp': 'fas fa-file-code',
        'php': 'fas fa-file-code', 'json': 'fas fa-file-code',
        
        // Áudio
        'mp3': 'fas fa-file-audio', 'wav': 'fas fa-file-audio', 'ogg': 'fas fa-file-audio',
        
        // Vídeo
        'mp4': 'fas fa-file-video', 'avi': 'fas fa-file-video', 'mkv': 'fas fa-file-video',
        
        // Arquivos
        'zip': 'fas fa-file-archive', 'rar': 'fas fa-file-archive', '7z': 'fas fa-file-archive'
    };
    
    return iconMap[ext] || 'fas fa-file';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function isPreviewable(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'pdf', 'txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a'].includes(ext);
}

function isTextFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'yml', 'yaml', 'sql', 'sh', 'bat', 'log'].includes(ext);
}

function isImageFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext);
}

function isVideoFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['mp4', 'webm', 'ogg', 'avi', 'mov', 'wmv', 'flv'].includes(ext);
}

function isAudioFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'wma'].includes(ext);
}

function isPdfFile(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ext === 'pdf';
}

// Modais
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

function showUploadModal() {
    showModal('upload-modal');
}

function showCreateFolderModal() {
    showModal('create-folder-modal');
}

// Busca
function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('.file-card, .folder-card');
    
    cards.forEach(card => {
        const name = (card.dataset.fileName || card.dataset.folderName || '').toLowerCase();
        if (name.includes(query)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// Alternância de visualização
function toggleView() {
    const grid = document.getElementById('files-grid');
    const icon = document.getElementById('view-toggle-icon');
    
    if (viewMode === 'grid') {
        viewMode = 'list';
        grid.classList.add('list-view');
        icon.className = 'fas fa-th-large';
    } else {
        viewMode = 'grid';
        grid.classList.remove('list-view');
        icon.className = 'fas fa-th';
    }
}

function refreshFiles() {
    loadFiles(currentFolderId);
    showNotification('Arquivos atualizados', 'success');
}

// Download
async function downloadFile(fileId) {
    try {
        const response = await makeAuthenticatedRequest(`/api/download/${fileId}`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'download';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            showNotification('Erro ao baixar arquivo', 'error');
        }
    } catch (error) {
        if (error.message !== 'Token expirado') {
            showNotification('Erro de conexão: ' + error.message, 'error');
        }
    }
}

// Exclusão de arquivo
async function deleteFile(fileId) {
    if (!confirm('Tem certeza que deseja excluir este arquivo? Esta ação não pode ser desfeita.')) {
        return;
    }
    try {
        const response = await makeAuthenticatedRequest(`/api/delete/${fileId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Arquivo excluído com sucesso', 'success');
            loadFiles(currentFolderId);
            refreshUserQuota(); // Atualizar cota após exclusão
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification('Erro ao excluir: ' + (err.error || response.statusText), 'error');
        }
    } catch (e) {
        if (e.message !== 'Token expirado') {
            showNotification('Erro de conexão: ' + e.message, 'error');
        }
    }
}

// Carregar outras seções
async function loadUserInfo() {
    try {
        const response = await makeAuthenticatedRequest('/api/user-info');
        
        if (response.ok) {
            const data = await response.json();
            updateUserQuotaDisplay(data);
        }
    } catch (error) {
        if (error.message !== 'Token expirado') {
            console.error('Erro ao carregar informações do usuário:', error);
        }
    }
}

function updateUserQuotaDisplay(data) {
    const quotaUsageText = document.getElementById('quota-usage-text');
    const quotaBarFill = document.getElementById('quota-bar-fill');
    const quotaPercentage = document.getElementById('quota-percentage');
    
    if (!quotaUsageText || !quotaBarFill || !quotaPercentage) {
        return; // Elementos não encontrados
    }
    
    // Calcular valores
    const usedBytes = data.storage_used || 0;
    const totalBytes = data.storage_quota || 1073741824; // 1GB padrão
    const percentage = Math.min((usedBytes / totalBytes) * 100, 100);
    
    // Formatar tamanhos
    const usedFormatted = formatFileSize(usedBytes);
    const totalFormatted = formatFileSize(totalBytes);
    
    // Atualizar textos
    quotaUsageText.textContent = `${usedFormatted} de ${totalFormatted} utilizados`;
    quotaPercentage.textContent = `${percentage.toFixed(1)}%`;
    
    // Atualizar barra de progresso
    quotaBarFill.style.width = `${percentage}%`;
    
    // Alterar cor da barra baseado no uso
    if (percentage >= 90) {
        quotaBarFill.style.background = 'linear-gradient(90deg, #dc3545, #c82333)'; // Vermelho
    } else if (percentage >= 75) {
        quotaBarFill.style.background = 'linear-gradient(90deg, #fd7e14, #e8590c)'; // Laranja
    } else {
        quotaBarFill.style.background = 'linear-gradient(90deg, #28a745, #20c997)'; // Verde
    }
}

// Função para atualizar quota após upload ou exclusão
function refreshUserQuota() {
    loadUserInfo();
}

async function loadRecentFiles() {
    // Implementar carregamento de arquivos recentes
}

async function loadShares() {
    try {
        const response = await fetch('/api/shares', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            // Implementar exibição de compartilhamentos
        }
    } catch (error) {
        console.error('Erro ao carregar compartilhamentos:', error);
    }
}

async function loadActivities() {
    try {
        const response = await fetch('/api/activities', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            // Implementar exibição de atividades
        }
    } catch (error) {
        console.error('Erro ao carregar atividades:', error);
    }
}

async function loadSystemInfo() {
    try {
        const response = await fetch('/api/system-info', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            updateSystemCharts(data);
            // Boot do refresco periódico (a cada 5s)
            if (!window.__sysInfoInterval) {
                window.__sysInfoInterval = setInterval(refreshSystemCharts, 5000);
            }
        }
    } catch (error) {
        console.error('Erro ao carregar informações do sistema:', error);
    }
}

// ===== Gráficos de Sistema (Chart.js) =====
let cpuChart, memChart, diskChart;
let cpuDataHistory = [];

function ensureCharts() {
    const cpuCtx = document.getElementById('cpuChart');
    const memCtx = document.getElementById('memChart');
    const diskCtx = document.getElementById('diskChart');
    if (!cpuCtx || !memCtx || !diskCtx) return false;
    if (!cpuChart) {
        cpuChart = new Chart(cpuCtx, {
            type: 'line',
            data: {
                labels: Array(20).fill(''),
                datasets: [{
                    label: 'CPU %',
                    data: Array(20).fill(0),
                    borderColor: '#0066cc',
                    backgroundColor: 'rgba(0,102,204,0.1)',
                    tension: 0.3,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { min: 0, max: 100, ticks: { callback: (v)=> v + '%'} },
                    x: { display: false }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
    if (!memChart) {
        memChart = new Chart(memCtx, {
            type: 'doughnut',
            data: {
                labels: ['Usado', 'Livre'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#28a745', '#e9ecef'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
    if (!diskChart) {
        diskChart = new Chart(diskCtx, {
            type: 'doughnut',
            data: {
                labels: ['Usado', 'Livre'],
                datasets: [{
                    data: [0, 100],
                    backgroundColor: ['#17a2b8', '#e9ecef'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
    return true;
}

function updateSystemCharts(data) {
    if (!ensureCharts()) return;
    // CPU histórico
    cpuDataHistory.push(Number(data.cpu_usage.toFixed(1)));
    if (cpuDataHistory.length > 60) cpuDataHistory.shift();
    const labels = Array(cpuDataHistory.length).fill('');
    cpuChart.data.labels = labels;
    cpuChart.data.datasets[0].data = cpuDataHistory;
    cpuChart.update('none');

    // Memória
    const memUsed = data.memory.percent;
    memChart.data.datasets[0].data = [memUsed, 100 - memUsed];
    memChart.update('none');
    const memStats = document.getElementById('mem-stats');
    if (memStats) {
        memStats.textContent = `Total: ${formatFileSize(data.memory.total)} | Disponível: ${formatFileSize(data.memory.available)} | Uso: ${memUsed.toFixed(1)}%`;
    }

    // Disco
    const diskUsedPercent = data.disk.percent;
    diskChart.data.datasets[0].data = [diskUsedPercent, 100 - diskUsedPercent];
    diskChart.update('none');
    const diskStats = document.getElementById('disk-stats');
    if (diskStats) {
        diskStats.textContent = `Total: ${formatFileSize(data.disk.total)} | Livre: ${formatFileSize(data.disk.free)} | Uso: ${diskUsedPercent.toFixed(1)}%`;
    }
}

async function refreshSystemCharts() {
    // Evitar rodar se a aba "system" não estiver ativa
    const section = document.getElementById('system-section');
    if (!section || !section.classList.contains('active')) return;
    try {
        const response = await fetch('/api/system-info', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.ok) {
            const data = await response.json();
            updateSystemCharts(data);
        }
    } catch (e) {
        // silencioso
    }
}

// Notificações
function showNotification(message, type = 'info') {
    // Criar elemento de notificação
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Adicionar estilos se não existirem
    if (!document.querySelector('#notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                border-radius: var(--border-radius);
                box-shadow: var(--shadow-hover);
                padding: 1rem;
                display: flex;
                align-items: center;
                gap: 1rem;
                z-index: 10001;
                min-width: 300px;
                animation: slideInRight 0.3s ease;
            }
            .notification-success { border-left: 4px solid var(--accent-color); }
            .notification-error { border-left: 4px solid var(--danger-color); }
            .notification-warning { border-left: 4px solid var(--warning-color); }
            .notification-info { border-left: 4px solid var(--info-color); }
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(notification);
    
    // Remover automaticamente após 5 segundos
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'exclamation-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Criar compartilhamento a partir do modal
async function createShare() {
    try {
        if (!window.__shareContext) {
            showNotification('Nenhum item selecionado para compartilhar', 'warning');
            return;
        }
        const { id, type } = window.__shareContext;
        const shareType = document.getElementById('share-type')?.value || 'public';
        const canEdit = (document.getElementById('share-permission')?.value === 'write');
        const payload = {
            is_public: shareType === 'public',
            can_edit: canEdit,
            can_download: true
        };
        if (type === 'file') payload.file_id = id; else payload.folder_id = id;

        const resp = await fetch('/api/share', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || 'Falha ao criar compartilhamento');
        }

        const data = await resp.json();
        const linkInput = document.getElementById('share-link');
        const linkContainer = document.getElementById('share-link-container');
        if (linkInput) linkInput.value = data.share_url;
        if (linkContainer) linkContainer.classList.remove('d-none');
        showNotification('Link de compartilhamento criado!', 'success');
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

// Context menu e menu de usuário
function handleContextMenu(e) {
    const card = e.target.closest('.file-card, .folder-card');
    const menu = document.getElementById('context-menu');
    if (!menu) return;
    if (!card) {
        hideContextMenu();
        return;
    }
    e.preventDefault();
    openContextMenuForCard(card, e.clientX, e.clientY);
}

function openContextMenuForCard(card, clientX, clientY) {
    const menu = document.getElementById('context-menu');
    if (!menu || !card) return;
    const isFile = card.classList.contains('file-card');
    const ctx = {
        type: isFile ? 'file' : 'folder',
        id: isFile ? Number(card.dataset.fileId) : Number(card.dataset.folderId),
        name: isFile ? card.dataset.fileName : card.dataset.folderName,
        data: null
    };
    try { if (isFile && card.dataset.fileData) ctx.data = JSON.parse(card.dataset.fileData); } catch (_) {}
    window.__contextItem = ctx;
    document.querySelectorAll('.file-card.selected, .folder-card.selected').forEach(el => el.classList.remove('selected'));
    card.classList.add('selected');
    const show = (sel, visible) => {
        const el = menu.querySelector(sel);
        if (el) el.style.display = visible ? 'flex' : 'none';
    };
    const isText = ctx.type === 'file' && ctx.name && isTextFile(ctx.name);
    const isFolder = ctx.type === 'folder';
    show('[data-action="preview"]', true);
    show('[data-action="download"]', !isFolder);
    show('[data-action="share"]', true);
    show('[data-action="edit"]', !isFolder && isText);
    show('[data-action="rename"]', !isFolder);
    show('[data-action="delete"]', !isFolder);
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const rect = { w: 220, h: 260 };
    let x = clientX;
    let y = clientY;
    if (x + rect.w > viewportW) x = viewportW - rect.w - 10;
    if (y + rect.h > viewportH) y = viewportH - rect.h - 10;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.remove('d-none');
}

function bindLongPressContextMenu() {
    const state = { timer: null, card: null, x: 0, y: 0, triggered: false };
    const cancel = () => {
        if (state.timer) clearTimeout(state.timer);
        state.timer = null;
        state.card = null;
        state.triggered = false;
    };
    document.addEventListener('touchstart', (e) => {
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        const card = e.target.closest && e.target.closest('.file-card, .folder-card');
        if (!card) { cancel(); return; }
        state.card = card;
        state.x = touch.clientX;
        state.y = touch.clientY;
        state.triggered = false;
        state.timer = setTimeout(() => {
            openContextMenuForCard(state.card, state.x, state.y);
            state.triggered = true;
        }, 500);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!state.card) return;
        const touch = e.touches && e.touches[0];
        if (!touch) return;
        const dx = Math.abs(touch.clientX - state.x);
        const dy = Math.abs(touch.clientY - state.y);
        if (dx > 10 || dy > 10) cancel();
    }, { passive: true });
    document.addEventListener('touchend', () => {
        if (!state.triggered) cancel();
    }, { passive: true });
    document.addEventListener('touchcancel', () => cancel(), { passive: true });
}

function toggleSidebar() {
    document.body.classList.toggle('sidebar-open');
}

function closeSidebar() {
    document.body.classList.remove('sidebar-open');
}

function hideContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.classList.add('d-none');
    }
}

function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

function showUserInfo() {
    // Fechar dropdown
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
    
    // Mostrar modal com informações do usuário
    showModal('user-info-modal');
    loadDetailedUserInfo();
}

async function loadDetailedUserInfo() {
    try {
        const response = await fetch('/api/user-info', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Atualizar informações no modal
            document.getElementById('modal-username').textContent = data.username;
            document.getElementById('modal-email').textContent = data.email;
            
            // Calcular e exibir uso de armazenamento
            const usedGB = (data.storage_used / (1024 * 1024 * 1024)).toFixed(2);
            const totalGB = (data.storage_quota / (1024 * 1024 * 1024)).toFixed(0);
            const percentage = data.storage_percent.toFixed(1);
            
            document.getElementById('storage-text').textContent = `${usedGB} GB de ${totalGB} GB usado (${percentage}%)`;
            document.getElementById('storage-bar').style.width = `${Math.min(percentage, 100)}%`;
            
            // Data de criação (simulada - seria necessário adicionar ao modelo User)
            document.getElementById('modal-member-since').textContent = 'Setembro 2025';
            
        } else {
            showNotification('Erro ao carregar informações do usuário', 'error');
        }
    } catch (error) {
        showNotification('Erro de conexão: ' + error.message, 'error');
    }
}

function copyShareLink() {
    const input = document.getElementById('share-link');
    if (!input || !input.value) {
        showNotification('Nenhum link para copiar', 'warning');
        return;
    }
    input.select();
    input.setSelectionRange(0, 99999);
    document.execCommand('copy');
    showNotification('Link copiado!', 'success');
}

// ===== SISTEMA DE PREVIEW DE ARQUIVOS =====

let currentPreviewFile = null;

async function previewFile(fileId) {
    try {
        // Buscar informações do arquivo (fallback para contexto em mobile)
        let fileCard = document.querySelector(`[data-file-id="${fileId}"]`);
        let fileData = null;
        if (fileCard && fileCard.dataset.fileData) {
            fileData = JSON.parse(fileCard.dataset.fileData);
        } else if (window.__contextItem && window.__contextItem.type === 'file' && Number(window.__contextItem.id) === Number(fileId) && window.__contextItem.data) {
            fileData = window.__contextItem.data;
        } else {
            showNotification('Arquivo não encontrado', 'error');
            return;
        }
        currentPreviewFile = fileData;
        
        // Determinar tipo de preview
        if (isImageFile(fileData.filename)) {
            await previewImage(fileData);
        } else if (isPdfFile(fileData.filename)) {
            await previewPdf(fileData);
        } else if (isVideoFile(fileData.filename)) {
            await previewVideo(fileData);
        } else if (isAudioFile(fileData.filename)) {
            await previewAudio(fileData);
        } else if (isTextFile(fileData.filename)) {
            await previewTextFile(fileData);
        } else {
            showUnsupportedPreview(fileData);
        }
        
    } catch (error) {
        showPreviewError('Erro ao carregar preview: ' + error.message);
    }
}

async function previewImage(fileData) {
    const body = document.getElementById('file-preview-body');
    const title = document.getElementById('preview-file-name');
    title.textContent = fileData.filename;
    updatePreviewInfo(fileData);

    body.innerHTML = `
        <div class="file-preview-content">
            <div class="preview-loading">
                <div class="spinner"></div>
                <span>Carregando imagem...</span>
            </div>
        </div>
    `;
    showModal('file-preview-modal');

    try {
        const url = `/api/stream/${fileData.id}?jwt=${encodeURIComponent(authToken)}`;
        // Reset zoom
        imageZoom = 1;
        body.innerHTML = `
            <div class="file-preview-content">
                <img src="${url}" class="preview-image" alt="${fileData.filename}">
                <div class="image-controls">
                    <button class="btn" onclick="zoomImage(0.8)" title="Reduzir">
                        <i class="fas fa-search-minus"></i>
                    </button>
                    <button class="btn" onclick="zoomImage(1.2)" title="Ampliar">
                        <i class="fas fa-search-plus"></i>
                    </button>
                    <button class="btn" onclick="resetImageZoom()" title="Tamanho original">
                        <i class="fas fa-expand"></i>
                    </button>
                </div>
            </div>
        `;
    } catch (e) {
        showPreviewError('Erro ao carregar imagem');
    }
}

async function previewPdf(fileData) {
    const modal = document.getElementById('file-preview-modal');
    const body = document.getElementById('file-preview-body');
    const title = document.getElementById('preview-file-name');
    
    title.textContent = fileData.filename;
    updatePreviewInfo(fileData);
    
    const url = `/api/stream/${fileData.id}?jwt=${encodeURIComponent(authToken)}`;
    body.innerHTML = `
        <div class="file-preview-content">
            <iframe src="${url}" 
                    class="preview-pdf"
                    frameborder="0">
            </iframe>
        </div>
    `;
    
    showModal('file-preview-modal');
}

async function previewVideo(fileData) {
    const modal = document.getElementById('file-preview-modal');
    const body = document.getElementById('file-preview-body');
    const title = document.getElementById('preview-file-name');
    
    title.textContent = fileData.filename;
    updatePreviewInfo(fileData);
    
    const url = `/api/stream/${fileData.id}?jwt=${encodeURIComponent(authToken)}`;
    body.innerHTML = `
        <div class="file-preview-content">
            <video controls class="preview-video">
                <source src="${url}" type="${fileData.mime_type}">
                Seu navegador não suporta o elemento de vídeo.
            </video>
        </div>
    `;
    
    showModal('file-preview-modal');
}

async function previewAudio(fileData) {
    const modal = document.getElementById('file-preview-modal');
    const body = document.getElementById('file-preview-body');
    const title = document.getElementById('preview-file-name');
    
    title.textContent = fileData.filename;
    updatePreviewInfo(fileData);
    
    const url = `/api/stream/${fileData.id}?jwt=${encodeURIComponent(authToken)}`;
    body.innerHTML = `
        <div class="file-preview-content">
            <div class="audio-preview-container">
                <div class="audio-preview-icon">
                    <i class="fas fa-music"></i>
                </div>
                <h3>${fileData.filename}</h3>
                <audio controls class="preview-audio">
                    <source src="${url}" type="${fileData.mime_type}">
                    Seu navegador não suporta o elemento de áudio.
                </audio>
            </div>
        </div>
    `;
    
    showModal('file-preview-modal');
}

async function previewTextFile(fileData) {
    const modal = document.getElementById('text-editor-modal');
    const title = document.getElementById('editor-file-name');
    const editor = document.getElementById('text-editor');
    const languageSelect = document.getElementById('editor-language');
    
    title.textContent = fileData.filename;
    
    // Mostrar loading
    editor.value = 'Carregando conteúdo...';
    editor.disabled = true;
    
    showModal('text-editor-modal');
    
    try {
        // Carregar conteúdo do arquivo
        const response = await fetch(`/api/stream/${fileData.id}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const content = await response.text();
            editor.value = content;
            editor.disabled = false;
            
            // Detectar linguagem automaticamente
            const ext = fileData.filename.split('.').pop().toLowerCase();
            const languageMap = {
                'js': 'javascript',
                'py': 'python', 
                'html': 'html',
                'css': 'css',
                'json': 'json',
                'md': 'markdown',
                'xml': 'xml',
                'sql': 'sql'
            };
            
            if (languageMap[ext]) {
                languageSelect.value = languageMap[ext];
            }
        } else {
            editor.value = 'Erro ao carregar o arquivo.';
        }
    } catch (error) {
        editor.value = 'Erro ao carregar o arquivo: ' + error.message;
    }
}

function showUnsupportedPreview(fileData) {
    const modal = document.getElementById('file-preview-modal');
    const body = document.getElementById('file-preview-body');
    const title = document.getElementById('preview-file-name');
    
    title.textContent = fileData.filename;
    updatePreviewInfo(fileData);
    
    body.innerHTML = `
        <div class="file-preview-content">
            <div class="preview-unsupported">
                <i class="fas fa-file"></i>
                <h3>Preview não suportado</h3>
                <p>Este tipo de arquivo não pode ser visualizado no navegador.</p>
                <button class="btn btn-primary" onclick="downloadFile(${fileData.id})">
                    <i class="fas fa-download"></i>
                    Fazer Download
                </button>
            </div>
        </div>
    `;
    
    showModal('file-preview-modal');
}

function showPreviewError(message) {
    const body = document.getElementById('file-preview-body');
    body.innerHTML = `
        <div class="file-preview-content">
            <div class="preview-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Erro no Preview</h3>
                <p>${message}</p>
            </div>
        </div>
    `;
}

function updatePreviewInfo(fileData) {
    const size = document.getElementById('preview-file-size');
    const type = document.getElementById('preview-file-type');
    const date = document.getElementById('preview-file-date');
    
    if (size) size.textContent = formatFileSize(fileData.size);
    if (type) type.textContent = fileData.mime_type || 'Tipo desconhecido';
    if (date) date.textContent = formatDate(fileData.upload_date);
}

// Funções de controle de imagem
let imageZoom = 1;

function zoomImage(factor) {
    const img = document.querySelector('.preview-image');
    if (img) {
        imageZoom *= factor;
        img.style.transform = `scale(${imageZoom})`;
    }
}

function resetImageZoom() {
    const img = document.querySelector('.preview-image');
    if (img) {
        imageZoom = 1;
        img.style.transform = 'scale(1)';
    }
}

// Funções do editor de texto
async function saveTextFile() {
    if (!currentPreviewFile) {
        showNotification('Nenhum arquivo carregado', 'error');
        return;
    }
    
    const content = document.getElementById('text-editor').value;
    const saveBtn = document.getElementById('save-text-btn');
    
    // Mostrar loading no botão
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    saveBtn.disabled = true;
    
    try {
        // Criar novo arquivo com o conteúdo editado
        const blob = new Blob([content], { type: 'text/plain' });
        const formData = new FormData();
        formData.append('file', blob, currentPreviewFile.filename);
        if (currentFolderId > 0) {
            formData.append('folder_id', currentFolderId);
        }
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            showNotification('Arquivo salvo com sucesso!', 'success');
            closeModal('text-editor-modal');
            loadFiles(currentFolderId); // Recarregar lista
        } else {
            const error = await response.json();
            showNotification('Erro ao salvar: ' + (error.error || 'Erro desconhecido'), 'error');
        }
    } catch (error) {
        showNotification('Erro ao salvar: ' + error.message, 'error');
    } finally {
        // Restaurar botão
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

function changeEditorLanguage() {
    // Futuramente pode implementar syntax highlighting
    const language = document.getElementById('editor-language').value;
    console.log('Linguagem alterada para:', language);
}

function formatCode() {
    const editor = document.getElementById('text-editor');
    const language = document.getElementById('editor-language').value;
    
    // Implementação básica de formatação
    if (language === 'json') {
        try {
            const parsed = JSON.parse(editor.value);
            editor.value = JSON.stringify(parsed, null, 2);
            showNotification('Código formatado!', 'success');
        } catch (e) {
            showNotification('JSON inválido', 'error');
        }
    } else {
        showNotification('Formatação não implementada para esta linguagem', 'info');
    }
}

function toggleWordWrap() {
    const editor = document.getElementById('text-editor');
    const btn = document.getElementById('wrap-btn');
    
    if (editor.style.whiteSpace === 'pre-wrap') {
        editor.style.whiteSpace = 'pre';
        btn.innerHTML = '<i class="fas fa-align-left"></i>';
        btn.title = 'Ativar quebra de linha';
    } else {
        editor.style.whiteSpace = 'pre-wrap';
        btn.innerHTML = '<i class="fas fa-align-justify"></i>';
        btn.title = 'Desativar quebra de linha';
    }
}

// Funções auxiliares para modal atual
function downloadCurrentPreviewFile() {
    if (currentPreviewFile) {
        downloadFile(currentPreviewFile.id);
    }
}

function shareCurrentPreviewFile() {
    if (currentPreviewFile) {
        showShareModal(currentPreviewFile.id, 'file');
    }
}

// Stubs/Helpers para ações invocadas pelos botões de arquivo
function showShareModal(id, type = 'file') {
    // Se houver um modal real de compartilhamento, só abrimos e armazenamos contexto
    const modal = document.getElementById('share-modal');
    if (modal) {
        // guardar seleção atual
        window.__shareContext = { id, type };
        showModal('share-modal');
        const linkContainer = document.getElementById('share-link-container');
        if (linkContainer) linkContainer.classList.add('d-none');
    } else {
        showNotification('Compartilhamento não implementado nesta tela.', 'info');
    }
}

function showFileOptions(id) {
    // Pode abrir um menu ou modal de detalhes; por enquanto só seleciona
    const card = document.querySelector(`[data-file-id="${id}"]`);
    if (card) {
        card.classList.add('selected');
        setTimeout(() => card.classList.remove('selected'), 800);
    }
}

// Context menu functions
function previewSelectedFile() {
    const ctx = window.__contextItem;
    if (!ctx) return;
    hideContextMenu();
    if (ctx.type === 'file') {
        if (ctx.data) {
            const fd = ctx.data;
            if (isImageFile(fd.filename)) return previewImage(fd);
            if (isPdfFile(fd.filename)) return previewPdf(fd);
            if (isVideoFile(fd.filename)) return previewVideo(fd);
            if (isAudioFile(fd.filename)) return previewAudio(fd);
            if (isTextFile(fd.filename)) return previewTextFile(fd);
            return showUnsupportedPreview(fd);
        }
        previewFile(ctx.id);
    } else if (ctx.type === 'folder') {
        navigateToFolder(ctx.id);
    }
}

function editSelectedFile() {
    const ctx = window.__contextItem;
    if (!ctx || ctx.type !== 'file') return;
    hideContextMenu();
    if (ctx.name && isTextFile(ctx.name)) {
        // Reaproveitar previewTextFile passando o data se existir, senão via lookup
        if (ctx.data) {
            previewTextFile(ctx.data);
        } else {
            previewFile(ctx.id);
        }
    } else {
        showNotification('Apenas arquivos de texto podem ser editados.', 'info');
    }
}

async function renameFile() {
    const ctx = window.__contextItem;
    if (!ctx) return;
    hideContextMenu();
    if (ctx.type !== 'file') {
        showNotification('Renomear pasta não implementado.', 'info');
        return;
    }
    const current = ctx.name || '';
    const suggested = prompt('Novo nome do arquivo:', current);
    if (suggested === null) return; // cancelado
    const newName = suggested.trim();
    if (!newName || newName === current) return;
    try {
        const resp = await fetch(`/api/files/${ctx.id}/rename`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ new_name: newName })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || 'Falha ao renomear');
        showNotification('Arquivo renomeado com sucesso!', 'success');
        loadFiles(currentFolderId);
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

function moveToTrash() {
    const ctx = window.__contextItem;
    if (!ctx) return;
    hideContextMenu();
    if (ctx.type === 'file') {
        deleteFile(ctx.id);
    } else {
        showNotification('Excluir pasta não implementado.', 'info');
    }
}

// Wrappers para itens do menu de contexto
function contextDownload() {
    const ctx = window.__contextItem;
    if (!ctx || ctx.type !== 'file') return;
    hideContextMenu();
    downloadFile(ctx.id);
}

function contextShare() {
    const ctx = window.__contextItem;
    if (!ctx) return;
    hideContextMenu();
    showShareModal(ctx.id, ctx.type);
}

// Inicialização completa quando a página carregar
window.addEventListener('load', function() {
    console.log('Chiapetta Cloud - Interface Moderna Carregada');
});

// ===== Configurações de Banco de Dados (MySQL) =====
async function loadDbSettings() {
    try {
        const resp = await fetch('/api/settings/db', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!resp.ok) {
            if (resp.status === 403) {
                showNotification('Somente admin pode ver/editar configurações de BD.', 'warning');
            } else {
                showNotification('Falha ao carregar config de BD', 'error');
            }
            return;
        }
        const data = await resp.json();
    // Mostrar URI em uso (espera-se MySQL; se vazio, indicar não configurado)
    const uri = data.in_use_uri || '';
    const inUseEl = document.getElementById('db-in-use');
    inUseEl.textContent = uri || 'não configurado (defina um MySQL)';
        document.getElementById('db-host').value = data.host || '';
        document.getElementById('db-port').value = data.port || '3306';
        document.getElementById('db-name').value = data.db || '';
        document.getElementById('db-user').value = data.user || '';
        const hint = document.getElementById('db-pass-hint');
        if (data.has_password) {
            hint.textContent = 'Uma senha já está configurada (deixe em branco para manter).';
        } else {
            hint.textContent = '';
        }
        // Binding do submit
        const form = document.getElementById('db-settings-form');
        if (form && !form.__bound) {
            form.addEventListener('submit', saveDbSettings);
            form.__bound = true;
        }
    } catch (e) {
        console.error(e);
        showNotification('Erro ao carregar config de BD: ' + e.message, 'error');
    }
}

async function saveDbSettings(e) {
    e.preventDefault();
    const host = document.getElementById('db-host').value.trim();
    const port = document.getElementById('db-port').value.trim() || '3306';
    const db = document.getElementById('db-name').value.trim();
    const user = document.getElementById('db-user').value.trim();
    const pass = document.getElementById('db-pass').value; // pode ser vazio para manter
    const applyNow = document.getElementById('db-apply-now').checked;

    if (!host || !db || !user) {
        showNotification('Preencha host, banco e usuário.', 'warning');
        return;
    }
    const payload = { host, port, db, user, apply_now: applyNow };
    if (pass !== '') payload.password = pass;

    try {
        const resp = await fetch('/api/settings/db', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            showNotification(data.error || 'Falha ao salvar configuração', 'error');
            return;
        }
        if (data.saved) {
            showNotification('Configuração de BD salva' + (data.applied ? ' e aplicada.' : '.'), 'success');
            // Atualizar URI em uso
            await loadDbSettings();
        } else {
            showNotification('Nada foi salvo.', 'info');
        }
    } catch (e) {
        showNotification('Erro ao salvar config de BD: ' + e.message, 'error');
    }
}

async function testDbConnection() {
    try {
        const el = document.getElementById('db-ping-status');
        if (el) el.textContent = 'Testando...';
        const resp = await fetch('/api/settings/db/ping', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await resp.json().catch(() => ({}));
        if (data.status === 'ok') {
            showNotification('Conexão OK', 'success');
            if (el) el.textContent = 'Conexão OK';
        } else if (data.status === 'no-config') {
            showNotification('Nenhuma configuração salva para testar.', 'warning');
            if (el) el.textContent = 'Nenhuma configuração salva.';
        } else {
            showNotification('Falha na conexão: ' + (data.error || 'erro desconhecido'), 'error');
            if (el) el.textContent = 'Erro: ' + (data.error || 'desconhecido');
        }
    } catch (e) {
        showNotification('Erro ao testar conexão: ' + e.message, 'error');
    }
}

// ===== Gerenciamento de Usuários (Admin) =====
async function loadUsers() {
    try {
        const resp = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!resp.ok) {
            if (resp.status === 403) {
                showNotification('Somente admin pode gerenciar usuários.', 'warning');
                return;
            }
            throw new Error('Falha ao carregar usuários');
        }
        const data = await resp.json();
        displayUsers(data.users || []);
    } catch (e) {
        showNotification('Erro ao carregar usuários: ' + e.message, 'error');
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    users.forEach(user => {
        const row = document.createElement('tr');
        const storageUsed = formatFileSize(user.storage_used);
        const storageTotal = formatFileSize(user.storage_quota);
        const storagePercent = user.storage_percent.toFixed(1);
        
        row.innerHTML = `
            <td>
                <div class="user-info">
                    <strong>${user.username}</strong>
                    ${user.is_admin ? '<span class="admin-badge">Admin</span>' : ''}
                </div>
            </td>
            <td>${user.email}</td>
            <td>
                ${user.is_admin ? 
                    '<span class="badge badge-admin">Administrador</span>' : 
                    '<span class="badge badge-user">Usuário</span>'
                }
            </td>
            <td>
                <div class="storage-info">
                    <div class="storage-bar">
                        <div class="storage-used" style="width: ${Math.min(storagePercent, 100)}%"></div>
                    </div>
                    <small>${storageUsed} / ${storageTotal} (${storagePercent}%)</small>
                </div>
            </td>
            <td>${formatDate(user.created_at)}</td>
            <td class="user-actions">
                <button class="btn btn-sm btn-secondary" onclick="editUser(${user.id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                ${user.username !== 'admin' ? 
                    `<button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id}, '${user.username}')" title="Deletar">
                        <i class="fas fa-trash"></i>
                    </button>` : 
                    ''
                }
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showCreateUserModal() {
    document.getElementById('user-modal-title').textContent = 'Criar Usuário';
    document.getElementById('user-save-text').textContent = 'Criar Usuário';
    document.getElementById('user-form').reset();
    document.getElementById('user-id').value = '';
    document.getElementById('user-password-hint').textContent = 'Mínimo 6 caracteres';
    showModal('user-modal');
}

async function editUser(userId) {
    try {
        const resp = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await resp.json();
        const user = data.users.find(u => u.id === userId);
        
        if (!user) {
            showNotification('Usuário não encontrado', 'error');
            return;
        }
        
        document.getElementById('user-modal-title').textContent = 'Editar Usuário';
        document.getElementById('user-save-text').textContent = 'Salvar Alterações';
        document.getElementById('user-id').value = user.id;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-username').disabled = true; // Não permitir alterar username
        document.getElementById('user-email').value = user.email;
        document.getElementById('user-password').value = '';
        document.getElementById('user-password-hint').textContent = 'Deixe em branco para manter a senha atual';
        document.getElementById('user-storage-quota').value = user.storage_quota;
        document.getElementById('user-is-admin').checked = user.is_admin;
        
        showModal('user-modal');
    } catch (e) {
        showNotification('Erro ao carregar dados do usuário: ' + e.message, 'error');
    }
}

async function saveUser() {
    const userId = document.getElementById('user-id').value;
    const username = document.getElementById('user-username').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const password = document.getElementById('user-password').value;
    const storageQuota = document.getElementById('user-storage-quota').value;
    const isAdmin = document.getElementById('user-is-admin').checked;
    
    if (!username || !email) {
        showNotification('Nome de usuário e email são obrigatórios', 'warning');
        return;
    }
    
    if (!userId && (!password || password.length < 6)) {
        showNotification('Senha deve ter pelo menos 6 caracteres', 'warning');
        return;
    }
    
    const payload = {
        username,
        email,
        storage_quota: parseInt(storageQuota),
        is_admin: isAdmin
    };
    
    if (password) {
        payload.password = password;
    }
    
    try {
        const method = userId ? 'PUT' : 'POST';
        const url = userId ? `/api/admin/users/${userId}` : '/api/admin/users';
        
        const resp = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || 'Falha ao salvar usuário');
        }
        
        showNotification(data.message || 'Usuário salvo com sucesso', 'success');
        closeModal('user-modal');
        loadUsers(); // Recarregar lista
    } catch (e) {
        showNotification('Erro ao salvar usuário: ' + e.message, 'error');
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Tem certeza que deseja deletar o usuário "${username}"?\n\nTodos os arquivos e dados do usuário serão perdidos permanentemente.`)) {
        return;
    }
    
    try {
        const resp = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || 'Falha ao deletar usuário');
        }
        
        showNotification(data.message || 'Usuário deletado com sucesso', 'success');
        loadUsers(); // Recarregar lista
    } catch (e) {
        showNotification('Erro ao deletar usuário: ' + e.message, 'error');
    }
}
