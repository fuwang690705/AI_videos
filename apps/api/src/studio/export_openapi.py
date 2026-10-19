import json

from studio.core.config import REPO_ROOT
from studio.main import app


def main() -> None:
    target = REPO_ROOT / "packages/contracts/openapi.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Exported {target.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
