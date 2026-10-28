"""Allow imports beside trusted PlatformIO package scripts in embedded Python.

Python's ._pth isolation omits the script directory. PlatformIO's esptool wrapper
expects its sibling package to be importable. Restore only a script directory
inside the private package root supplied by the Agent, never arbitrary cwd,
PYTHONPATH, user site-packages or project source folders.
"""
import os
import sys

packages = os.environ.get('PLATFORMIO_PACKAGES_DIR')
script = sys.argv[0] if sys.argv else ''
if packages and script and not script.startswith('-'):
    root = os.path.normcase(os.path.realpath(packages))
    folder = os.path.normcase(os.path.realpath(os.path.dirname(script)))
    try:
        if folder != root and os.path.commonpath([root, folder]) == root and os.path.isfile(script):
            sys.path.insert(0, folder)
    except ValueError:
        pass
