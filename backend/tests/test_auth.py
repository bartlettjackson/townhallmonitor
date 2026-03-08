"""Tests for auth endpoints: login, register, me."""


class TestLogin:
    async def test_valid_login(self, client, test_user):
        user, _ = test_user
        resp = await client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "testpass123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == "test@example.com"

    async def test_wrong_password(self, client, test_user):
        resp = await client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "wrongpass"},
        )
        assert resp.status_code == 401

    async def test_nonexistent_user(self, client):
        resp = await client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "anything"},
        )
        assert resp.status_code == 401


class TestRegister:
    async def test_valid_registration(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "securepass",
                "name": "New User",
                "invite_code": "test-invite",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == "newuser@example.com"

    async def test_wrong_invite_code(self, client):
        resp = await client.post(
            "/api/auth/register",
            json={
                "email": "bad@example.com",
                "password": "securepass",
                "name": "Bad User",
                "invite_code": "wrong-code",
            },
        )
        assert resp.status_code == 403

    async def test_duplicate_email(self, client, test_user):
        resp = await client.post(
            "/api/auth/register",
            json={
                "email": "test@example.com",
                "password": "anotherpass",
                "name": "Duplicate",
                "invite_code": "test-invite",
            },
        )
        assert resp.status_code == 409


class TestMe:
    async def test_with_valid_token(self, client, auth_headers):
        resp = await client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"
        assert data["name"] == "Test User"

    async def test_without_token(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 403

    async def test_with_invalid_token(self, client):
        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid-token-here"},
        )
        assert resp.status_code == 401
