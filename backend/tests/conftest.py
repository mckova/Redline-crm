import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["KESHER_SEED"] = "off"
os.environ["KESHER_AI_WORKER"] = "off"
os.environ["KESHER_AI"] = "off"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    from app import db as dbmod
    from app.main import create_app
    from app.models import User
    from app.auth import hash_password

    engine = dbmod.make_engine(f"sqlite:///{tmp_path}/t.db")
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(dbmod, "engine", engine)
    monkeypatch.setattr(dbmod, "SessionLocal", Session)
    dbmod.Base.metadata.create_all(engine)
    with Session() as s:
        s.add(User(email="a@x.io", name="Admin", role="admin", password_hash=hash_password("pw")))
        s.commit()

    app = create_app()

    def _db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[dbmod.get_db] = _db
    with TestClient(app) as c:
        token = c.post("/api/auth/login", json={"email": "a@x.io", "password": "pw"}).json()["token"]
        c.headers["Authorization"] = f"Bearer {token}"
        yield c
