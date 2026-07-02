"""
Reversible symmetric encryption for the USAJobs login password (Epic 10 hardening).

The USAJobs password is a REUSABLE credential the browser agent must type into the
USAJobs sign-in form, so it needs reversible symmetric encryption — Fernet
(AES-128-CBC + HMAC) — NOT a one-way hash. We encrypt at the application layer and
store only ciphertext in Supabase; the plaintext is recovered only in the worker,
in memory, at the moment the agent needs it.

Key handling:
- The key comes from USAJOBS_ENC_KEY (a urlsafe-base64 32-byte Fernet key). It is a
  Railway secret in prod and a local .env value in dev — NEVER committed.
- Generate one with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
- Fernet is symmetric: the SAME key encrypts and decrypts. Rotating it requires
  re-encrypting every stored value (decrypt-with-old → encrypt-with-new); rotation
  tooling is intentionally not built here.

Fail-closed:
- The key is loaded lazily, so importing this module never crashes app startup when
  the key is absent. Any actual encrypt/decrypt without a valid key raises a clear
  RuntimeError instead of silently storing or returning plaintext.

NEVER log the plaintext OR the ciphertext from this module.
"""
import logging
import os

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Every Fernet token begins with this urlsafe-base64 marker (version byte 0x80).
# Used by the migration to recognize already-encrypted values cheaply before the
# (more expensive, authoritative) trial decrypt.
_FERNET_PREFIX = "gAAAAA"

_ENV_KEY = "USAJOBS_ENC_KEY"

# Cached Fernet instance — the key doesn't change within a process lifetime.
_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Return a cached Fernet built from USAJOBS_ENC_KEY, or raise a clear error.

    Loaded lazily (not at import) so a missing key never breaks unrelated features
    on startup — it only fails the specific encrypt/decrypt that needs it.
    """
    global _fernet
    if _fernet is not None:
        return _fernet

    raw = (os.getenv(_ENV_KEY) or "").strip()
    if not raw:
        raise RuntimeError(
            f"{_ENV_KEY} is not set; cannot encrypt/decrypt the USAJobs password. "
            "Set it in Railway (prod) and your local .env."
        )
    try:
        _fernet = Fernet(raw.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        # Wrong length / not urlsafe-base64. Don't echo the key in the message.
        raise RuntimeError(
            f"{_ENV_KEY} is not a valid Fernet key (must be a urlsafe-base64 "
            "32-byte key). Generate one with "
            "Fernet.generate_key()."
        ) from exc
    return _fernet


def encrypt_usajobs_password(plaintext: str | None) -> str | None:
    """Encrypt a plaintext password to a Fernet token.

    Empty/None in → None out, so clearing the field stores SQL NULL rather than an
    encrypted empty string. Raises RuntimeError if the key is missing/invalid.
    """
    if plaintext is None:
        return None
    if not plaintext.strip():
        return None
    token = _get_fernet().encrypt(plaintext.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_usajobs_password(ciphertext: str | None) -> str | None:
    """Decrypt a Fernet token back to the plaintext password.

    None/empty in → None out. Raises RuntimeError if the key is missing/invalid or
    the token is not decryptable with the current key — never returns a wrong value
    silently. Callers must use the result in-memory only and never log it.
    """
    if ciphertext is None:
        return None
    if not ciphertext.strip():
        return None
    try:
        return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError(
            "Failed to decrypt the USAJobs password: token is invalid for the "
            f"current {_ENV_KEY} (wrong/rotated key, or the value is not ciphertext)."
        ) from exc


def is_encrypted(value: str | None) -> bool:
    """True if `value` is a Fernet token decryptable with the current key.

    Used by the migration to skip already-encrypted rows so it is idempotent. Cheap
    prefix check first, then an authoritative trial decrypt. Returns False (rather
    than raising) for plaintext so the migration can act on it.
    """
    if not value or not value.startswith(_FERNET_PREFIX):
        return False
    try:
        _get_fernet().decrypt(value.encode("utf-8"))
        return True
    except InvalidToken:
        return False
