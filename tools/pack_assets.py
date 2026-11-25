# build 67: gzip every model to binary .glbz (and big JSON to .jsz), then write their content hashes into index.html (ASSETH)
import json, base64, gzip, hashlib, os, re, sys
d = sys.argv[1]; H = {}
def h(b): return hashlib.sha1(b).hexdigest()[:10]
for f in sorted(os.listdir(d)):
    if not f.endswith('.json') or f in ('people.json', 'zombie3.json'): continue
    p = os.path.join(d, f); raw = open(p, 'rb').read(); n = f[:-5]
    H[f] = h(raw)
    try: j = json.loads(raw)
    except Exception: continue
    if isinstance(j, dict) and 'glb' in j:
        out = os.path.join(d, n + '.glbz'); g = base64.b64decode(j['glb'])
    elif n == 'world' or n.startswith('vo'):
        out = os.path.join(d, n + '.jsz'); g = raw
    else: continue
    z = gzip.compress(g, 9, mtime=0)
    if not os.path.exists(out) or open(out, 'rb').read() != z: open(out, 'wb').write(z)
    H[os.path.basename(out)] = h(z)
ix = os.path.join(d, 'index.html'); s = open(ix).read()
s2 = re.sub(r'var ASSETH = \{[^}]*\};', 'var ASSETH = ' + json.dumps(H, separators=(',', ':')) + ';', s, count=1)
open(ix, 'w').write(s2)
print(len(H), 'hashes', sum(os.path.getsize(os.path.join(d, k)) for k in H if not k.endswith('.json')) / 1e6, 'MB packed')
