from playwright.sync_api import sync_playwright
from pathlib import Path
f=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1300,'height':900},device_scale_factor=1)
 logs=[]
 page.on('pageerror',lambda err:logs.append(str(err)))
 html=(f/'index.html').read_text(encoding='utf-8')
 import re
 html=re.sub(r'<script defer src="[^"]+"></script>','',html)
 page.set_content(html)
 page.add_style_tag(content=(f/'assets'/'style.css').read_text(encoding='utf-8'))
 page.add_script_tag(content=(f/'data'/'snapshot.js').read_text(encoding='utf-8'))
 page.add_script_tag(content=(f/'assets'/'app.js').read_text(encoding='utf-8'))
 page.wait_for_timeout(600)
 print('title',page.title())
 print('first',page.locator('#brief-evidence').inner_text())
 print('faq before',page.locator('#faq-count').inner_text())
 page.locator('#wheelchair').check()
 page.locator('#visit-form button[type=submit]').click()
 assert '휠체어' in page.locator('#result-items').inner_text()
 page.locator('#tab-operator').click()
 print('issues',page.locator('#metric-issues').inner_text())
 print('venues',page.locator('#metric-venues').inner_text())
 print('rule id',page.locator('#issue-list').inner_text()[:120])
 page.screenshot(path=str(f/'v2_operator.png'),full_page=True)
 page.locator('#tab-citizen').click()
 test_csv=('순번,일련번호,카테고리,제목,내용,등록일\n'
     '1,11,이동,KSPO DOME 휠체어 안내,테스트용 가상 응답 - 접근 가능 판정이 아님,2026-08-19\n'
     '2,12,이동,주차장 안내,"대중교통, 버스 이용",2026-08-19\n').encode('utf-8-sig')
 page.locator('#import-faq').set_input_files({'name':'faq_test.csv','mimeType':'text/csv','buffer':test_csv})
 page.wait_for_timeout(400)
 print('faq after',page.locator('#faq-count').inner_text())
 print('status',page.locator('#import-status').inner_text())
 assert '2건' in page.locator('#faq-count').inner_text()
 page.locator('#tab-operator').click()
 print('issues after venue-match fixture',page.locator('#metric-issues').inner_text())
 assert page.locator('#metric-issues').inner_text()=='4건'
 page.locator('#tab-citizen').click()
 page.screenshot(path=str(f/'v2_citizen.png'),full_page=True)
 page.set_viewport_size({'width':390,'height':844})
 page.screenshot(path=str(f/'v2_mobile.png'),full_page=True)
 print('errors',logs)
 assert not logs,logs
 browser.close()
