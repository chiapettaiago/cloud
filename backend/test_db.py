import os
import sys
sys.path.append('.')
from app import app, db, File, Folder, User

with app.app_context():
    # Verificar usuários
    users = User.query.all()
    print("=== USUÁRIOS ===")
    for user in users:
        print(f"ID: {user.id}, Username: {user.username}")
    
    # Verificar arquivos
    files = File.query.all()
    print(f"\n=== ARQUIVOS (Total: {len(files)}) ===")
    for file in files:
        print(f"ID: {file.id}, Nome: {file.original_name}, User: {file.user_id}, Folder: {file.folder_id}")
    
    # Verificar pastas
    folders = Folder.query.all()
    print(f"\n=== PASTAS (Total: {len(folders)}) ===")
    for folder in folders:
        print(f"ID: {folder.id}, Nome: {folder.name}, User: {folder.user_id}, Parent: {folder.parent_id}")
    
    # Testar query específica (pasta raiz do admin)
    admin_files = File.query.filter_by(user_id=1, folder_id=None).all()
    print(f"\n=== ARQUIVOS NA RAIZ DO ADMIN (Total: {len(admin_files)}) ===")
    for file in admin_files:
        print(f"Nome: {file.original_name}, Caminho: {file.file_path}")
