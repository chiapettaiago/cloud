# Chiapetta Cloud - Armazenamento em Nuvem

Um sistema de armazenamento em nuvem completo semelhante ao Nextcloud, desenvolvido em Python com Flask.

## Características

- **Upload e Download de Arquivos**: Interface web intuitiva com drag-and-drop
- **Execução Segura de Scripts**: Suporte para Python, Shell, JavaScript, PHP, Ruby, Perl e Java
- **Autenticação JWT**: Sistema seguro de login e registro
- **Quotas de Armazenamento**: Controle de espaço por usuário
- **Monitoramento do Sistema**: CPU, memória e uso de disco em tempo real
- **Interface Responsiva**: Funciona em desktop e mobile
- **Logs de Execução**: Histórico completo de execuções de arquivos

## Tecnologias Utilizadas

### Backend
- **Flask**: Framework web Python
- **SQLAlchemy**: ORM para banco de dados
- **JWT**: Autenticação baseada em tokens
- **bcrypt**: Criptografia de senhas
- **python-magic**: Detecção de tipos de arquivo
- **psutil**: Monitoramento do sistema

### Frontend
- **HTML5/CSS3**: Interface moderna e responsiva
- **JavaScript Vanilla**: Sem dependências externas
- **Font Awesome**: Ícones
- **Fetch API**: Comunicação com backend

### Banco de Dados
- **SQLite**: Banco de dados leve e eficiente (desenvolvimento)
- **MySQL (remoto)**: Suportado via SQLAlchemy + PyMySQL

## Estrutura do Projeto

```
cloud-storage/
├── backend/
│   ├── app.py              # Aplicação Flask principal
│   ├── static/             # Arquivos estáticos (CSS, JS)
│   │   ├── style.css       # Estilos
│   │   └── script.js       # Lógica frontend
│   └── templates/          # Templates HTML
│       └── index.html      # Interface web
├── storage/                # Diretório de armazenamento
├── requirements.txt        # Dependências Python
└── README.md              # Este arquivo
```

## Instalação e Configuração

### 1. Instalar Dependências Python

```bash
cd cloud-storage
pip install -r requirements.txt
```

### 2. Configurar Ambiente

As seguintes configurações podem ser alteradas no arquivo `backend/app.py`:

- `SECRET_KEY`: Chave secreta da aplicação (ALTERE PARA PRODUÇÃO)
- `JWT_SECRET_KEY`: Chave secreta JWT (ALTERE PARA PRODUÇÃO)
- `SQLALCHEMY_DATABASE_URI`: URL do banco de dados
- `UPLOAD_FOLDER`: Diretório de armazenamento

### 3. Executar a Aplicação

```bash
cd backend
python app.py
```

A aplicação estará disponível em: http://localhost:5000

## Funcionalidades

### Autenticação
- Registro de novos usuários
- Login com username/senha
- Tokens JWT com expiração de 24 horas
- Logout seguro

### Gerenciamento de Arquivos
- Upload via interface web ou drag-and-drop
- Download de arquivos
- Exclusão de arquivos
- Visualização de informações (tamanho, data, tipo)
- Busca e filtros por tipo de arquivo

### Execução de Scripts
Suporte para execução segura de:
- **Python** (.py)
- **Shell Script** (.sh)
- **JavaScript** (.js) - Node.js
- **PHP** (.php)
- **Ruby** (.rb)
- **Perl** (.pl)
- **Java** (.java)

### Monitoramento
- Uso de CPU em tempo real
- Consumo de memória
- Espaço em disco
- Quota de armazenamento por usuário

### Segurança
- Senhas criptografadas com bcrypt
- Autenticação JWT
- Validação de tipos de arquivo
- Timeout de execução (30 segundos)
- Isolamento de diretórios por usuário

## API Endpoints

### Autenticação
- `POST /api/register` - Registrar novo usuário
- `POST /api/login` - Fazer login

### Arquivos
- `GET /api/files` - Listar arquivos do usuário
- `POST /api/upload` - Fazer upload de arquivo
- `GET /api/download/<id>` - Baixar arquivo
- `DELETE /api/delete/<id>` - Excluir arquivo
- `POST /api/execute/<id>` - Executar arquivo

### Informações
- `GET /api/user-info` - Informações do usuário
- `GET /api/system-info` - Informações do sistema

## Configuração para Produção

### 1. Alterar Chaves Secretas
```python
app.config['SECRET_KEY'] = 'sua-chave-secreta-super-segura'
app.config['JWT_SECRET_KEY'] = 'sua-chave-jwt-super-segura'
```

### 2. Usar Banco de Dados Robusto
```python
# PostgreSQL
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://user:pass@localhost/clouddb'

# MySQL
app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql://user:pass@localhost/clouddb'
```

Ou defina variáveis de ambiente para uso automático de MySQL remoto (recomendado):

```
export MYSQL_HOST=seu-host-remoto
export MYSQL_PORT=3306
export MYSQL_DB=cloud_storage
export MYSQL_USER=usuario
export MYSQL_PASSWORD='sua_senha'
# Alternativamente, use uma URL completa:
export DATABASE_URL="mysql+pymysql://usuario:senha@host:3306/cloud_storage?charset=utf8mb4"
```

Se nenhuma variável estiver definida, o app usa SQLite local `cloud_storage.db`.

### 3. Configurar HTTPS
Use um servidor web como Nginx ou Apache com certificado SSL.

### 4. Executar com Gunicorn
```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### 5. Configurar Backup Automático
Implemente rotinas de backup para:
- Banco de dados
- Arquivos de usuários
- Configurações

## Limitações e Considerações

### Segurança
- Execução de scripts é limitada por timeout
- Não há sandboxing completo para execução
- Recomendado usar em ambiente controlado

### Performance
- SQLite adequado para poucos usuários
- Para muitos usuários, use PostgreSQL/MySQL
- Considere CDN para arquivos estáticos

### Escalabilidade
- Armazenamento local limitado
- Para produção, integre com AWS S3, Google Cloud Storage, etc.
- Implemente balanceamento de carga se necessário

## Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

## Suporte

Para suporte e dúvidas:
- Abra uma issue no GitHub
- Envie email para suporte@chiapettacloud.com

## Roadmap

### Versão 2.0
- [ ] Compartilhamento de arquivos
- [ ] Sincronização offline
- [ ] Preview de arquivos
- [ ] Editor de código integrado
- [ ] Comentários e anotações
- [ ] Versionamento de arquivos
- [ ] API REST completa
- [ ] Aplicativo mobile
- [ ] Integração com serviços externos
- [ ] Backup automático na nuvem
