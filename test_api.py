#!/usr/bin/env python3

# Teste simples da API
import requests
import json

# Teste de login
login_data = {
    'username': 'admin',
    'password': 'admin123'
}

try:
    # Fazer login
    response = requests.post('http://127.0.0.1:5000/api/login', json=login_data)
    print(f"Login Response Status: {response.status_code}")
    print(f"Login Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        token = data.get('access_token')
        print(f"Token recebido: {token[:50]}...")
        
        # Testar API com token
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        
        # Testar rota de teste
        test_response = requests.get('http://127.0.0.1:5000/api/test')
        print(f"Test API Status: {test_response.status_code}")
        print(f"Test API Response: {test_response.text}")
        
        # Testar user-info
        user_response = requests.get('http://127.0.0.1:5000/api/user-info', headers=headers)
        print(f"User Info Status: {user_response.status_code}")
        print(f"User Info Response: {user_response.text}")
        
        # Testar files
        files_response = requests.get('http://127.0.0.1:5000/api/files', headers=headers)
        print(f"Files Status: {files_response.status_code}")
        print(f"Files Response: {files_response.text}")
        
except Exception as e:
    print(f"Erro: {e}")
