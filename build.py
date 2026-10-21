"""Build a self-contained offline atlas with a user-supplied catalog."""
from pathlib import Path
import argparse, json, shutil, tempfile

ROOT = Path(__file__).resolve().parent

def build(catalog, output):
    catalog = Path(catalog).resolve()
    output = Path(output).resolve()
    if output.exists():
        raise ValueError('Output already exists; select a new directory.')
    if output == catalog.parent or catalog.parent.is_relative_to(output):
        raise ValueError('Output must not contain the input catalog.')
    data = json.loads(catalog.read_text(encoding='utf-8'))
    if not isinstance(data, list) or not data:
        raise ValueError('Catalog must be a nonempty array.')
    ids, images = set(), []
    fields = ('name','title','features','uses','template','original','source','group','image')
    for d in data:
        if type(d.get('id')) is not int or d['id'] <= 0 or d['id'] in ids:
            raise ValueError('IDs must be unique positive integers.')
        ids.add(d['id'])
        if any(not isinstance(d.get(k), str) or not d[k].strip() for k in fields):
            raise ValueError('Missing required text field.')
        if 'en' in d:
            en=d['en']
            if any(not isinstance(en.get(k),str) or not en[k].strip() for k in ('name','title','features','template','source','group')):
                raise ValueError('Incomplete English text fields.')
            if not isinstance(en.get('uses'),list) or len(en['uses']) != len(d['uses'].split('、')) or any(not isinstance(u,str) or not u.strip() for u in en['uses']):
                raise ValueError('English uses must align with the Chinese uses.')
        rel = Path(d['image'])
        target = (catalog.parent / rel).resolve()
        if rel.is_absolute() or '\\' in d['image'] or not target.is_relative_to(catalog.parent):
            raise ValueError('Image must be a relative path within catalog directory.')
        if target.suffix.lower() not in ('.png','.jpg','.jpeg','.webp','.gif','.svg') or not target.is_file():
            raise ValueError('Unsupported or missing image.')
        images.append((rel,target))
    text = (ROOT/'template.html').read_text(encoding='utf-8')
    text = text.replace('__COUNT__',str(len(data))).replace('__DATA__',json.dumps(data,ensure_ascii=False).replace('<','\\u003c'))
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staging=Path(tmp)/'site'
        staging.mkdir()
        for rel,target in images:
            dest=staging/rel
            dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(target,dest)
        (staging/'首页.html').write_text(text,encoding='utf-8')
        shutil.copyfile(ROOT/'LICENSE',staging/'LICENSE')
        for name in ('CONTENT_NOTICE.md','CONTENT_NOTICE.en.md'):
            shutil.copyfile(ROOT/name,staging/name)
        shutil.copyfile(ROOT/'guide.html',staging/'使用说明.html')
        provenance=catalog.parent/'provenance.json'
        if provenance.is_file():
            shutil.copyfile(provenance,staging/'provenance.json')
        staging.rename(output)
    return len(data)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--catalog',type=Path,default=ROOT/'examples/catalog.json')
    parser.add_argument('--output',type=Path,default=ROOT/'dist')
    args=parser.parse_args()
    print(f'Built {build(args.catalog,args.output)} items.')
