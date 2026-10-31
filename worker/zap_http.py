"""Single bounded-size HTTP read; parent enforces the whole process deadline."""
import json
import sys
from urllib.request import build_opener, ProxyHandler


def main():
    request = json.load(sys.stdin)
    opener = build_opener(ProxyHandler({}))
    with opener.open(request['url'],timeout=request['timeout']) as response:
        body = response.read(16 * 1024 * 1024 + 1)
    if len(body) > 16 * 1024 * 1024:
        raise ValueError('ZAP API response exceeds 16 MiB')
    sys.stdout.buffer.write(body)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never output URLs, API bodies or environment to process diagnostics.
        raise SystemExit(1) from None
