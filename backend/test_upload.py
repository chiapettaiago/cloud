#!/usr/bin/env python3
import requests
import json
import io

BASE_URL = 'http://127.0.0.1:5000'

def test_upload_and_list():
    print("=== TESTE DE UPLOAD E LISTAGEM ===")
    
    # 1. Fazer login
    print("1. Fazendo login...")
    login_response = requests.post(f'{BASE_URL}/api/login', json={
        'username': 'admin',
        'password': 'admin123'
    })
    
    if login_response.status_code != 200:
        print(f"❌ Erro no login: {login_response.status_code} - {login_response.text}")
        return
    
    token = login_response.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}
    print(f"✅ Login realizado com sucesso")
    
    # 2. Listar arquivos antes do upload
    print("\n2. Listando arquivos antes do upload...")
    files_before = requests.get(f'{BASE_URL}/api/files?folder_id=0', headers=headers)
    if files_before.status_code == 200:
        data_before = files_before.json()
        print(f"   Arquivos encontrados: {len(data_before.get('files', []))}")
        print(f"   Pastas encontradas: {len(data_before.get('folders', []))}")
        for file in data_before.get('files', []):
            print(f"   - {file.get('filename')} ({file.get('size')} bytes)")
    else:
        print(f"❌ Erro ao listar arquivos: {files_before.status_code} - {files_before.text}")
        return
    
    # 3. Criar um arquivo de teste
    print("\n3. Fazendo upload de arquivo de teste...")
    test_content = "Este é um arquivo de teste criado em " + str(requests.get('http://worldtimeapi.org/api/timezone/America/Sao_Paulo').json().get('datetime', 'data desconhecida'))
    test_file = io.BytesIO(test_content.encode('utf-8'))
    
    upload_response = requests.post(
        f'{BASE_URL}/api/upload',
        headers=headers,
        files={'file': ('teste_upload.txt', test_file, 'text/plain')},
        data={'folder_id': '0'}  # Pasta raiz
    )
    
    print(f"   Status do upload: {upload_response.status_code}")
    if upload_response.status_code == 201:
        upload_data = upload_response.json()
        print(f"✅ Upload realizado com sucesso!")
        print(f"   File ID: {upload_data.get('file_id')}")
        print(f"   Filename: {upload_data.get('filename')}")
    else:
        print(f"❌ Erro no upload: {upload_response.text}")
        return
    
    # 4. Listar arquivos após o upload
    print("\n4. Listando arquivos após o upload...")
    files_after = requests.get(f'{BASE_URL}/api/files?folder_id=0', headers=headers)
    if files_after.status_code == 200:
        data_after = files_after.json()
        print(f"   Arquivos encontrados: {len(data_after.get('files', []))}")
        print(f"   Pastas encontradas: {len(data_after.get('folders', []))}")
        for file in data_after.get('files', []):
            print(f"   - {file.get('filename')} ({file.get('size')} bytes)")
            
        # Verificar se o arquivo apareceu
        new_files = [f for f in data_after.get('files', []) if f.get('filename') == 'teste_upload.txt']
        if new_files:
            print("✅ Arquivo apareceu na listagem!")
        else:
            print("❌ Arquivo NÃO apareceu na listagem!")
            print("   Conteúdo completo da resposta:")
            print(json.dumps(data_after, indent=2))
    else:
        print(f"❌ Erro ao listar arquivos após upload: {files_after.status_code} - {files_after.text}")
    
    # 5. Verificar informações do usuário
    print("\n5. Verificando informações do usuário...")
    user_info = requests.get(f'{BASE_URL}/api/user-info', headers=headers)
    if user_info.status_code == 200:
        user_data = user_info.json()
        print(f"   Usuário: {user_data.get('username')}")
        print(f"   Armazenamento usado: {user_data.get('storage_used')} bytes")
        print(f"   Percentual usado: {user_data.get('storage_percent'):.2f}%")
    else:
        print(f"❌ Erro nas informações do usuário: {user_info.status_code} - {user_info.text}")

if __name__ == '__main__':
    try:
        test_upload_and_list()
    except Exception as e:
        print(f"❌ Erro inesperado: {e}")
