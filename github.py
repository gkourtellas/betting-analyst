#!/usr/bin/env python3
"""
Usage: python3 github.py "commit message"

Stages all changes, commits with the given message, and pushes to the
current branch's upstream remote. Mirrors the python github.py workflow
used on other projects.
"""
import subprocess
import sys


def run(cmd: list[str]) -> None:
    print(f"$ {' '.join(cmd)}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit(result.returncode)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 github.py \"commit message\"")
        sys.exit(1)

    commit_message = sys.argv[1]

    run(["git", "add", "-A"])

    # Nothing to commit is not an error — just skip commit+push in that case.
    status = subprocess.run(["git", "diff", "--cached", "--quiet"])
    if status.returncode == 0:
        print("No changes to commit.")
        return

    run(["git", "commit", "-m", commit_message])
    run(["git", "push"])
    print("Done.")


if __name__ == "__main__":
    main()
