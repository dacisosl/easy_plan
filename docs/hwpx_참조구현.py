"""
hwpx 참조 구현 — 평가계획 생성 도우미

실제로 동작을 확인한 코드다. TypeScript(jszip + @xmldom/xmldom)로 포팅할 때
아래 다섯 가지를 반드시 옮길 것.

  1) mimetype은 zip 첫 항목, 무압축(STORED)
  2) 문자열 치환 금지 — 한글은 한 줄을 여러 <hp:t> 조각으로 쪼갠다
  3) 빈 셀에는 <hp:t>가 없다 — 만들어 넣어야 한다 (안 하면 조용히 비어 나옴)
  4) 여러 줄 셀은 <hp:p>를 deepcopy 해서 서식을 유지한다
  5) 행 복제 후 cellAddr/rowAddr 재부여 + tbl/rowCnt 갱신
  6) 글자를 바꾼 문단의 <hp:linesegarray>를 지운다 — 줄바꿈 위치 캐시라서
     그냥 두면 새 글자를 옛 줄 폭에 욱여넣어 자간이 뭉개진다
"""

import zipfile, copy
import xml.etree.ElementTree as ET
NS='http://www.hancom.co.kr/hwpml/2011/paragraph'
ET.register_namespace('hp',NS)
def q(t): return '{%s}%s'%(NS,t)

class Doc:
    def __init__(self, path):
        self.zin=zipfile.ZipFile(path)
        self.data={n:self.zin.read(n) for n in self.zin.namelist()}
        self.order=self.zin.namelist()
        self.comp={i.filename:i.compress_type for i in self.zin.infolist()}
        self.root=ET.fromstring(self.data['Contents/section0.xml'])
        self._reparent()
    def _reparent(self):
        self.parent={}
        for p in self.root.iter():
            for c in p:
                self.parent[c]=p
    def tables(self):
        return list(self.root.iter(q('tbl')))
    def para_text(self,p):
        return ''.join(t.text or '' for t in p.iter(q('t')))
    def set_para(self,p,new):
        for lsa in list(p.findall(q('linesegarray'))):
            p.remove(lsa)
        ts=list(p.iter(q('t')))
        if ts:
            ts[0].text=new
            for t in ts[1:]: t.text=''
            return True
        run=p.find(q('run'))
        if run is None:
            run=ET.Element(q('run')); run.set('charPrIDRef','0'); p.insert(0,run)
        t=ET.Element(q('t')); t.text=new
        run.insert(0,t)
        return True
    def cell(self,tbl,r,c):
        rows=tbl.findall(q('tr'))
        if r>=len(rows): return None
        cells=rows[r].findall(q('tc'))
        if c>=len(cells): return None
        return cells[c]
    def set_cell(self,tbl,r,c,lines):
        """lines: str 또는 list[str]. 문단 여러 개면 첫 문단들에 나눠 넣는다"""
        tc=self.cell(tbl,r,c)
        if tc is None: return False
        if isinstance(lines,str): lines=[lines]
        paras=[]
        for sub in tc.findall(q('subList')):
            paras.extend(sub.findall(q('p')))
        if not paras: return False
        base=paras[0]
        sub=tc.find(q('subList'))
        for p in paras[1:]: sub.remove(p)
        self.set_para(base, lines[0])
        for extra in lines[1:]:
            np=copy.deepcopy(base)
            self.set_para(np, extra)
            sub.append(np)
        return True
    def cell_text(self,tbl,r,c):
        tc=self.cell(tbl,r,c)
        if tc is None: return None
        return ' / '.join(self.para_text(p) for sub in tc.findall(q('subList')) for p in sub.findall(q('p')))
    def remove(self,el):
        par=self.parent.get(el)
        if par is None: return False
        par.remove(el); return True
    def remove_table(self,tbl):
        """표를 감싼 최상위 문단째로 지운다"""
        el=tbl
        while el in self.parent:
            par=self.parent[el]
            if par.tag==q('p') and self.parent.get(par) is not None and self.parent[par].tag!=q('subList'):
                return self.remove(par)
            el=par
        return self.remove(tbl)
    def top_paras(self):
        """섹션 최상위 문단들 (표를 품은 것 포함)"""
        out=[]
        for ch in self.root:
            if ch.tag==q('p'): out.append(ch)
        return out
    def save(self,path):
        self.data['Contents/section0.xml']=ET.tostring(self.root,encoding='utf-8',xml_declaration=True)
        zo=zipfile.ZipFile(path,'w')
        zo.writestr(zipfile.ZipInfo('mimetype'), self.data['mimetype'], compress_type=zipfile.ZIP_STORED)
        for n in self.order:
            if n=='mimetype': continue
            zo.writestr(n,self.data[n],compress_type=self.comp.get(n,zipfile.ZIP_DEFLATED))
        zo.close()

