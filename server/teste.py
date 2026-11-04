import base64
import hashlib
import secrets
from urllib.parse import quote, urlencode

API_URL = "https://api.aferis.ai"


def create_pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)  # 64 caracteres
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def authorization_url(client_id, redirect_uri, scopes, state, challenge) -> str:
    query = urlencode(
        {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": " ".join(scopes),
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
        quote_via=quote,
    )
    return f"{API_URL}/oauth/authorize?{query}"


def start_authorization(session: dict, client_id: str, redirect_uri: str) -> str:
    # No servidor: guarde state e verifier na sessão do titular.
    state = secrets.token_hex(16)  # mínimo de 16 caracteres
    verifier, challenge = create_pkce()
    session["oauth"] = {"state": state, "verifier": verifier}
    return authorization_url(
        client_id, redirect_uri, ["all"], state, challenge
    )

if __name__ == "__main__":
    session : dict [str , object] = {"name": "Luiz", "email": "testa@teste.com", "age": 19 }
    response = start_authorization(session, "6zoknjt7JKX96gesKCbL6pa5", "http://localhost:8000/auth/callback")
    print(response)
