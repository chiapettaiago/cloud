# Arquivo de exemplo Python para teste
print("=== Chiapetta Cloud - Teste Python ===")
print("Olá! Este é um script Python de teste.")

import os
import sys
from datetime import datetime

print(f"Data/Hora: {datetime.now()}")
print(f"Versão Python: {sys.version}")
print(f"Diretório atual: {os.getcwd()}")
print(f"Sistema operacional: {os.name}")

# Teste de operações matemáticas
numeros = [1, 2, 3, 4, 5]
soma = sum(numeros)
print(f"Soma de {numeros}: {soma}")

# Teste de loop
print("Contando de 1 a 5:")
for i in range(1, 6):
    print(f"  {i}")

print("Script executado com sucesso! 🎉")