# ────────────────────────────────────────────────────────────
# 사용 예
# ────────────────────────────────────────────────────────────

def top_tables(doc):
    """중첩되지 않은 최상위 표만 문서 순서대로"""
    res = []
    for t in doc.root.iter(q('tbl')):
        el, nested = t, False
        while el in doc.parent:
            el = doc.parent[el]
            if el.tag == q('tbl'):
                nested = True
                break
        if not nested:
            res.append(t)
    return res


def fill_standard_table(doc, tbl, items):
    """성취기준 표를 항목 수에 맞춰 늘리고 채운다.

    items: [{'code','text','levels':[A,B,C,D,E]}, ...]
    한 항목이 5행(A~E)을 차지한다. 템플릿의 1~5행을 블록으로 삼아 복제한다.
    """
    trs = tbl.findall(q('tr'))
    block = [copy.deepcopy(tr) for tr in trs[1:6]]

    for tr in trs[1:]:
        tbl.remove(tr)
    for _ in items:
        for tr in block:
            tbl.append(copy.deepcopy(tr))
    doc._reparent()

    for i, it in enumerate(items):
        base = 1 + i * 5
        doc.set_cell(tbl, base, 0, [it['code'] + ' ' + it['text']])
        for k, lv in enumerate('ABCDE'):
            r = base + k
            off = 1 if k == 0 else 0        # 첫 행은 성취기준 셀이 앞에 온다
            doc.set_cell(tbl, r, off, [lv])
            doc.set_cell(tbl, r, off + 1, [it['levels'][k]])

    # ★ 빠뜨리면 한글에서 표가 깨진다
    for ri, tr in enumerate(tbl.findall(q('tr'))):
        for tc in tr.findall(q('tc')):
            ca = tc.find(q('cellAddr'))
            if ca is not None:
                ca.set('rowAddr', str(ri))
    tbl.set('rowCnt', str(len(tbl.findall(q('tr')))))


def score_sum_labels(items, base):
    """배점 합 목록을 자동 생성한다. items: [(요소명, [배점...]), ...]

    양식에 길게 늘어선 '배점 합 N점' 목록은 교사가 타이핑할 것이 아니라
    최대합부터 최소합까지 급간만큼 찍은 것이다.
    """
    mx = sum(pts[0] for _, pts in items)
    mn = sum(pts[-1] for _, pts in items)
    step = min(abs(pts[k] - pts[k + 1])
               for _, pts in items for k in range(len(pts) - 1))
    out, v = [], mx
    while v >= mn - 1e-9:
        out.append('배점 합 %s점' % (int(v) if float(v).is_integer() else v))
        v -= step
    out.append('기본점수 %s점' % base)
    return out


def month_week_label(week_start, all_week_starts):
    """월 기준 주차. 시작일이 속한 달로 귀속하고 그 달의 순번을 센다.

    주차 <-> 라벨이 1:1이라 역변환이 된다.
    달을 걸친 주는 시작일 쪽 달에만 속한다. (3.30~4.3 -> 3월 5주)
    """
    m = week_start.month
    same = [d for d in all_week_starts if d.month == m]
    return '%d월 %d주' % (m, same.index(week_start) + 1)


if __name__ == '__main__':
    d = Doc('templates/plan_blank.hwpx')
    T = top_tables(d)
    d.set_cell(T[0], 1, 0, ['2026학년도 2학년 1학기 < 미적분Ⅰ >',
                            '교수학습 및 평가 운영계획'])
    d.set_cell(T[2], 1, 3, ['[12미적Ⅰ-01-01] 함수의 극한의 뜻을 알고, 이를 설명할 수 있다.'])
    d.save('out.hwpx')
