"""Download the exact, hash-locked runtime inputs. Never install or execute them."""
import argparse
import hashlib
import json
import pathlib
import re
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--lock', type=pathlib.Path, default=pathlib.Path(__file__).with_name('runtime-lock.json'))
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
lock = json.loads(args.lock.read_text(encoding='utf-8'))
if lock['schemaVersion'] != 1:
    raise ValueError('Unsupported runtime lock schema')
args.output.mkdir(parents=True, exist_ok=True)

def download(entry, url):
    name, expected = entry['file'], entry['sha256']
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]+', name) or not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise ValueError('Invalid filename/hash in runtime lock')
    destination = args.output / name
    if not destination.exists():
        partial = destination.with_name(destination.name + '.part')
        with urllib.request.urlopen(url, timeout=90) as response, partial.open('wb') as stream:
            while chunk := response.read(1024 * 1024):
                stream.write(chunk)
        if hashlib.sha256(partial.read_bytes()).hexdigest() != expected:
            raise ValueError(f'Checksum mismatch: {name}')
        partial.replace(destination)
    if hashlib.sha256(destination.read_bytes()).hexdigest() != expected:
        raise ValueError(f'Existing input has wrong checksum: {name}')
    print(f'Verified {name}', flush=True)

node = re.fullmatch(r'node-v(\d+\.\d+\.\d+)-win-x64.zip', lock['node']['file'])
python = re.fullmatch(r'python-(\d+\.\d+\.\d+)-embed-amd64.zip', lock['python']['file'])
if not node or not python:
    raise ValueError('Unsupported runtime archive')
download(lock['node'], f'https://nodejs.org/dist/v{node[1]}/{lock["node"]["file"]}')
download(lock['python'], f'https://www.python.org/ftp/python/{python[1]}/{lock["python"]["file"]}')
requirements = {}
for requirement in lock['requirements']:
    name, version = requirement.split('==')
    requirements[name.lower().replace('_', '-')] = (name, version)
for wheel in lock['wheels']:
    name, version = requirements[wheel['file'].split('-')[0].lower().replace('_', '-')]
    with urllib.request.urlopen(f'https://pypi.org/pypi/{urllib.parse.quote(name)}/{urllib.parse.quote(version)}/json', timeout=30) as response:
        metadata = json.load(response)
    release = next(item for item in metadata['urls'] if item['filename'] == wheel['file'])
    url = urllib.parse.urlparse(release['url'])
    if url.scheme != 'https' or url.hostname != 'files.pythonhosted.org' or release['digests']['sha256'] != wheel['sha256']:
        raise ValueError('PyPI metadata does not match reviewed runtime lock')
    download(wheel, release['url'])
