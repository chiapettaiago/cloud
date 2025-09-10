#!/bin/bash
# Arquivo de exemplo Shell Script para teste

echo "=== Chiapetta Cloud - Teste Shell Script ==="
echo "Olá! Este é um script bash de teste."
echo ""

echo "Data/Hora: $(date)"
echo "Usuário atual: $USER"
echo "Diretório atual: $(pwd)"
echo "Sistema: $(uname -s)"
echo ""

echo "Informações do sistema:"
echo "- CPU: $(nproc) cores"
echo "- Memória: $(free -h | grep '^Mem:' | awk '{print $2}')"
echo "- Disco: $(df -h . | tail -1 | awk '{print $4}') disponível"
echo ""

echo "Listando arquivos no diretório atual:"
ls -la
echo ""

echo "Teste de loop:"
for i in {1..5}; do
    echo "  Contando: $i"
done
echo ""

echo "Script executado com sucesso! 🎉"
