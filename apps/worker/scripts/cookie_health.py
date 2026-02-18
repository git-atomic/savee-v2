#!/usr/bin/env python
import argparse
import base64
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Tuple


def _json_loads_maybe_bom(text: str) -> Any:
    return json.loads(str(text).lstrip("\ufeff"))


def _load_json_file(path: Path) -> Any:
    return _json_loads_maybe_bom(path.read_text(encoding="utf-8-sig"))


def _unwrap_cookie_payload(data: Any) -> list:
    if isinstance(data, dict) and isinstance(data.get("cookies"), list):
        return data["cookies"]
    if isinstance(data, list):
        return data
    return []


def _resolve_cookie_source() -> Tuple[str, list]:
    cookies_json = os.getenv("COOKIES_JSON")
    if cookies_json:
        return "COOKIES_JSON", _unwrap_cookie_payload(_json_loads_maybe_bom(cookies_json))

    cookies_path = os.getenv("COOKIES_PATH", "").strip()
    if cookies_path:
        p = Path(cookies_path)
        if p.exists():
            return f"COOKIES_PATH ({p})", _unwrap_cookie_payload(_load_json_file(p))

    default_path = Path(__file__).resolve().parents[1] / "savee_cookies.json"
    if default_path.exists():
        return f"default file ({default_path})", _unwrap_cookie_payload(_load_json_file(default_path))

    return "none", []


def _cookie_expiry_epoch(cookie: dict) -> Optional[float]:
    for key in ("expirationDate", "expires"):
        value = cookie.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except Exception:
            continue
    return None


def _decode_jwt_exp(token: str) -> Optional[int]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding).decode("utf-8")
        obj = json.loads(decoded)
        exp = obj.get("exp")
        return int(exp) if exp is not None else None
    except Exception:
        return None


def _fmt_epoch(ts: Optional[float]) -> str:
    if ts is None:
        return "n/a"
    try:
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return dt.isoformat()
    except Exception:
        return "n/a"


def main() -> int:
    parser = argparse.ArgumentParser(description="Check worker cookie health")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="exit non-zero when auth cookies are missing/expired",
    )
    args = parser.parse_args()

    now = time.time()
    source, cookies = _resolve_cookie_source()
    print(f"cookie_source={source}")
    print(f"cookie_count_total={len(cookies)}")

    usable = []
    for c in cookies:
        if not isinstance(c, dict):
            continue
        name = c.get("name")
        value = c.get("value")
        domain = str(c.get("domain") or "").lstrip(".").lower()
        if not (name and value and domain):
            continue
        if domain.endswith("savee.com"):
            usable.append(c)

    print(f"cookie_count_usable_savee={len(usable)}")
    names = sorted({str(c.get("name")) for c in usable if c.get("name")})
    print(f"cookie_names={','.join(names) if names else 'none'}")

    auth = next((c for c in usable if c.get("name") == "auth_token"), None)
    if not auth:
        print("auth_token=missing")
        return 1 if args.strict else 0

    token = str(auth.get("value") or "")
    cookie_exp = _cookie_expiry_epoch(auth)
    jwt_exp = _decode_jwt_exp(token)
    auth_exp = min(
        [x for x in (cookie_exp, float(jwt_exp) if jwt_exp is not None else None) if x is not None],
        default=None,
    )
    is_expired = auth_exp is not None and auth_exp <= now

    print(f"auth_token_present=yes")
    print(f"auth_cookie_expiry_utc={_fmt_epoch(cookie_exp)}")
    print(f"auth_jwt_expiry_utc={_fmt_epoch(float(jwt_exp)) if jwt_exp is not None else 'n/a'}")
    print(f"auth_effective_expiry_utc={_fmt_epoch(auth_exp)}")
    print(f"auth_token_expired={'yes' if is_expired else 'no'}")

    sv_did = next((c for c in usable if c.get("name") == "sv_did"), None)
    if sv_did:
        sv_exp = _cookie_expiry_epoch(sv_did)
        print(f"sv_did_present=yes")
        print(f"sv_did_expiry_utc={_fmt_epoch(sv_exp)}")
    else:
        print("sv_did_present=no")

    if args.strict and is_expired:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

