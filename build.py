"""src와 vendor를 합쳐 단일 HTML(index.html)을 만든다."""
from pathlib import Path

ROOT = Path(__file__).parent


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def js_safe(code):
    # 라이브러리 안의 </script> 문자열이 HTML을 끊지 않게 한다.
    return code.replace("</script", "<\\/script")


html = read("src/app.html")
for mark, content in (
    ("/*__CSS__*/", read("src/app.css")),
    ("/*__EXCELJS__*/", js_safe(read("vendor/exceljs.min.js"))),
    ("/*__CLASS__*/", js_safe(read("src/classification.js"))),
    ("/*__VIZ__*/", js_safe(read("src/viz.js"))),
    ("/*__DEMO__*/", js_safe(read("src/demo.js"))),
    ("/*__APP__*/", js_safe(read("src/app.js"))),
):
    html = html.replace(mark, content)

out = ROOT / "index.html"
out.write_text(html, encoding="utf-8")
print(f"{out.name}: {out.stat().st_size / 1024 / 1024:.2f} MB")
