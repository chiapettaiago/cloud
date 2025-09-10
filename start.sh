#!/bin/bash

# Script de início rápido do Chiapetta Cloud
echo "🚀 Iniciando Chiapetta Cloud..."

# Verificar se o ambiente virtual existe
if [ ! -d "/home/iago/chiapetta-cloud/.venv" ]; then
    echo "❌ Ambiente virtual não encontrado. Execute ./install.sh primeiro."
    exit 1
fi

# Navegar para o diretório correto
cd /home/iago/chiapetta-cloud/cloud-storage/backend

# Ativar ambiente virtual e iniciar aplicação
echo "🐍 Ativando ambiente Python..."
source /home/iago/chiapetta-cloud/.venv/bin/activate

echo "🌐 Iniciando servidor Flask..."
echo "📍 Aplicação disponível em: http://127.0.0.1:5000"
echo "⏹️  Para parar: Ctrl+C"
echo ""

# Iniciar aplicação
python app.py
