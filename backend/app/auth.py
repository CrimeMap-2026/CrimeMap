"""Cookie-backed, server-enforced role-based authorization for the local prototype.

No default accounts. Tokens are opaque random values, hashed at rest and revocable.
Run behind HTTPS before any non-local exposure. Do not use for real police records.
"""
import hashlib
import hmac
import os
import re
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth_models import LoginSession, User
from .db import get_db

COOKIE = "crimemap_session"
SESSION_SECONDS = 8 * 60 * 60
ROLES = ("viewer", "analyst", "officer", "admin")
ROLE_ACCESS = {
    "viewer": frozenset({"read"}),
    "analyst": frozenset({"read", "analyze"}),
    "officer": frozenset({"read", "analyze", "write"}),
    "admin": frozenset({"read", "analyze", "write", "delete", "manage"}),
}
Role = Literal["viewer", "analyst", "officer", "admin"]
router = APIRouter(prefix="/api", tags=["authentication"])
USERNAME_RE = re.compile(r"^[a-z][a-z0-9._-]{2,39}$")


class LoginBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=40)
    password: SecretStr


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=40)
    password: SecretStr
    role: Role = "viewer"


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Role | None = None
    is_active: bool | None = None


class PasswordBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: SecretStr


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: SecretStr
    new_password: SecretStr


class PublicUser(BaseModel):
    id: str
    username: str
    role: Role
    is_active: bool


def public_user(user: User) -> PublicUser:
    return PublicUser(id=user.id, username=user.username, role=user.role, is_active=user.is_active)


def normalize_username(value: str) -> str:
    value = value.strip().lower()
    if not USERNAME_RE.fullmatch(value):
        raise HTTPException(422, "Username must be 3–40 characters: lowercase letters, digits, dots, hyphens, underscores; start with a letter")
    return value


def validate_password(value: str) -> None:
    if not 12 <= len(value) <= 128:
        raise HTTPException(422, "Password must contain 12–128 characters")


