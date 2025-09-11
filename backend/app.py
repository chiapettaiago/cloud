import os
import re
import hashlib
import subprocess
import mimetypes
from datetime import datetime, timedelta
from pathlib import Path
from werkzeug.utils import secure_filename
from flask import Flask, request, jsonify, send_file, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity
from flask_jwt_extended import decode_token
from flask_cors import CORS
import bcrypt
try:
    import magic
except ImportError:
    magic = None
try:
    from PIL import Image
except ImportError:
    Image = None
import psutil

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-this'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///cloud_storage.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = 'jwt-secret-change-this'
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)

# Diretório base para armazenamento de arquivos
UPLOAD_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'storage'))
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

db = SQLAlchemy(app)
jwt = JWTManager(app)
CORS(app)

# Modelos do banco de dados
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    storage_quota = db.Column(db.Integer, default=1073741824)  # 1GB em bytes
    
    def set_password(self, password):
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    def check_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

class File(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    mime_type = db.Column(db.String(100))
    file_hash = db.Column(db.String(64))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    folder_id = db.Column(db.Integer, db.ForeignKey('folder.id'), nullable=True)
    is_public = db.Column(db.Boolean, default=False)
    is_favorite = db.Column(db.Boolean, default=False)
    tags = db.Column(db.Text)  # JSON string para tags
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

class Folder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    path = db.Column(db.String(500), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('folder.id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    is_public = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relacionamentos
    parent = db.relationship('Folder', remote_side=[id], backref='children')
    files = db.relationship('File', backref='folder_ref', lazy=True)

class Share(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(64), unique=True, nullable=False)
    file_id = db.Column(db.Integer, db.ForeignKey('file.id'), nullable=True)
    folder_id = db.Column(db.Integer, db.ForeignKey('folder.id'), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    shared_with_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # Para compartilhamento com usuário específico
    is_public = db.Column(db.Boolean, default=False)
    can_edit = db.Column(db.Boolean, default=False)
    can_download = db.Column(db.Boolean, default=True)
    password = db.Column(db.String(128), nullable=True)  # Para links protegidos por senha
    expires_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relacionamentos
    file = db.relationship('File', backref='shares')
    folder = db.relationship('Folder', backref='shares')
    owner = db.relationship('User', foreign_keys=[owner_id], backref='owned_shares')
    shared_with = db.relationship('User', foreign_keys=[shared_with_id], backref='received_shares')

class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    file_id = db.Column(db.Integer, db.ForeignKey('file.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relacionamentos
    file = db.relationship('File', backref='comments')
    user = db.relationship('User', backref='comments')

class FileVersion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('file.id'), nullable=False)
    version_number = db.Column(db.Integer, nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer, nullable=False)
    file_hash = db.Column(db.String(64), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relacionamentos
    file = db.relationship('File', backref='versions')

class Activity(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    action = db.Column(db.String(100), nullable=False)  # upload, download, share, delete, etc.
    resource_type = db.Column(db.String(50), nullable=False)  # file, folder
    resource_id = db.Column(db.Integer, nullable=False)
    resource_name = db.Column(db.String(255), nullable=False)
    details = db.Column(db.Text)
    ip_address = db.Column(db.String(45))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relacionamentos
    user = db.relationship('User', backref='activities')

class ExecutionLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('file.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    command = db.Column(db.Text, nullable=False)
    output = db.Column(db.Text)
    error_output = db.Column(db.Text)
    exit_code = db.Column(db.Integer)
    executed_at = db.Column(db.DateTime, default=datetime.utcnow)

# Função auxiliar para calcular hash do arquivo
def calculate_file_hash(file_path):
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()

# Função auxiliar para obter uso de armazenamento do usuário
def get_user_storage_usage(user_id):
    files = File.query.filter_by(user_id=user_id).all()
    return sum(file.file_size for file in files)

# Função auxiliar para verificar se arquivo é executável com segurança
def is_safe_executable(file_path):
    safe_extensions = ['.py', '.sh', '.js', '.php', '.rb', '.pl', '.java']
    return any(file_path.lower().endswith(ext) for ext in safe_extensions)

# Função auxiliar para gerar token de compartilhamento
def generate_share_token():
    import secrets
    return secrets.token_urlsafe(32)

# Função auxiliar para log de atividades
def log_activity(user_id, action, resource_type, resource_id, resource_name, details=None):
    activity = Activity(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        details=details,
        ip_address=request.remote_addr
    )
    db.session.add(activity)
    db.session.commit()

# Função auxiliar para verificar tipos de arquivo streamable
def is_streamable_file(mime_type):
    if not mime_type:
        return False
    
    streamable_types = [
        'video/', 'audio/', 'image/',
        'application/pdf',
        'text/', 'application/json',
        'application/javascript',
        'application/xml'
    ]
    
    return any(mime_type.startswith(stype) for stype in streamable_types)

# Função auxiliar para criar thumbnail
def create_thumbnail(file_path, mime_type):
    if not mime_type or not mime_type.startswith('image/') or not Image:
        return None
    
    try:
        # Criar diretório de thumbnails se não existir
        thumb_dir = os.path.join(app.config['UPLOAD_FOLDER'], '.thumbnails')
        os.makedirs(thumb_dir, exist_ok=True)
        
        # Gerar nome do thumbnail
        file_hash = calculate_file_hash(file_path)
        thumb_path = os.path.join(thumb_dir, f"{file_hash}_thumb.jpg")
        
        # Criar thumbnail se não existir
        if not os.path.exists(thumb_path):
            with Image.open(file_path) as img:
                img.thumbnail((200, 200), Image.Resampling.LANCZOS)
                img.convert('RGB').save(thumb_path, 'JPEG', quality=85)
        
        return thumb_path
    except Exception as e:
        print(f"Erro ao criar thumbnail: {e}")
        return None

# Rotas da API

@app.route('/')
def index():
    return render_template('index_modern.html')

@app.route('/api/test', methods=['GET'])
def test_api():
    return jsonify({'message': 'API funcionando!', 'status': 'ok'}), 200

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not username or not email or not password:
        return jsonify({'error': 'Todos os campos são obrigatórios'}), 400
    
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Nome de usuário já existe'}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email já cadastrado'}), 400
    
    user = User(username=username, email=email)
    user.set_password(password)
    
    # Criar diretório do usuário
    user_dir = os.path.join(app.config['UPLOAD_FOLDER'], str(user.username))
    os.makedirs(user_dir, exist_ok=True)
    
    db.session.add(user)
    db.session.commit()
    
    return jsonify({'message': 'Usuário criado com sucesso'}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    
    if user and user.check_password(password):
        access_token = create_access_token(identity=str(user.id))
        return jsonify({
            'access_token': access_token,
            'user_id': user.id,
            'username': user.username
        }), 200
    
    return jsonify({'error': 'Credenciais inválidas'}), 401

@app.route('/api/upload', methods=['POST'])
@jwt_required()
def upload_file():
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'Usuário não encontrado'}), 404
        
        if 'file' not in request.files:
            return jsonify({'error': 'Nenhum arquivo enviado'}), 400
        
        file = request.files['file']
        folder_id = request.form.get('folder_id', type=int)
        
        if file.filename == '':
            return jsonify({'error': 'Nome de arquivo inválido'}), 400
        
        # Ler arquivo uma vez e armazenar em variável
        file_content = file.read()
        file_size = len(file_content)
        
        # Verificar quota de armazenamento
        current_usage = get_user_storage_usage(user_id)
        if current_usage + file_size > user.storage_quota:
            return jsonify({'error': 'Quota de armazenamento excedida'}), 413
    
        filename = secure_filename(file.filename)
        
        # Determinar diretório baseado na pasta
        if folder_id:
            folder = Folder.query.filter_by(id=folder_id, user_id=user_id).first()
            if not folder:
                return jsonify({'error': 'Pasta não encontrada'}), 404
            target_dir = os.path.join(app.config['UPLOAD_FOLDER'], folder.path)
        else:
            target_dir = os.path.join(app.config['UPLOAD_FOLDER'], user.username)
        
        os.makedirs(target_dir, exist_ok=True)
        
        # Gerar nome único se arquivo já existir
        file_path = os.path.join(target_dir, filename)
        counter = 1
        base_name, extension = os.path.splitext(filename)
        while os.path.exists(file_path):
            filename = f"{base_name}_{counter}{extension}"
            file_path = os.path.join(target_dir, filename)
            counter += 1
        
        # Salvar arquivo usando o conteúdo lido
        with open(file_path, 'wb') as f:
            f.write(file_content)
    
        # Obter informações do arquivo
        file_hash = calculate_file_hash(file_path)
        # Detectar tipo MIME
        if magic:
            try:
                mime_type = magic.from_file(file_path, mime=True)
            except:
                mime_type, _ = mimetypes.guess_type(file_path)
                if not mime_type:
                    mime_type = 'application/octet-stream'
        else:
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = 'application/octet-stream'
        
        # Salvar informações no banco de dados
        db_file = File(
            filename=filename,
            original_name=file.filename,
            file_path=file_path,
            file_size=file_size,
            mime_type=mime_type,
            file_hash=file_hash,
            user_id=user_id,
            folder_id=folder_id
        )
        
        db.session.add(db_file)
        db.session.commit()
        
        # Log da atividade
        log_activity(user_id, 'upload', 'file', db_file.id, file.filename)
        
        return jsonify({
            'message': 'Arquivo enviado com sucesso',
            'file_id': db_file.id,
            'filename': filename
        }), 201
    
    except Exception as e:
        return jsonify({'error': f'Erro no upload: {str(e)}'}), 500

@app.route('/api/files', methods=['GET'])
@jwt_required()
def list_files():
    try:
        user_id = int(get_jwt_identity())
        folder_id = request.args.get('folder_id', type=int, default=None)
        
        # Buscar pastas na pasta atual
        folders = Folder.query.filter_by(user_id=user_id, parent_id=folder_id).all()
        
        # Buscar arquivos na pasta atual
        files = File.query.filter_by(user_id=user_id, folder_id=folder_id).all()
        
        folder_list = []
        for folder in folders:
            folder_list.append({
                'id': folder.id,
                'name': folder.name,
                'created_at': folder.created_at.isoformat(),
                'updated_at': folder.updated_at.isoformat()
            })
        
        file_list = []
        for file in files:
            file_list.append({
                'id': file.id,
                'filename': file.original_name,
                'size': file.file_size,
                'upload_date': file.created_at.isoformat(),
                'mime_type': file.mime_type,
                'is_favorite': getattr(file, 'is_favorite', False),
                'is_streamable': is_streamable_file(file.mime_type)
            })
        
        # Construir o caminho (breadcrumb)
        path = []
        if folder_id:
            current_folder = Folder.query.get(folder_id)
            if current_folder and current_folder.user_id == user_id:
                # Construir caminho até a raiz
                temp_folder = current_folder
                while temp_folder:
                    path.insert(0, {
                        'id': temp_folder.id,
                        'name': temp_folder.name
                    })
                    temp_folder = Folder.query.get(temp_folder.parent_id) if temp_folder.parent_id else None
        
        return jsonify({
            'folders': folder_list,
            'files': file_list,
            'path': path,
            'current_folder_id': folder_id,
            'total_items': len(folder_list) + len(file_list)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/<int:file_id>', methods=['GET'])
@jwt_required()
def download_file(file_id):
    user_id = int(get_jwt_identity())
    file = File.query.filter_by(id=file_id, user_id=user_id).first()
    
    if not file:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    if not os.path.exists(file.file_path):
        return jsonify({'error': 'Arquivo não existe no sistema'}), 404
    
    return send_file(file.file_path, as_attachment=True, download_name=file.original_name)

@app.route('/api/delete/<int:file_id>', methods=['DELETE'])
@jwt_required()
def delete_file(file_id):
    user_id = int(get_jwt_identity())
    file = File.query.filter_by(id=file_id, user_id=user_id).first()
    
    if not file:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    # Remover arquivo do sistema
    if os.path.exists(file.file_path):
        os.remove(file.file_path)
    
    # Remover do banco de dados
    db.session.delete(file)
    db.session.commit()
    
    return jsonify({'message': 'Arquivo excluído com sucesso'}), 200

@app.route('/api/execute/<int:file_id>', methods=['POST'])
@jwt_required()
def execute_file(file_id):
    user_id = int(get_jwt_identity())
    file = File.query.filter_by(id=file_id, user_id=user_id).first()
    
    if not file:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    if not os.path.exists(file.file_path):
        return jsonify({'error': 'Arquivo não existe no sistema'}), 404
    
    if not is_safe_executable(file.file_path):
        return jsonify({'error': 'Tipo de arquivo não é executável com segurança'}), 400
    
    try:
        # Determinar comando de execução baseado na extensão
        _, ext = os.path.splitext(file.file_path.lower())
        
        if ext == '.py':
            command = ['python3', file.file_path]
        elif ext == '.sh':
            command = ['bash', file.file_path]
        elif ext == '.js':
            command = ['node', file.file_path]
        elif ext == '.php':
            command = ['php', file.file_path]
        elif ext == '.rb':
            command = ['ruby', file.file_path]
        elif ext == '.pl':
            command = ['perl', file.file_path]
        else:
            return jsonify({'error': 'Tipo de arquivo não suportado para execução'}), 400
        
        # Executar com timeout de 30 segundos
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=os.path.dirname(file.file_path)
        )
        
        # Salvar log de execução
        log = ExecutionLog(
            file_id=file_id,
            user_id=user_id,
            command=' '.join(command),
            output=result.stdout,
            error_output=result.stderr,
            exit_code=result.returncode
        )
        db.session.add(log)
        db.session.commit()
        
        return jsonify({
            'output': result.stdout,
            'error': result.stderr,
            'exit_code': result.returncode,
            'execution_id': log.id
        }), 200
    
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Execução excedeu tempo limite de 30 segundos'}), 408
    except Exception as e:
        return jsonify({'error': f'Erro durante execução: {str(e)}'}), 500

@app.route('/api/system-info', methods=['GET'])
@jwt_required()
def system_info():
    try:
        user_id = int(get_jwt_identity())  # Verificar se JWT é válido
        
        cpu_percent = psutil.cpu_percent(interval=0.1)  # Reduzir intervalo
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage(app.config['UPLOAD_FOLDER'])
        
        return jsonify({
            'cpu_usage': cpu_percent,
            'memory': {
                'total': memory.total,
                'available': memory.available,
                'percent': memory.percent
            },
            'disk': {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent
            }
        }), 200
    except Exception as e:
        return jsonify({'error': f'Erro ao obter informações do sistema: {str(e)}'}), 500

@app.route('/api/user-info', methods=['GET'])
@jwt_required()
def user_info():
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'Usuário não encontrado'}), 404
        
        usage = get_user_storage_usage(user_id)
        
        return jsonify({
            'username': user.username,
            'email': user.email,
            'storage_quota': user.storage_quota,
            'storage_used': usage,
            'storage_percent': (usage / user.storage_quota) * 100
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# === ROTAS DE COMPARTILHAMENTO ===

@app.route('/api/share', methods=['POST'])
@jwt_required()
def create_share():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    
    file_id = data.get('file_id')
    folder_id = data.get('folder_id')
    shared_with_username = data.get('shared_with')
    is_public = data.get('is_public', False)
    can_edit = data.get('can_edit', False)
    can_download = data.get('can_download', True)
    password = data.get('password')
    expires_days = data.get('expires_days')
    
    # Verificar se o arquivo/pasta pertence ao usuário
    if file_id:
        file = File.query.filter_by(id=file_id, user_id=user_id).first()
        if not file:
            return jsonify({'error': 'Arquivo não encontrado'}), 404
        resource_name = file.original_name
    elif folder_id:
        folder = Folder.query.filter_by(id=folder_id, user_id=user_id).first()
        if not folder:
            return jsonify({'error': 'Pasta não encontrada'}), 404
        resource_name = folder.name
    else:
        return jsonify({'error': 'ID do arquivo ou pasta é obrigatório'}), 400
    
    # Verificar usuário com quem compartilhar (se especificado)
    shared_with_id = None
    if shared_with_username:
        shared_user = User.query.filter_by(username=shared_with_username).first()
        if not shared_user:
            return jsonify({'error': 'Usuário não encontrado'}), 404
        shared_with_id = shared_user.id
    
    # Calcular data de expiração
    expires_at = None
    if expires_days:
        expires_at = datetime.utcnow() + timedelta(days=int(expires_days))
    
    # Criptografar senha se fornecida
    password_hash = None
    if password:
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Criar compartilhamento
    share = Share(
        token=generate_share_token(),
        file_id=file_id,
        folder_id=folder_id,
        owner_id=user_id,
        shared_with_id=shared_with_id,
        is_public=is_public,
        can_edit=can_edit,
        can_download=can_download,
        password=password_hash,
        expires_at=expires_at
    )
    
    db.session.add(share)
    db.session.commit()
    
    # Log da atividade
    resource_type = 'file' if file_id else 'folder'
    log_activity(user_id, 'share', resource_type, file_id or folder_id, resource_name)
    
    share_url = f"{request.host_url}share/{share.token}"
    
    return jsonify({
        'message': 'Compartilhamento criado com sucesso',
        'share_token': share.token,
        'share_url': share_url,
        'expires_at': share.expires_at.isoformat() if share.expires_at else None
    }), 201

@app.route('/api/shares', methods=['GET'])
@jwt_required()
def list_shares():
    try:
        user_id = int(get_jwt_identity())
        shares = Share.query.filter_by(owner_id=user_id).all()
        
        share_list = []
        for share in shares:
            try:
                resource_name = share.file.original_name if share.file else (share.folder.name if share.folder else 'Recurso não encontrado')
                resource_type = 'file' if share.file else 'folder'
                
                share_list.append({
                    'id': share.id,
                    'token': share.token,
                    'resource_name': resource_name,
                    'resource_type': resource_type,
                    'is_public': share.is_public,
                    'can_edit': share.can_edit,
                    'can_download': share.can_download,
                    'shared_with': share.shared_with.username if share.shared_with else None,
                    'has_password': bool(share.password),
                    'expires_at': share.expires_at.isoformat() if share.expires_at else None,
                    'created_at': share.created_at.isoformat(),
                    'share_url': f"{request.host_url}share/{share.token}"
                })
            except Exception as share_error:
                print(f"Erro ao processar compartilhamento {share.id}: {share_error}")
                continue
        
        return jsonify({'shares': share_list}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/share/<token>', methods=['GET'])
def view_share(token):
    share = Share.query.filter_by(token=token).first()
    
    if not share:
        return jsonify({'error': 'Link de compartilhamento não encontrado'}), 404
    
    # Verificar se expirou
    if share.expires_at and share.expires_at < datetime.utcnow():
        return jsonify({'error': 'Link de compartilhamento expirado'}), 410
    
    # Se tem senha, redirecionar para página de senha
    if share.password and not request.args.get('authenticated'):
        return render_template('share_password.html', token=token)
    
    # Obter informações do recurso
    if share.file:
        resource = {
            'type': 'file',
            'name': share.file.original_name,
            'size': share.file.file_size,
            'mime_type': share.file.mime_type,
            'created_at': share.file.created_at.isoformat(),
            'can_download': share.can_download,
            'is_streamable': is_streamable_file(share.file.mime_type)
        }
    else:
        # Para pastas, listar conteúdo
        folder_files = File.query.filter_by(folder_id=share.folder_id).all()
        files_list = []
        for file in folder_files:
            files_list.append({
                'name': file.original_name,
                'size': file.file_size,
                'mime_type': file.mime_type,
                'created_at': file.created_at.isoformat()
            })
        
        resource = {
            'type': 'folder',
            'name': share.folder.name,
            'files': files_list,
            'can_download': share.can_download
        }
    
    return render_template('share_view.html', share=resource, token=token)

@app.route('/api/share/<token>/verify-password', methods=['POST'])
def verify_share_password(token):
    share = Share.query.filter_by(token=token).first()
    
    if not share or not share.password:
        return jsonify({'error': 'Compartilhamento não encontrado'}), 404
    
    data = request.get_json()
    password = data.get('password')
    
    if not password:
        return jsonify({'error': 'Senha obrigatória'}), 400
    
    if bcrypt.checkpw(password.encode('utf-8'), share.password.encode('utf-8')):
        return jsonify({'success': True, 'redirect': f"/share/{token}?authenticated=1"}), 200
    else:
        return jsonify({'error': 'Senha incorreta'}), 401

# === ROTAS DE STREAMING ===

@app.route('/api/stream/<int:file_id>')
def stream_file(file_id):
    """Stream de arquivo com suporte a link compartilhado (token) ou JWT.
    Se query param 'token' existir, trata como token de compartilhamento.
    Caso contrário, exige Authorization: Bearer <JWT>.
    Suporta Range requests para mídia.
    """
    share_token = request.args.get('token')
    jwt_param = request.args.get('jwt')

    # Resolução de permissões
    file = None
    if share_token:
        # Acesso via compartilhamento público/privado
        share = Share.query.filter_by(token=share_token).first()
        if not share or (share.file_id != file_id):
            return jsonify({'error': 'Token inválido'}), 403
        if share.expires_at and share.expires_at < datetime.utcnow():
            return jsonify({'error': 'Link expirado'}), 410
        file = share.file
    elif jwt_param:
        # Acesso via JWT no query param (para players/iframes sem header)
        try:
            decoded = decode_token(jwt_param)
            user_id = int(decoded.get('sub'))
            file = File.query.filter_by(id=file_id, user_id=user_id).first()
        except Exception:
            return jsonify({'error': 'JWT inválido'}), 403
    else:
        # Acesso autenticado via JWT
        try:
            from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
            verify_jwt_in_request()
            user_id = int(get_jwt_identity())
            file = File.query.filter_by(id=file_id, user_id=user_id).first()
        except Exception:
            return jsonify({'error': 'Acesso negado'}), 403

    if not file:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    if not os.path.exists(file.file_path):
        return jsonify({'error': 'Arquivo não existe no sistema'}), 404

    # Log da atividade
    try:
        log_activity(file.user_id, 'stream', 'file', file.id, file.original_name)
    except Exception:
        pass

    # Suporte a Range requests
    range_header = request.headers.get('Range', None)
    if range_header:
        byte_start = 0
        byte_end = None
        match = re.search(r'bytes=(\d+)-(\d*)', range_header)
        if match:
            byte_start = int(match.group(1))
            if match.group(2):
                byte_end = int(match.group(2))
        if byte_end is None:
            byte_end = file.file_size - 1

        content_length = byte_end - byte_start + 1

        def generate_range():
            with open(file.file_path, 'rb') as f:
                f.seek(byte_start)
                remaining = content_length
                while remaining > 0:
                    chunk = f.read(min(4096, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return app.response_class(
            generate_range(),
            status=206,
            mimetype=file.mime_type or 'application/octet-stream',
            headers={
                'Content-Range': f'bytes {byte_start}-{byte_end}/{file.file_size}',
                'Accept-Ranges': 'bytes',
                'Content-Length': str(content_length),
                'Content-Disposition': f'inline; filename="{file.original_name}"'
            }
        )

    # Streaming completo (sem Range)
    def generate():
        with open(file.file_path, 'rb') as f:
            while True:
                chunk = f.read(4096)
                if not chunk:
                    break
                yield chunk

    return app.response_class(
        generate(),
        mimetype=file.mime_type or 'application/octet-stream',
        headers={
            'Content-Disposition': f'inline; filename="{file.original_name}"',
            'Accept-Ranges': 'bytes',
            'Content-Length': str(file.file_size)
        }
    )

@app.route('/api/thumbnail/<int:file_id>')
def get_thumbnail(file_id):
    file = File.query.get(file_id)
    
    if not file:
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    # Verificar permissões (similar ao stream)
    token = request.args.get('token')
    if not token:
        try:
            from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
            verify_jwt_in_request()
            user_id = int(get_jwt_identity())
            if file.user_id != user_id:
                return jsonify({'error': 'Acesso negado'}), 403
        except:
            return jsonify({'error': 'Acesso negado'}), 403
    
    # Criar/obter thumbnail
    thumb_path = create_thumbnail(file.file_path, file.mime_type)
    
    if not thumb_path or not os.path.exists(thumb_path):
        # Retornar ícone padrão
        return jsonify({'error': 'Thumbnail não disponível'}), 404
    
    return send_file(thumb_path, mimetype='image/jpeg')

# === ROTAS DE PASTAS ===

@app.route('/api/folders', methods=['GET'])
@jwt_required()
def list_folders():
    user_id = int(get_jwt_identity())
    parent_id = request.args.get('parent_id', type=int)
    
    folders = Folder.query.filter_by(user_id=user_id, parent_id=parent_id).all()
    files = File.query.filter_by(user_id=user_id, folder_id=parent_id).all()
    
    folder_list = []
    for folder in folders:
        folder_list.append({
            'id': folder.id,
            'name': folder.name,
            'type': 'folder',
            'created_at': folder.created_at.isoformat(),
            'updated_at': folder.updated_at.isoformat()
        })
    
    file_list = []
    for file in files:
        file_list.append({
            'id': file.id,
            'name': file.original_name,
            'type': 'file',
            'size': file.file_size,
            'mime_type': file.mime_type,
            'is_favorite': file.is_favorite,
            'created_at': file.created_at.isoformat(),
            'updated_at': file.updated_at.isoformat(),
            'is_streamable': is_streamable_file(file.mime_type)
        })
    
    return jsonify({
        'folders': folder_list,
        'files': file_list
    }), 200

@app.route('/api/folders', methods=['POST'])
@jwt_required()
def create_folder():
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()
        
        name = data.get('name', '').strip()
        parent_id = data.get('parent_id')
        
        if not name:
            return jsonify({'error': 'Nome da pasta é obrigatório'}), 400
        
        # Verificar se pasta pai existe e pertence ao usuário
        if parent_id:
            parent_folder = Folder.query.filter_by(id=parent_id, user_id=user_id).first()
            if not parent_folder:
                return jsonify({'error': 'Pasta pai não encontrada'}), 404
            path = os.path.join(parent_folder.path, name)
        else:
            user = User.query.get(user_id)
            path = os.path.join(user.username, name)
        
        # Verificar se pasta já existe
        existing = Folder.query.filter_by(name=name, parent_id=parent_id, user_id=user_id).first()
        if existing:
            return jsonify({'error': 'Pasta já existe'}), 409
        
        # Criar pasta no sistema de arquivos
        full_path = os.path.join(app.config['UPLOAD_FOLDER'], path)
        os.makedirs(full_path, exist_ok=True)
        
        # Criar registro no banco
        folder = Folder(
            name=name,
            path=path,
            parent_id=parent_id,
            user_id=user_id
        )
        
        db.session.add(folder)
        db.session.commit()
        
        # Log da atividade  
        log_activity(user_id, 'create', 'folder', folder.id, name)
        
        return jsonify({
            'message': 'Pasta criada com sucesso',
            'folder_id': folder.id,
            'folder': {
                'id': folder.id,
                'name': folder.name,
                'created_at': folder.created_at.isoformat()
            }
        }), 201
        
    except Exception as e:
        return jsonify({'error': f'Erro interno: {str(e)}'}), 500

# === ROTAS DE ATIVIDADES ===

@app.route('/api/activities', methods=['GET'])
@jwt_required()
def get_activities():
    try:
        user_id = int(get_jwt_identity())
        limit = request.args.get('limit', 50, type=int)
        
        activities = Activity.query.filter_by(user_id=user_id).order_by(Activity.created_at.desc()).limit(limit).all()
        
        activity_list = []
        for activity in activities:
            activity_list.append({
                'id': activity.id,
                'action': activity.action,
                'resource_type': activity.resource_type,
                'resource_name': activity.resource_name,
                'details': activity.details,
                'created_at': activity.created_at.isoformat()
            })
        
        return jsonify({'activities': activity_list}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Função para criar usuário padrão
def create_default_user():
    """Cria usuário padrão para testes se não existir"""
    if not User.query.filter_by(username='admin').first():
        admin_user = User(
            username='admin',
            email='admin@chiapettacloud.com'
        )
        admin_user.set_password('admin123')
        admin_user.storage_quota = 10737418240  # 10GB para admin
        
        db.session.add(admin_user)
        
        # Criar diretório do usuário admin
        admin_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'admin')
        os.makedirs(admin_dir, exist_ok=True)
        
        print("✅ Usuário admin criado - login: admin, senha: admin123")
    
    if not User.query.filter_by(username='teste').first():
        test_user = User(
            username='teste',
            email='teste@chiapettacloud.com'
        )
        test_user.set_password('teste123')
        
        db.session.add(test_user)
        
        # Criar diretório do usuário teste
        test_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'teste')
        os.makedirs(test_dir, exist_ok=True)
        
        print("✅ Usuário teste criado - login: teste, senha: teste123")
    
    db.session.commit()

# Inicializa o banco de dados e cria usuários padrão sempre que o módulo
# for importado. Isso garante que as rotas e recursos funcionem
# corretamente em diferentes ambientes (por exemplo, durante os testes),
# sem exigir a execução manual de scripts de inicialização.
with app.app_context():
    db.create_all()
    create_default_user()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
