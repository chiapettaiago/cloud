#!/usr/bin/env python3
import requests
import json

# URL base da API
BASE_URL = 'http://127.0.0.1:5000'

def test_login():
    """Testa o login e retorna o token"""
    print("=== Testando Login ===")
    
    # Dados de login
    login_data = {
        'username': 'admin',
        'password': 'admin123'
    }
    
    response = requests.post(f'{BASE_URL}/api/login', json=login_data)
    
    print(f"Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        return data.get('access_token')
    else:
        print(f"Erro no login: {response.text}")
        return None

def test_protected_endpoint(token, endpoint):
    """Testa um endpoint protegido"""
    print(f"\n=== Testando {endpoint} ===")
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    response = requests.get(f'{BASE_URL}/api/{endpoint}', headers=headers)
    
    print(f"Status: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
    else:
        print(f"Erro: {response.text}")
        # Verificar se há detalhes do erro
        try:
            error_data = response.json()
            print(f"Detalhes do erro: {json.dumps(error_data, indent=2)}")
        except:
            pass

def main():
    try:
        # Fazer login
        token = test_login()
        
        if not token:
            print("Não foi possível obter o token. Abortando testes.")
            return
        
        print(f"\nToken obtido: {token[:50]}...")
        
        # Testar endpoints protegidos
        endpoints = ['user-info', 'files', 'system-info', 'shares', 'activities']
        
        for endpoint in endpoints:
            test_protected_endpoint(token, endpoint)
    
    except requests.exceptions.ConnectionError:
        print("Erro: Não foi possível conectar ao servidor. Verifique se está rodando.")
    except Exception as e:
        print(f"Erro inesperado: {e}")

if __name__ == '__main__':
    main()