def password_hash(value: str) -> str:
    validate_password(value)
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(value.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + salt.hex() + "$" + digest.hex()


def check_password(value: str, stored: str) -> bool:
    try:
        algorithm, salt_hex, digest_hex = stored.split("$", 2)
        if algorithm != "scrypt":
            return False
        expected = bytes.fromhex(digest_hex)
        result = hashlib.scrypt(value.encode("utf-8"), salt=bytes.fromhex(salt_hex),
                                n=2**14, r=8, p=1, dklen=len(expected))
        return hmac.compare_digest(result, expected)
    except (ValueError, TypeError, OverflowError):
        return False


def create_user(db: Session, username: str, password: str, role: str) -> User:
    if role not in ROLES:
        raise HTTPException(422, "Invalid role")
    name = normalize_username(username)
    if db.scalar(select(User.id).where(User.username == name)):
        raise HTTPException(409, "Username is already in use")
    user = User(id=str(uuid.uuid4()), username=name, password_hash=password_hash(password), role=role,
                is_active=True, failed_logins=0, locked_until=0)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(LoginSession(
        id=str(uuid.uuid4()), user_id=user.id, token_hash=token_digest(token),
        expires_at=int(time.time()) + SESSION_SECONDS,
    ))
    db.commit()
    return token


def set_cookie(response: Response, token: str, secure: bool) -> None:
    response.set_cookie(
        key=COOKIE, value=token, httponly=True, secure=secure, samesite="strict",
        path="/api", max_age=SESSION_SECONDS,
    )


def revoke_sessions(db: Session, user: User) -> None:
    for item in db.scalars(select(LoginSession).where(LoginSession.user_id == user.id)).all():
        db.delete(item)
    db.commit()


def current_user(request: Request, db: Annotated[Session, Depends(get_db)]) -> User:
    token = request.cookies.get(COOKIE)
    if not token or len(token) > 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required")
    session = db.scalar(select(LoginSession).where(LoginSession.token_hash == token_digest(token)))
    if session is None or session.expires_at <= int(time.time()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or revoked")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active or user.role not in ROLE_ACCESS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account disabled or unavailable")
    return user


def require_permission(permission: str):
    if permission not in ROLE_ACCESS["admin"]:
        raise ValueError("Unknown permission")

    def enforce(user: Annotated[User, Depends(current_user)]) -> User:
        if permission not in ROLE_ACCESS[user.role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot perform this action")
        return user

    return enforce


def check_request_origin(request: Request) -> None:
    """Reject untrusted browser writes while supporting the local Vite API proxy.

    Browsers send Origin for the frontend (localhost:5173), but the backend may
    see the forwarded Host (127.0.0.1:8000). Those are not the same host/port
    even though the browser has made a same-origin call to Vite.
    """
    from urllib.parse import urlsplit

    origin = request.headers.get("origin")
    if not origin:
        # Non-browser clients without Origin are still subject to authentication.
        return

    parsed = urlsplit(origin)
    host = request.headers.get("host", "").lower()
    try:
        valid_origin = (
            parsed.scheme in ("http", "https")
            and bool(parsed.hostname)
            and parsed.username is None and parsed.password is None
            and parsed.path == "" and parsed.query == "" and parsed.fragment == ""
            and (parsed.port is None or parsed.port > 0)
        )
    except ValueError:
        valid_origin = False

    # Direct same-origin requests work without any configuration. The protocol
    # is validated independently to keep the proxy/HTTPS cases explicit.
    same_host = valid_origin and parsed.netloc.lower() == host and parsed.scheme == request.url.scheme

    # Loopback-only defaults for the *local* Vite server. Never accept these
    # defaults when the API's Host is a public deployment hostname.
    loopback_host = host.split(":", 1)[0] in ("127.0.0.1", "localhost", "[::1]")
    local_vite = loopback_host and origin.lower() in (
        "http://localhost:5173", "http://127.0.0.1:5173",
    )

    # In a production reverse-proxy deployment, explicitly configure trusted
    # browser origins (HTTPS recommended). No wildcards or suffix matching.
    configured = {
        value.strip().lower()
        for value in os.getenv("CRIMEMAP_TRUSTED_ORIGINS", "").split(",")
        if value.strip()
    }
    if not valid_origin or not (same_host or local_vite or origin.lower() in configured):
        raise HTTPException(403, "Cross-origin changes are not allowed")


@router.post("/auth/login")
def login(body: LoginBody, response: Response, request: Request, db: Annotated[Session, Depends(get_db)]):
    check_request_origin(request)
    username = body.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    now = int(time.time())
    # Generic response avoids revealing which usernames exist.
    if user is None or not user.is_active or user.locked_until > now:
        raise HTTPException(401, "Invalid credentials or account unavailable")
    if not check_password(body.password.get_secret_value(), user.password_hash):
        user.failed_logins += 1
        if user.failed_logins >= 5:
            user.locked_until = now + 15 * 60
            user.failed_logins = 0
        db.commit()
        raise HTTPException(401, "Invalid credentials or account unavailable")
    user.failed_logins = 0
    user.locked_until = 0
    db.commit()
    token = issue_session(db, user)
    set_cookie(response, token, request.url.scheme == "https")
    return public_user(user)


@router.post("/auth/logout")
def logout(response: Response, request: Request, db: Annotated[Session, Depends(get_db)]):
    check_request_origin(request)
    token = request.cookies.get(COOKIE)
    if token:
        session = db.scalar(select(LoginSession).where(LoginSession.token_hash == token_digest(token)))
        if session:
            db.delete(session)
            db.commit()
    response.delete_cookie(COOKIE, path="/api", samesite="strict")
    return {"signed_out": True}


@router.get("/auth/me", response_model=PublicUser)
def me(user: Annotated[User, Depends(current_user)]):
    return public_user(user)


@router.post("/auth/change-password")
def change_password(body: PasswordChange, request: Request,
                    user: Annotated[User, Depends(current_user)],
                    db: Annotated[Session, Depends(get_db)]):
    check_request_origin(request)
    if not check_password(body.current_password.get_secret_value(), user.password_hash):
        raise HTTPException(403, "Current password is incorrect")
    user.password_hash = password_hash(body.new_password.get_secret_value())
    db.commit()
    revoke_sessions(db, user)
    return {"sessions_revoked": True}


@router.get("/admin/users", response_model=list[PublicUser], dependencies=[Depends(require_permission("manage"))])
def users(db: Annotated[Session, Depends(get_db)]):
    return [public_user(u) for u in db.scalars(select(User).order_by(User.username)).all()]


@router.post("/admin/users", response_model=PublicUser, status_code=201)
def add_user(body: UserCreate, request: Request,
             admin: Annotated[User, Depends(require_permission("manage"))],
             db: Annotated[Session, Depends(get_db)]):
    check_request_origin(request)
    return public_user(create_user(db, body.username, body.password.get_secret_value(), body.role))


@router.patch("/admin/users/{user_id}", response_model=PublicUser)
def change_user(user_id: str, body: UserPatch, request: Request,
                admin: Annotated[User, Depends(require_permission("manage"))],
                db: Annotated[Session, Depends(get_db)]):
    check_request_origin(request)
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found")
    if target.id == admin.id and ((body.role is not None and body.role != "admin") or body.is_active is False):
        raise HTTPException(403, "You cannot demote or disable your own administrator account")
    if body.role is None and body.is_active is None:
        raise HTTPException(422, "Specify role or active status")
    changed = False
    if body.role is not None and target.role != body.role:
        target.role = body.role
        changed = True
    if body.is_active is not None and target.is_active != body.is_active:
        target.is_active = body.is_active
        changed = True
    db.commit()
    if changed:
        revoke_sessions(db, target)
    return public_user(target)


@router.put("/admin/users/{user_id}/password")
def reset_password(user_id: str, body: PasswordBody, request: Request,
                   admin: Annotated[User, Depends(require_permission("manage"))],
                   db: Annotated[Session, Depends(get_db)]):
    check_request_origin(request)
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found")
    target.password_hash = password_hash(body.password.get_secret_value())
    target.failed_logins = 0
    target.locked_until = 0
    db.commit()
    revoke_sessions(db, target)
    return {"sessions_revoked": True}
