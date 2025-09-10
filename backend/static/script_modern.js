// Variáveis globais
let authToken = localStorage.getItem('authToken');
let currentFolderId = 0; // 0 = pasta raiz
let currentUser = null;
let viewMode = 'grid'; // grid ou list
let selectedItems = [];

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    if (authToken) {
        showDashboard();
    } else {
        showLogin();
    }
    
    setupEventListeners();
});

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
    
    // Context menu
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', hideContextMenu);
    
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
        'profile': 'Configurações'
    };
    
    document.getElementById('section-title').textContent = titles[sectionName] || 'Dashboard';
    
    // Carregar conteúdo específico
    switch(sectionName) {
        case 'files':
            loadFiles(currentFolderId);
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
    }
}

// Gerenciamento de arquivos e pastas
async function loadFiles(folderId = 0) {
    try {
        const response = await fetch(`/api/files?folder_id=${folderId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
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
        showNotification('Erro de conexão: ' + error.message, 'error');
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
    
    // Recarregar arquivos após upload
    setTimeout(() => {
        loadFiles(currentFolderId);
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
        const response = await fetch(`/api/download/${fileId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
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
        showNotification('Erro de conexão: ' + error.message, 'error');
    }
}

// Carregar outras seções
async function loadUserInfo() {
    try {
        const response = await fetch('/api/user-info', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            // Atualizar informações do usuário na interface
        }
    } catch (error) {
        console.error('Erro ao carregar informações do usuário:', error);
    }
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
            // Implementar exibição de informações do sistema
        }
    } catch (error) {
        console.error('Erro ao carregar informações do sistema:', error);
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
    // Implementar menu de contexto básico (opcional)
    // Por ora, deixar como no-op para não bloquear
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
        // Buscar informações do arquivo
        const fileCard = document.querySelector(`[data-file-id="${fileId}"]`);
        if (!fileCard) {
            showNotification('Arquivo não encontrado', 'error');
            return;
        }
        
        const fileData = JSON.parse(fileCard.dataset.fileData);
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
        const response = await fetch(`/api/stream/${fileData.id}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!response.ok) throw new Error('Falha ao carregar');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
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
    // Implementar quando tiver seleção múltipla
}

function editSelectedFile() {
    // Implementar quando tiver seleção múltipla
}

function renameFile() {
    showNotification('Renomear ainda não implementado.', 'info');
}

function moveToTrash() {
    showNotification('Lixeira ainda não implementada.', 'info');
}

// Inicialização completa quando a página carregar
window.addEventListener('load', function() {
    console.log('Chiapetta Cloud - Interface Moderna Carregada');
});
