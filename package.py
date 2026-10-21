"""Create a deterministic offline ZIP without overwriting existing files."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse
p=argparse.ArgumentParser()
p.add_argument('--site',type=Path,default=Path('dist'))
p.add_argument('--output',type=Path,default=Path('artifacts/offline-image-style.zip'))
a=p.parse_args()
if not (a.site/'首页.html').is_file(): raise SystemExit('Build site first.')
a.output.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(a.output,'x',compression=ZIP_DEFLATED) as z:
    for f in sorted(a.site.rglob('*')):
        if f.is_symlink(): raise ValueError('Symlinks are not packaged.')
        if f.is_file():
            info=ZipInfo('offline-image-style/'+f.relative_to(a.site).as_posix(),date_time=(2026,1,1,0,0,0))
            info.compress_type=ZIP_DEFLATED
            info.external_attr=0o100644<<16
            z.writestr(info,f.read_bytes())
print('Offline ZIP created.')
