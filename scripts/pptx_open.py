"""PowerPoint ファイルを python-pptx で開く。.pptx に加えて .potx（PowerPoint テンプレート）も開ける。

社内の書式は .potx（テンプレート）で配られることが多いが、python-pptx は .potx を
「PowerPoint ファイルではない」として開けない。中身は .pptx と同じで、違いは
[Content_Types].xml の本体の種類（template.main / presentation.main）だけなので、
メモリ上でそこだけ読み替えて開く。元のファイルは書き換えない。保存すると通常の .pptx になる。
"""
import io
import zipfile
from pathlib import Path

TEMPLATE_CT = b"application/vnd.openxmlformats-officedocument.presentationml.template.main+xml"
PRESENTATION_CT = b"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
SUFFIXES = (".pptx", ".potx")


def is_pptx_like(path):
    return str(path).lower().endswith(SUFFIXES)


def open_presentation(path):
    from pptx import Presentation

    path = Path(path)
    with zipfile.ZipFile(path) as z:
        ct = z.read("[Content_Types].xml")
        if TEMPLATE_CT not in ct:
            return Presentation(str(path))
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as out:
            for item in z.infolist():
                data = z.read(item.filename)
                if item.filename == "[Content_Types].xml":
                    data = data.replace(TEMPLATE_CT, PRESENTATION_CT)
                out.writestr(item, data)
    buf.seek(0)
    return Presentation(buf)
