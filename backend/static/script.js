// Configuração da API
const API_BASE_URL = '/api';
let authToken = localStorage.getItem('auth_token');
let currentUser = null;

// Elementos DOM
const screens = {
    login: document.getElementById('login-screen'),
    register: document.getElementById('register-screen'),
    dashboard: document.getElementById('dashboard-screen')
};

const forms = {
    login: document.getElementById('login-form'),
    register: document.getElementById('register-form')
};

// Navegação entre telas
document.getElementById('show-register').addEventListener('click', (e) => {
    e.preventDefault();
    showScreen('register');
});

document.getElementById('show-login').addEventListener('click', (e) => {
    e.preventDefault();
    showScreen('login');
});

function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Autenticação
forms.login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            authToken = data.access_token;
            localStorage.setItem('auth_token', authToken);
            currentUser = { id: data.user_id, username: data.username };
            showDashboard();
            showToast('Login realizado com sucesso!', 'success');
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
});

forms.register.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Conta criada com sucesso! Faça login.', 'success');
            showScreen('login');
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('auth_token');
    authToken = null;
    currentUser = null;
    showScreen('login');
    showToast('Logout realizado com sucesso!', 'info');
});

// Dashboard
function showDashboard() {
    showScreen('dashboard');
    document.getElementById('username-display').textContent = currentUser.username;
    loadUserInfo();
    loadFiles();
    loadSystemInfo();
}

// Navegação do dashboard
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        showSection(section);
        
        // Atualizar navegação ativa
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
    });
});

function showSection(sectionName) {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionName}-section`).classList.add('active');
}

// Upload de arquivos
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const uploadProgressContainer = document.getElementById('upload-progress-container');

uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFiles);

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    uploadFiles(files);
});

function handleFiles(e) {
    const files = Array.from(e.target.files);
    uploadFiles(files);
}

async function uploadFiles(files) {
    uploadProgressContainer.innerHTML = '';
    
    for (const file of files) {
        const progressDiv = document.createElement('div');
        progressDiv.className = 'upload-progress';
        progressDiv.innerHTML = `
            <div class="progress-item">
                <div>${file.name} (${formatFileSize(file.size)})</div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: 0%"></div>
                </div>
                <div class="progress-status">Iniciando...</div>
            </div>
        `;
        uploadProgressContainer.appendChild(progressDiv);
        
        const progressBar = progressDiv.querySelector('.progress-bar');
        const progressStatus = progressDiv.querySelector('.progress-status');
        
        try {
            await uploadFile(file, progressBar, progressStatus);
            progressStatus.textContent = 'Concluído';
            progressBar.style.width = '100%';
        } catch (error) {
            progressStatus.textContent = 'Erro: ' + error.message;
            progressBar.style.backgroundColor = '#dc3545';
        }
    }
    
    loadFiles(); // Recarregar lista de arquivos
    loadUserInfo(); // Atualizar informações de armazenamento
}

async function uploadFile(file, progressBar, progressStatus) {
    const formData = new FormData();
    formData.append('file', file);
    
    const xhr = new XMLHttpRequest();
    
    return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressBar.style.width = percentComplete + '%';
                progressStatus.textContent = `${Math.round(percentComplete)}%`;
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 201) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                reject(new Error(JSON.parse(xhr.responseText).error));
            }
        });
        
        xhr.addEventListener('error', () => {
            reject(new Error('Erro de rede'));
        });
        
        xhr.open('POST', `${API_BASE_URL}/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        xhr.send(formData);
    });
}

