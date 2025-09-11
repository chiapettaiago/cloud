#!/usr/bin/env python3
"""Integração básica do fluxo de upload usando o cliente de teste do Flask."""

import io
import os
import sys
from datetime import datetime

sys.path.append(os.path.dirname(__file__))
from app import app  # noqa: E402


def test_upload_and_list():
    """Valida login, upload e listagem de arquivos."""
    client = app.test_client()

    # 1. Fazer login
    login_response = client.post(
        "/api/login", json={"username": "admin", "password": "admin123"}
    )
    assert login_response.status_code == 200
    token = login_response.get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Listar arquivos antes do upload
    files_before = client.get("/api/files?folder_id=0", headers=headers)
    assert files_before.status_code == 200

    # 3. Criar um arquivo de teste
    test_content = (
        "Este é um arquivo de teste criado em " + datetime.utcnow().isoformat()
    )
    data = {
        "folder_id": "0",
        "file": (io.BytesIO(test_content.encode("utf-8")), "teste_upload.txt"),
    }
    upload_response = client.post(
        "/api/upload",
        headers=headers,
        data=data,
        content_type="multipart/form-data",
    )
    assert upload_response.status_code == 201

    # 4. Listar arquivos após o upload
    files_after = client.get("/api/files?folder_id=0", headers=headers)
    assert files_after.status_code == 200
    data_after = files_after.get_json()
    filenames = [f.get("filename") for f in data_after.get("files", [])]
    assert "teste_upload.txt" in filenames

    # 5. Verificar informações do usuário
    user_info = client.get("/api/user-info", headers=headers)
    assert user_info.status_code == 200


if __name__ == "__main__":
    test_upload_and_list()
