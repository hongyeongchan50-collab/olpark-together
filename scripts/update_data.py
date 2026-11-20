#!/usr/bin/env python3
"""올팍동행 v2 공공데이터 수집기 (표준 라이브러리만 사용).

공식 주차 API는 한국체육산업개발 공개목록 64의 주소이며 별도 비밀키를
요구하지 않는다. 원문의 parking_sum은 '주차대수'로만 표기한다.
FAQ CSV 원본은 파일데이터로, 운영자가 포털에서 내려받아 입력해야 한다.
공연 API는 XML 필드명이 검증된 경우에만 명시적 매핑을 사용한다.
입력 실패시 마지막 정상 스냅샷 보존. 성공 여부를 CI 로그로 기록한다.
"""
from __future__ import annotations
import csv
import io
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / 'data' / 'snapshot.js'
PREFIX = 'window.OLPARK_DATA = '
KST = timezone(timedelta(hours=9))
PARKING_PUBLIC_ENDPOINT = 'https://www.ksponco.or.kr/online/main/parkingorsApi.do?apiKey=PARKING21803504'
FAQ_DATASET = 'https://www.data.go.kr/data/15089962/fileData.do'
EVENT_DATASET = 'https://www.data.go.kr/data/3037877/openapi.do'
FAQ_KEYWORDS = {
    'wheelchair': ('휠체어', '장애인', '경사로', '무장애'),
    'stroller': ('유모차', '유아차', '수유실', '기저귀'),
    'transit': ('지하철', '대중교통', '버스', '역에서'),
    'car': ('주차', '차량', '주차장'),
    'event': ('공연', '콘서트', '공연장', '관람'),
    'park': ('공원', '산책', '장미광장'),
}

def timestamp():
    return datetime.now(KST).isoformat(timespec='seconds')

def read():
    content = SNAPSHOT.read_text(encoding='utf-8')
    pos = content.index(PREFIX) + len(PREFIX)
    return json.loads(content[pos:].strip().removesuffix(';'))

def write(data):
    temp = SNAPSHOT.with_suffix('.tmp')
    payload = json.dumps(data, ensure_ascii=False, indent=2).replace('</', '<\\/')
    temp.write_text('/* 공식 데이터 스냅샷 · 수집/갱신 상태는 meta에서 확인 */\n' + PREFIX + payload + ';\n', encoding='utf-8')
    temp.replace(SNAPSHOT)