// Listar arquivos
async function loadFiles() {
    try {
        const response = await fetch(`${API_BASE_URL}/files`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayFiles(data.files);
        } else {
            showToast('Erro ao carregar arquivos', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
}

function displayFiles(files) {
    const container = document.getElementById('files-container');
    container.innerHTML = '';
    
    if (files.length === 0) {
        container.innerHTML = '<p style="color: white; text-align: center;">Nenhum arquivo encontrado</p>';
        return;
    }
    
    files.forEach(file => {
        const fileDiv = document.createElement('div');
        fileDiv.className = `file-item ${file.is_favorite ? 'favorite' : ''}`;
        
        const icon = getFileIcon(file.mime_type);
        const isExecutable = isExecutableFile(file.filename);
        const isStreamable = file.is_streamable;
        
        fileDiv.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-name">${file.original_name}</div>
            <div class="file-info">
                ${formatFileSize(file.file_size)}<br>
                ${new Date(file.created_at).toLocaleDateString('pt-BR')}
            </div>
            <div class="file-actions">
                ${isStreamable ? `
                    <button class="btn-preview" onclick="previewFile(${file.id}, '${file.original_name}', '${file.mime_type}')">
                        <i class="fas fa-eye"></i> Visualizar
                    </button>
                ` : ''}
                <button class="btn-download" onclick="downloadFile(${file.id})">
                    <i class="fas fa-download"></i> Baixar
                </button>
                <button class="btn-share" onclick="shareFile(${file.id}, '${file.original_name}')">
                    <i class="fas fa-share-alt"></i> Compartilhar
                </button>
                <button class="btn-favorite" onclick="toggleFavorite(${file.id})">
                    <i class="fas fa-${file.is_favorite ? 'heart' : 'heart'}"></i>
                </button>
                ${isExecutable ? `
                    <button class="btn-execute" onclick="executeFile(${file.id}, '${file.original_name}')">
                        <i class="fas fa-play"></i> Executar
                    </button>
                ` : ''}
                <button class="btn-delete" onclick="deleteFile(${file.id})">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </div>
        `;
        
        container.appendChild(fileDiv);
    });
}

function getFileIcon(mimeType) {
    if (!mimeType) return '<i class="fas fa-file"></i>';
    
    if (mimeType.startsWith('image/')) return '<i class="fas fa-file-image"></i>';
    if (mimeType.startsWith('video/')) return '<i class="fas fa-file-video"></i>';
    if (mimeType.startsWith('audio/')) return '<i class="fas fa-file-audio"></i>';
    if (mimeType.includes('pdf')) return '<i class="fas fa-file-pdf"></i>';
    if (mimeType.includes('word')) return '<i class="fas fa-file-word"></i>';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '<i class="fas fa-file-excel"></i>';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '<i class="fas fa-file-powerpoint"></i>';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return '<i class="fas fa-file-archive"></i>';
    if (mimeType.includes('text/') || mimeType.includes('json') || mimeType.includes('xml')) return '<i class="fas fa-file-alt"></i>';
    
    return '<i class="fas fa-file"></i>';
}

function isExecutableFile(filename) {
    const executableExtensions = ['.py', '.sh', '.js', '.php', '.rb', '.pl', '.java'];
    return executableExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

// Ações dos arquivos
async function downloadFile(fileId) {
    try {
        const response = await fetch(`${API_BASE_URL}/download/${fileId}`, {
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
            showToast('Download iniciado', 'success');
        } else {
            showToast('Erro ao baixar arquivo', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
}

async function executeFile(fileId, filename) {
    document.getElementById('executing-file').textContent = filename;
    document.getElementById('execution-modal').style.display = 'block';
    document.getElementById('execution-stdout').textContent = 'Executando...';
    document.getElementById('execution-stderr').textContent = '';
    document.getElementById('execution-exitcode').textContent = '';
    
    try {
        const response = await fetch(`${API_BASE_URL}/execute/${fileId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('execution-stdout').textContent = data.output || 'Nenhuma saída';
            document.getElementById('execution-stderr').textContent = data.error || 'Nenhum erro';
            document.getElementById('execution-exitcode').textContent = data.exit_code;
            showToast('Arquivo executado com sucesso', 'success');
        } else {
            document.getElementById('execution-stdout').textContent = '';
            document.getElementById('execution-stderr').textContent = data.error;
            document.getElementById('execution-exitcode').textContent = 'Erro';
            showToast('Erro na execução: ' + data.error, 'error');
        }
    } catch (error) {
        document.getElementById('execution-stdout').textContent = '';
        document.getElementById('execution-stderr').textContent = 'Erro de conexão';
        document.getElementById('execution-exitcode').textContent = 'Erro';
        showToast('Erro de conexão', 'error');
    }
}

async function deleteFile(fileId) {
    if (!confirm('Tem certeza que deseja excluir este arquivo?')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/delete/${fileId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Arquivo excluído com sucesso', 'success');
            loadFiles();
            loadUserInfo();
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
}

// Informações do usuário
async function loadUserInfo() {
    try {
        const response = await fetch(`${API_BASE_URL}/user-info`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Atualizar barra de armazenamento
            const storagePercent = data.storage_percent;
            document.getElementById('storage-progress').style.width = `${storagePercent}%`;
            document.getElementById('storage-text').textContent = 
                `${formatFileSize(data.storage_used)} / ${formatFileSize(data.storage_quota)}`;
            
            // Atualizar perfil
            document.getElementById('profile-username').textContent = data.username;
            document.getElementById('profile-email').textContent = data.email;
            document.getElementById('profile-quota').textContent = formatFileSize(data.storage_quota);
            document.getElementById('profile-used').textContent = formatFileSize(data.storage_used);
        }
    } catch (error) {
        console.error('Erro ao carregar informações do usuário:', error);
    }
}

// Informações do sistema
async function loadSystemInfo() {
    try {
        const response = await fetch(`${API_BASE_URL}/system-info`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('cpu-progress').style.width = `${data.cpu_usage}%`;
            document.getElementById('cpu-text').textContent = `${data.cpu_usage.toFixed(1)}%`;
            
            document.getElementById('memory-progress').style.width = `${data.memory.percent}%`;
            document.getElementById('memory-text').textContent = `${data.memory.percent.toFixed(1)}%`;

            document.getElementById('disk-progress').style.width = `${data.disk.percent}%`;
            document.getElementById('disk-text').textContent = `${data.disk.percent.toFixed(1)}%`;
            document.getElementById('disk-free').textContent = `Livre: ${formatFileSize(data.disk.free)}`;
        }
    } catch (error) {
        console.error('Erro ao carregar informações do sistema:', error);
    }
}

// Eventos de refresh
document.getElementById('refresh-files').addEventListener('click', loadFiles);
document.getElementById('refresh-system').addEventListener('click', loadSystemInfo);
document.getElementById('refresh-shares').addEventListener('click', loadShares);
document.getElementById('refresh-activities').addEventListener('click', loadActivities);

// Filtros de arquivo
document.getElementById('file-search').addEventListener('input', filterFiles);
document.getElementById('file-filter').addEventListener('change', filterFiles);

function filterFiles() {
    const searchTerm = document.getElementById('file-search').value.toLowerCase();
    const filterType = document.getElementById('file-filter').value;
    
    const fileItems = document.querySelectorAll('.file-item');
    
    fileItems.forEach(item => {
        const fileName = item.querySelector('.file-name').textContent.toLowerCase();
        const fileIcon = item.querySelector('.file-icon i').className;
        
        let matchesSearch = fileName.includes(searchTerm);
        let matchesFilter = true;
        
        if (filterType) {
            matchesFilter = fileIcon.includes(filterType);
        }
        
        if (matchesSearch && matchesFilter) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Modal
document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('execution-modal').style.display = 'none';
});

window.addEventListener('click', (e) => {
    const modal = document.getElementById('execution-modal');
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Utilitários
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.getElementById('toast-container').appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        // Verificar se o token ainda é válido
        fetch(`${API_BASE_URL}/user-info`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        }).then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Token inválido');
            }
        }).then(data => {
            currentUser = { username: data.username };
            showDashboard();
        }).catch(() => {
            localStorage.removeItem('auth_token');
            authToken = null;
            showScreen('login');
        });
    } else {
        showScreen('login');
    }
});

// === NOVAS FUNCIONALIDADES ===

// Visualizar arquivo
async function previewFile(fileId, fileName, mimeType) {
    document.getElementById('preview-title').textContent = fileName;
    const previewContent = document.getElementById('preview-content');
    previewContent.innerHTML = '<div>Carregando...</div>';
    
    document.getElementById('preview-modal').style.display = 'block';
    
    try {
        const streamUrl = `/api/stream/${fileId}`;
        
        if (mimeType.startsWith('image/')) {
            previewContent.innerHTML = `<img src="${streamUrl}" alt="${fileName}">`;
        } else if (mimeType.startsWith('video/')) {
            previewContent.innerHTML = `
                <video controls style="max-width: 100%;">
                    <source src="${streamUrl}" type="${mimeType}">
                    Seu navegador não suporta o elemento de vídeo.
                </video>
            `;
        } else if (mimeType.startsWith('audio/')) {
            previewContent.innerHTML = `
                <audio controls style="width: 100%;">
                    <source src="${streamUrl}" type="${mimeType}">
                    Seu navegador não suporta o elemento de áudio.
                </audio>
            `;
        } else if (mimeType === 'application/pdf') {
            previewContent.innerHTML = `<iframe src="${streamUrl}" style="width: 100%; height: 500px;"></iframe>`;
        } else {
            previewContent.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <i class="fas fa-file" style="font-size: 4rem; color: #666; margin-bottom: 1rem;"></i>
                    <p>Visualização não disponível para este tipo de arquivo.</p>
                    <button onclick="window.open('${streamUrl}')" class="btn-primary">Abrir em nova aba</button>
                </div>
            `;
        }
    } catch (error) {
        previewContent.innerHTML = '<div style="color: red;">Erro ao carregar arquivo</div>';
    }
}

// Compartilhar arquivo
function shareFile(fileId, fileName) {
    document.getElementById('share-resource-name').textContent = fileName;
    document.getElementById('share-modal').style.display = 'block';
    
    // Armazenar dados do arquivo para o formulário
    window.currentShareData = { file_id: fileId, name: fileName };
}

// Alternar favorito
async function toggleFavorite(fileId) {
    try {
        const response = await fetch(`${API_BASE_URL}/favorite/${fileId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            loadFiles(); // Recarregar lista
            showToast('Favorito atualizado', 'success');
        } else {
            showToast('Erro ao atualizar favorito', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
}

// Carregar compartilhamentos
async function loadShares() {
    try {
        const response = await fetch(`${API_BASE_URL}/shares`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayShares(data.shares);
        } else {
            showToast('Erro ao carregar compartilhamentos', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
}

function displayShares(shares) {
    const container = document.getElementById('shares-container');
    container.innerHTML = '';
    
    if (shares.length === 0) {
        container.innerHTML = '<p style="color: white; text-align: center;">Nenhum compartilhamento encontrado</p>';
        return;
    }
    
    shares.forEach(share => {
        const shareDiv = document.createElement('div');
        shareDiv.className = 'share-item';
        
        const icon = share.resource_type === 'file' ? 'fa-file' : 'fa-folder';
        const statusIcon = share.is_public ? 'fa-globe' : 'fa-user';
        
        shareDiv.innerHTML = `
            <div class="share-header">
                <div class="share-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="share-info">
                    <h4>${share.resource_name}</h4>
                    <p><i class="fas ${statusIcon}"></i> ${share.is_public ? 'Público' : 'Privado'}</p>
                </div>
            </div>
            
            <div class="share-details">
                <div class="detail-item">
                    <span>Criado:</span>
                    <span>${new Date(share.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                ${share.shared_with ? `
                    <div class="detail-item">
                        <span>Compartilhado com:</span>
                        <span>${share.shared_with}</span>
                    </div>
                ` : ''}
                ${share.expires_at ? `
                    <div class="detail-item">
                        <span>Expira:</span>
                        <span>${new Date(share.expires_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="share-url">${share.share_url}</div>
            
            <div class="share-actions">
                <button class="btn-copy" onclick="copyToClipboard('${share.share_url}')">
                    <i class="fas fa-copy"></i> Copiar
                </button>
                <button class="btn-open" onclick="window.open('${share.share_url}')">
                    <i class="fas fa-external-link-alt"></i> Abrir
                </button>
                <button class="btn-delete-share" onclick="deleteShare(${share.id})">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </div>
        `;
        
        container.appendChild(shareDiv);
    });
}

// Copiar para clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Link copiado para área de transferência', 'success');
    }).catch(() => {
        showToast('Erro ao copiar link', 'error');
    });
}

// Excluir compartilhamento
async function deleteShare(shareId) {
    if (!confirm('Tem certeza que deseja excluir este compartilhamento?')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/share/${shareId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            loadShares();
            showToast('Compartilhamento excluído', 'success');
        } else {
            showToast('Erro ao excluir compartilhamento', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
}

// Carregar atividades
async function loadActivities() {
    try {
        const response = await fetch(`${API_BASE_URL}/activities`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayActivities(data.activities);
        } else {
            showToast('Erro ao carregar atividades', 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
}

function displayActivities(activities) {
    const container = document.getElementById('activities-container');
    container.innerHTML = '';
    
    if (activities.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 2rem;">Nenhuma atividade registrada</p>';
        return;
    }
    
    activities.forEach(activity => {
        const activityDiv = document.createElement('div');
        activityDiv.className = 'activity-item';
        
        const actionText = {
            'upload': 'fez upload de',
            'download': 'baixou',
            'share': 'compartilhou',
            'delete': 'excluiu',
            'execute': 'executou',
            'stream': 'visualizou'
        };
        
        activityDiv.innerHTML = `
            <div class="activity-icon ${activity.action}">
                <i class="fas fa-${getActivityIcon(activity.action)}"></i>
            </div>
            <div class="activity-info">
                <h4>${actionText[activity.action] || activity.action} ${activity.resource_name}</h4>
                <p>Tipo: ${activity.resource_type === 'file' ? 'Arquivo' : 'Pasta'}</p>
            </div>
            <div class="activity-time">
                ${formatDateTime(activity.created_at)}
            </div>
        `;
        
        container.appendChild(activityDiv);
    });
}

function getActivityIcon(action) {
    const icons = {
        'upload': 'upload',
        'download': 'download',
        'share': 'share-alt',
        'delete': 'trash',
        'execute': 'play',
        'stream': 'eye'
    };
    return icons[action] || 'circle';
}

// Formulário de compartilhamento
document.getElementById('share-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const shareData = {
        ...window.currentShareData,
        is_public: document.getElementById('share-type').value === 'public',
        shared_with: document.getElementById('share-username').value,
        can_edit: document.getElementById('share-can-edit').checked,
        can_download: document.getElementById('share-can-download').checked
    };
    
    if (document.getElementById('share-password-enabled').checked) {
        shareData.password = document.getElementById('share-password').value;
    }
    
    if (document.getElementById('share-expires-enabled').checked) {
        shareData.expires_days = document.getElementById('share-expires-days').value;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(shareData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('share-modal').style.display = 'none';
            loadShares();
            showToast('Compartilhamento criado com sucesso!', 'success');
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        showToast('Erro de conexão', 'error');
    }
});

// Controles do formulário de compartilhamento
document.getElementById('share-type').addEventListener('change', (e) => {
    const userGroup = document.getElementById('share-user-group');
    if (e.target.value === 'user') {
        userGroup.style.display = 'block';
    } else {
        userGroup.style.display = 'none';
    }
});

document.getElementById('share-password-enabled').addEventListener('change', (e) => {
    const passwordGroup = document.getElementById('share-password-group');
    passwordGroup.style.display = e.target.checked ? 'block' : 'none';
});

document.getElementById('share-expires-enabled').addEventListener('change', (e) => {
    const expiresGroup = document.getElementById('share-expires-group');
    expiresGroup.style.display = e.target.checked ? 'block' : 'none';
});

// Melhorar controle de modais
document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', (e) => {
        const modalId = e.target.dataset.modal;
        if (modalId) {
            document.getElementById(modalId).style.display = 'none';
        }
    });
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// Função para formatar data/hora
function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('pt-BR');
}

// Atualizar dashboard com novas funcionalidades
function showDashboard() {
    showScreen('dashboard');
    document.getElementById('username-display').textContent = currentUser.username;
    loadUserInfo();
    loadFiles();
    loadSystemInfo();
    loadShares();
    loadActivities();
}

// Atualizar informações do sistema periodicamente
setInterval(() => {
    if (currentUser && document.getElementById('system-section').classList.contains('active')) {
        loadSystemInfo();
    }
}, 5000);
