import sqlite3
import os

# Caminho para o banco de dados
db_path = 'instance/cloud_storage.db'

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Verificar se a coluna folder_id já existe
    cursor.execute("PRAGMA table_info(file)")
    columns = [row[1] for row in cursor.fetchall()]
    
    # Adicionar colunas faltantes
    missing_columns = []
    if 'folder_id' not in columns:
        missing_columns.append(('folder_id', 'INTEGER'))
    if 'is_favorite' not in columns:
        missing_columns.append(('is_favorite', 'BOOLEAN DEFAULT 0'))
    if 'tags' not in columns:
        missing_columns.append(('tags', 'TEXT'))
    if 'description' not in columns:
        missing_columns.append(('description', 'TEXT'))
    
    for column_name, column_type in missing_columns:
        print(f"Adicionando coluna {column_name} à tabela file...")
        cursor.execute(f"ALTER TABLE file ADD COLUMN {column_name} {column_type}")
        print(f"Coluna {column_name} adicionada com sucesso!")
    
    if not missing_columns:
        print("Todas as colunas necessárias já existem na tabela file.")
    
    # Criar índices
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_folder_id ON file (folder_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_user_id ON file (user_id)")
    
    # Verificar se a tabela folder existe
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='folder'")
    if not cursor.fetchone():
        print("Criando tabela folder...")
        cursor.execute('''
            CREATE TABLE folder (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(255) NOT NULL,
                path VARCHAR(500) NOT NULL,
                parent_id INTEGER,
                user_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES folder (id),
                FOREIGN KEY (user_id) REFERENCES user (id)
            )
        ''')
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_folder_user_id ON folder (user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_folder_parent_id ON folder (parent_id)")
        print("Tabela folder criada com sucesso!")
    else:
        print("Tabela folder já existe.")
    
    conn.commit()
    conn.close()
    print("Migração concluída!")
else:
    print("Banco de dados não encontrado. Será criado automaticamente na primeira execução.")