def download(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in ('www.ksponco.or.kr', 'www.data.go.kr', 'api.data.go.kr'):
        raise ValueError('허용된 공공데이터 HTTPS 도메인만 접근합니다')
    req = Request(url, headers={'User-Agent':'OLPARK-TOGETHER-data-refresh/2.0'})
    with urlopen(req, timeout=20) as response:
        if response.status != 200:
            raise ValueError('API HTTP 응답 상태 ' + str(response.status))
        return response.read(3_000_001)

def find_parking(obj):
    if isinstance(obj, dict):
        if str(obj.get('msgCode', obj.get('resultCode', '0000'))) == '9999':
            raise ValueError('기관 API 점검중(9999)')
        if 'parking_sum' in obj:
            return obj['parking_sum']
        for part in obj.values():
            found = find_parking(part)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for part in obj:
            found = find_parking(part)
            if found is not None:
                return found
    return None

def parse_parking(raw):
    text = raw.decode('utf-8-sig', errors='strict').strip()
    if text.startswith(('{', '[')):
        value = find_parking(json.loads(text))
    elif text.startswith('<'):
        root = ET.fromstring(text)
        value = None
        for tag in root.iter():
            if tag.tag.split('}')[-1].lower() == 'parking_sum':
                value = (tag.text or '').strip()
                break
    else:
        raise ValueError('지원하지 않는 주차 응답 형식')
    if isinstance(value, bool) or not re.fullmatch(r'\d+(?:\.\d+)?', str(value if value is not None else '').strip()):
        raise ValueError('parking_sum 필드 누락/형식 오류')
    return str(value).strip()

def update_parking(data, api_url=None):
    url = api_url or os.environ.get('PARKING_API_URL') or PARKING_PUBLIC_ENDPOINT
    val = parse_parking(download(url))
    data['parking'] = {
        'parking_sum': val,
        'collectedAt': timestamp(),
        'source': '공식 실시간 주차 API(공개목록 64)',
        'sourceUrl': url,
        'fieldMeaning': '기관 설명상 주차대수. 잔여면·점유율·주차장별 수치 의미 불명확',
    }
    return True

def classify_faq(title, answer, category=''):
    corpus = ' '.join([title, answer, category])
    return [tag for tag, words in FAQ_KEYWORDS.items() if any(word in corpus for word in words)] or ['general']

def parse_faq_csv(raw):
    try:
        body = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        body = raw.decode('cp949')
    reader = csv.DictReader(io.StringIO(body))
    needed = {'제목', '내용'}
    if not reader.fieldnames or not needed.issubset({x.strip() for x in reader.fieldnames}):
        raise ValueError('FAQ CSV의 제목·내용 컬럼을 확인할 수 없음')
    records = []
    for i, row in enumerate(reader, 1):
        title, answer = (row.get('제목') or '').strip(), (row.get('내용') or '').strip()
        if not title or not answer or '미사경정' in title or '미사경정' in answer:
            continue
        record_id = str(row.get('일련번호') or row.get('순번') or i).strip()
        category = (row.get('카테고리') or '공식 FAQ').strip()
        records.append({
            'id': 'csv-' + record_id,
            'rowId': record_id,
            'category': category,
            'title': title,
            'answer': answer,
            'registeredAt': (row.get('등록일') or '').strip(),
            'tags': classify_faq(title, answer, category),
            'url': FAQ_DATASET,
        })
    if not records:
        raise ValueError('FAQ CSV의 유효한 올림픽공원 정보가 없음')
    return records

def import_faq_csv(data):
    file = (os.environ.get('FAQ_CSV_FILE') or '').strip()
    if not file or not Path(file).is_file():
        print('[SKIP] FAQ: 원본 CSV 미지정/없음 (기관 웹 확인본 유지)')
        return False
    data['faqs'] = parse_faq_csv(Path(file).read_bytes())
    data['meta']['faqSource'] = '공공데이터포털 원본 CSV 15089962'
    data['meta']['faqUpdatedAt'] = timestamp()
    return True

def parse_event_xml(raw, mapping):
    required = ('item', 'title', 'start', 'end', 'venue')
    if any(not mapping.get(k) for k in required):
        raise ValueError('EVENTS_FIELD_MAP의 item/title/start/end/venue 지정 필요')
    root = ET.fromstring(raw)
    output = []
    for i, item in enumerate(root.findall('.//' + mapping['item'])):
        def get(key):
            return (item.findtext(mapping[key]) or '').strip() if mapping.get(key) else ''
        title, start, end, venue = (get(key) for key in ('title', 'start', 'end', 'venue'))
        if not all((title, start, end, venue)):
            continue
        if not all(re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) for date in (start, end)) or end < start:
            continue
        link = get('url')
        output.append({
            'id': 'api-' + str(i) + '-' + start,
            'title': title,
            'start': start,
            'end': end,
            'venue': venue,
            'url': link if link.startswith('https://') else EVENT_DATASET,
        })
    if not output:
        raise ValueError('유효한 공연 항목 없음: XML 태그 및 날짜 형식 확인')
    return output

def import_event_xml(data):
    url = (os.environ.get('EVENTS_API_URL') or '').strip()
    field_map = (os.environ.get('EVENTS_FIELD_MAP') or '').strip()
    if not url or not field_map:
        print('[SKIP] 공연: 응답 검증 전, EVENTS_API_URL/EVENTS_FIELD_MAP 미지정')
        return False
    parsed = parse_event_xml(download(url), json.loads(field_map))
    data['events'] = parsed
    data['meta']['eventSource'] = '공연정보 오픈API XML 3037877'
    data['meta']['eventUpdatedAt'] = timestamp()
    return True

def main():
    data = read()
    changed = []
    for label, task in [('FAQ', import_faq_csv), ('공연', import_event_xml), ('주차', update_parking)]:
        try:
            if task(data):
                changed.append(label)
                print('[OK]', label)
        except Exception as exc:
            print('[FAIL]', label, type(exc).__name__, str(exc)[:200])
    if changed:
        if any(label in changed for label in ('FAQ', '공연')):
            data['meta']['asOf'] = timestamp()
        data['meta']['mode'] = '확인본 + 실제 공공데이터 갱신: ' + ', '.join(changed)
        data['meta']['lastRefreshAttemptAt'] = timestamp()
        write(data)
        print('[SAVED]', ', '.join(changed))
    else:
        print('[UNCHANGED] API 실패/미구성: 마지막 확인본 유지 (최신 실시간 상태 아님)')

if __name__ == '__main__':
    main()
