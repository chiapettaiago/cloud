#!/bin/bash

# Script de instalação do Chiapetta Cloud

echo "=== Chiapetta Cloud - Instalação ==="
echo ""

# Verificar se Python está instalado
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 não encontrado. Instalando..."
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

# Verificar se Node.js está instalado (para execução de arquivos .js)
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Verificar se PHP está instalado (para execução de arquivos .php)
if ! command -v php &> /dev/null; then
    echo "📦 Instalando PHP..."
    sudo apt install -y php-cli
fi

# Verificar se Ruby está instalado (para execução de arquivos .rb)
if ! command -v ruby &> /dev/null; then
    echo "📦 Instalando Ruby..."
    sudo apt install -y ruby
fi

# Verificar se Perl está instalado (para execução de arquivos .pl)
if ! command -v perl &> /dev/null; then
    echo "📦 Instalando Perl..."
    sudo apt install -y perl
fi

# Instalar dependências do sistema
echo "📦 Instalando dependências do sistema..."
sudo apt install -y libmagic1 libmagic-dev

# Criar ambiente virtual Python
echo "🐍 Criando ambiente virtual Python..."
python3 -m venv venv
source venv/bin/activate

# Instalar dependências Python
echo "📦 Instalando dependências Python..."
pip install --upgrade pip
pip install -r requirements.txt

# Criar diretórios necessários
echo "📁 Criando diretórios..."
mkdir -p storage
mkdir -p logs

# Criar arquivo de configuração local
cat > config_local.py << EOF
# Configurações locais - NÃO COMMITAR
import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'dev-jwt-secret-change-in-production'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///cloud_storage.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = os.path.abspath('storage')
    MAX_CONTENT_LENGTH = 1024 * 1024 * 1024  # 1GB por arquivo
EOF

# Criar script de inicialização
cat > start.sh << 'EOF'
#!/bin/bash

# Ativar ambiente virtual
source venv/bin/activate

# Definir variáveis de ambiente
export FLASK_APP=backend/app.py
export FLASK_ENV=development

echo "🚀 Iniciando Chiapetta Cloud..."
echo "📍 Acesse: http://localhost:5000"
echo "⏹️  Para parar: Ctrl+C"
echo ""

# Iniciar aplicação
cd backend
python app.py
EOF

chmod +x start.sh

# Criar script de produção
cat > start_production.sh << 'EOF'
#!/bin/bash

# Ativar ambiente virtual
source venv/bin/activate

# Definir variáveis de ambiente para produção
export FLASK_ENV=production
export SECRET_KEY="$(openssl rand -base64 32)"
export JWT_SECRET_KEY="$(openssl rand -base64 32)"

echo "🚀 Iniciando Chiapetta Cloud (Produção)..."
echo "📍 Rodando em: http://0.0.0.0:5000"
echo "⏹️  Para parar: Ctrl+C"
echo ""

# Iniciar com Gunicorn
cd backend
gunicorn -w 4 -b 0.0.0.0:5000 app:app --access-logfile ../logs/access.log --error-logfile ../logs/error.log
EOF

chmod +x start_production.sh

# Criar arquivo .gitignore
cat > .gitignore << 'EOF'
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
ENV/

# Banco de dados
*.db
*.sqlite
*.sqlite3

# Logs
logs/
*.log

# Armazenamento de usuários
storage/

# Configurações locais
config_local.py

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Uploads temporários
uploads/
temp/
EOF

echo ""
echo "✅ Instalação concluída!"
echo ""
echo "📋 Para iniciar em desenvolvimento:"
echo "   ./start.sh"
echo ""
echo "🚀 Para iniciar em produção:"
echo "   ./start_production.sh"
echo ""
echo "📚 Leia o README.md para mais informações"
echo ""
echo "🔐 IMPORTANTE: Altere as chaves secretas em produção!"
echo "
