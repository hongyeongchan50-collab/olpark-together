'use strict';
/* 올팍동행 v2: 원본 FAQ CSV 현장 불러오기 + 데이터 근거형 방문 안내 + 자동 품질 점검.
   개인정보 전송/위치 수집/유료 호출 없음. 모든 외부 데이터는 textContent로 렌더링. */
(() => {
  const SOURCE = window.OLPARK_DATA || {meta:{},events:[],faqs:[],parking:null};
  let DATA = {...SOURCE, meta:{...SOURCE.meta}, events:[...SOURCE.events], faqs:[...SOURCE.faqs], parking:SOURCE.parking};
  const $ = id => document.getElementById(id);
  const str = x => String(x ?? '');
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const LINKS = {
    faq:'https://www.data.go.kr/data/15089962/fileData.do',
    schedule:'https://www.ksponco.or.kr/olympicpark/eventInfo/eventInfoList?mid=a20301010100',
    eventApi:'https://www.data.go.kr/data/3037877/openapi.do',
    transit:'https://www.ksponco.or.kr/olympicpark/menu.es?mid=a20109000000',
    parking:'https://www.ksponco.or.kr/pubData/64?mid=a10106020000',
    parkingApi:'https://www.ksponco.or.kr/online/main/parkingorsApi.do?apiKey=PARKING21803504'
  };
  const TERMS = {
    wheelchair:['휠체어','장애인','경사로','무장애'],
    stroller:['유모차','유아차','수유실','기저귀'],
    transit:['지하철','대중교통','버스','역에서'],
    car:['주차','차량','주차장'],
    event:['공연','콘서트','공연장','관람'],
    park:['공원','산책','장미광장']
  };
  let briefText='';
  let issues=[];
  const el=(tag,clazz,text)=>{const e=document.createElement(tag);if(clazz)e.className=clazz;if(text!==undefined)e.textContent=str(text);return e;};
  const link=(url,label)=>{const a=el('a','',label);a.href=/^https:\/\//.test(str(url))?url:LINKS.faq;a.target='_blank';a.rel='noopener noreferrer';return a;};
  const format=d=>/^\d{4}-\d{2}-\d{2}$/.test(str(d))?d.replace(/-/g,'.'):'날짜 미확인';
  const localDate=iso=>{const date=new Date(iso);return Number.isNaN(date.getTime())?'시각 미확인':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(date);};
  const matches=(f,tag)=>Array.isArray(f.tags)&&f.tags.includes(tag) || (TERMS[tag]||[]).some(word=>[f.title,f.answer,f.category].join(' ').includes(word));
  // 근거 카드는 제목에 해당 주제어가 있는 레코드를 우선 사용한다(본문 단어만 스친 행의 오노출 방지).
  const relevant=(tag,count=3)=>{const list=DATA.faqs.filter(f=>matches(f,tag));const strong=list.filter(f=>(TERMS[tag]||[]).some(w=>str(f.title).includes(w)));return (strong.length?strong:list).slice(0,count);};
  function tab(name){const operator=name==='operator';$('citizen-panel').classList.toggle('hidden',operator);$('operator-panel').classList.toggle('hidden',!operator);['citizen','operator'].forEach(type=>{$('tab-'+type).classList.toggle('selected',name===type);$('tab-'+type).setAttribute('aria-pressed',str(name===type));});}
  function populateEvents(){const selected=$('event-select').value;const list=$('event-select');list.replaceChildren();list.add(new Option('공연을 선택하지 않음',''));
    [...DATA.events].sort((a,b)=>str(a.start).localeCompare(str(b.start))).forEach(e=>list.add(new Option(`${e.end<today?'[지난 일정] ':''}${e.title} | ${format(e.start)}~${format(e.end)}`,e.id)));
    if([...list.options].some(o=>o.value===selected))list.value=selected;
  }
  function showFaqs(){const query=$('faq-search').value.trim().toLowerCase();const rows=DATA.faqs.filter(f=>[f.title,f.answer,f.category].join(' ').toLowerCase().includes(query));const target=$('faq-list');target.replaceChildren();$('faq-count').textContent=`${rows.length}건 / 확인본 ${DATA.faqs.length}건`;
    if(!rows.length)target.append(el('p','empty','검색 결과 없음 · 기관 FAQ 원문을 확인해 주세요.'));
    rows.forEach(f=>{const card=el('article','fact');card.append(el('span','category',f.category||'공식 FAQ'));card.append(el('h3','',f.title));card.append(el('p','',f.answer));const source=el('div','evidence','근거 레코드: '+f.id+(f.registeredAt?' · 등록일 '+f.registeredAt:''));card.append(source,link(f.url,'원문 데이터 확인 ↗'));target.append(card);});
  }
  const item=(title,body,url,confirmed=true,record='')=>({title,body,url,confirmed,record});
  function addEvidence(items,tag,title){const rows=relevant(tag,2);if(rows.length){for(const f of rows)items.push(item(title||f.title,`${f.title}: ${f.answer}`,f.url,true,'FAQ '+f.id));}
    else items.push(item((title||'관련 공식 안내')+' 미확인',`공개된 확인본에서 ${tag==='wheelchair'?'휠체어·경사로':tag==='stroller'?'유아차':tag==='car'?'주차':'관련'} 안내를 검색했으나 찾지 못했습니다. 기관 원문을 확인하세요.`,LINKS.faq,false,'FAQ 검색 규칙'));}
  function visitPlan(){const purpose=$('purpose').value;const date=$('visit-date').value||today;const event=DATA.events.find(e=>e.id===$('event-select').value);const wc=$('wheelchair').checked,stroller=$('stroller').checked,car=$('car').checked,metro=$('transit').checked;const items=[];let title=format(date)+' · '+(purpose==='park'?'공원 방문':purpose==='sports'?'체육시설 방문':'공연 관람');
    if(purpose==='event'){
      if(event){title+=` · ${event.title} (${event.venue})`;items.push(item('공연 기간·장소',`${format(event.start)}~${format(event.end)} · ${event.venue}. 시작 시각 및 변경 정보는 원문 확인.`,event.url,true,'공연 '+event.id));if(date<event.start||date>event.end)items.push(item('방문일 불일치','선택한 날짜가 공연 공식 안내 기간 밖입니다. 공연일을 다시 확인하세요.',event.url,false,'공연 '+event.id));}
      else items.push(item('공연 선택 필요','공연을 선택하면 날짜·장소를 비교합니다. 신규 일정은 공식 공연 페이지에서 확인하세요.',LINKS.schedule,false,'공연 목록'));
    }
    if(wc){addEvidence(items,'wheelchair','휠체어 관련 공식 FAQ');items.push(item('행사장 내부 연속 동선 검증 필요',`${event?event.venue+' ':'해당 시설 '}정문→출입구→객석의 단차·승강기·휠체어석 연결은 확인본만으로 판정할 수 없습니다.`,event?.url||LINKS.schedule,false,'공연/FAQ 연결 규칙'));}
    if(stroller){addEvidence(items,'stroller','유아차 관련 공식 FAQ');items.push(item('유아차 이동 시설 별도 확인','유아차 보관소·수유실·기저귀 교환대·전 구간 연결 정보는 현장 검증 자료가 필요합니다.',LINKS.faq,false,'편의시설 공백'));}
    if(metro)items.push(item('공식 대중교통 안내','공식 오시는 길에서 교통편·지하철 출구를 확인하세요. 엘리베이터 운행 여부는 별도 검증이 필요합니다.',LINKS.transit,true,'기관 오시는 길'));
    if(car){addEvidence(items,'car','주차 관련 공식 FAQ');
      if(DATA.parking?.parking_sum!=null){const min=(Date.now()-new Date(DATA.parking.collectedAt).getTime())/60000;const recent=Number.isFinite(min)&&min>=0&&min<=90;
        items.push(item('주차 공개 API 원문',`parking_sum: ${DATA.parking.parking_sum} (공식 설명상 주차대수) · 수집 ${localDate(DATA.parking.collectedAt)}. ${recent?'90분 이내 수집':'수집 시점이 오래되었거나 확인 불가'}. 남은 면수·혼잡률이 아닙니다.`,DATA.parking.sourceUrl||LINKS.parking, recent,'주차 API parking_sum'));}
      else items.push(item('주차 API 수집 기록 없음','공식 API는 공개되어 있으나 배포된 스냅샷에 성공한 수집 기록이 없습니다. 잔여 주차면을 계산하지 않습니다.',LINKS.parkingApi,false,'주차 API'));
    }
    if(purpose==='park')addEvidence(items,'park','공원 이용 FAQ');
    if(purpose==='sports')items.push(item('체육시설 이용 전 확인','현재 체육시설 등록/수업/예약 가능 여부 데이터는 연결되지 않았습니다. 공식 안내를 확인하세요.','https://www.ksponco.or.kr/',false,'미연동'));
    items.push(item('당일 운영 변경 확인','공연 일정 변경, 시설 통제, 실제 이동 편의시설 운용은 방문 직전에 공식 페이지에서 확인하세요.',LINKS.schedule,false,'운영상 확인'));
    return {title,items};
  }
  function showPlan(){const b=visitPlan();$('result-intro').textContent=b.title;const box=$('result-items');box.replaceChildren();const known=b.items.filter(x=>x.confirmed).length;$('brief-evidence').textContent=`근거 표시 ${known}건 / 전체 안내 ${b.items.length}건 · 미확인 사항을 포함합니다`;
    b.items.forEach((x,i)=>{const card=el('article','result-card'+(x.confirmed?'':' needs-check'));card.append(el('span','mini-tag',x.confirmed?'근거 확인':'추가 확인 필요'));card.append(el('h4','',`${i+1}. ${x.title}`));card.append(el('p','',x.body));if(x.record)card.append(el('div','evidence','근거: '+x.record));card.append(link(x.url,'관련 공식 출처 ↗'));box.append(card);});
    briefText=['[올팍동행 방문 안내서]',b.title,`확인 근거 ${known}/${b.items.length} (접근성 안전 판정 아님)`,'',...b.items.map((x,i)=>`${i+1}. [${x.confirmed?'근거 확인':'추가 확인 필요'}] ${x.title}\n${x.body}\n근거 ID: ${x.record||'없음'}\n출처: ${x.url}`),'',`스냅샷 확인시각: ${localDate(DATA.meta.asOf)}`,'시설 접근성·안전·예약 가능 여부를 보증하지 않습니다.'].join('\n\n');
  }
  function venueMatches(){const all=[...new Set(DATA.events.map(e=>str(e.venue).trim()).filter(Boolean))];return all.map(venue=>{const faqs=DATA.faqs.filter(f=>[f.title,f.answer].join(' ').includes(venue)&&matches(f,'wheelchair'));
    return {venue, eventCount:DATA.events.filter(e=>e.venue===venue).length, faqIds:faqs.map(f=>f.id), evidenceCount:faqs.length};});}
  function makeIssue(rule,severity,title,detail,sourceId,owner='운영자 확인') {return {rule,severity,title,detail,sourceId,owner};}
  function audit(){const rows=[];const venues=venueMatches();for(const v of venues){if(!v.evidenceCount)rows.push(makeIssue('ACCESS_VENUE_GAP','현장 확인',`${v.venue} 연속 이동 정보 근거 없음`,`${v.eventCount}건의 공연에 연결되는 행사장입니다. 확인본 FAQ에서 행사장 이름과 휠체어·경사로 키워드가 함께 포함된 항목을 찾지 못했습니다. 접근 불가능을 의미하지 않습니다.`,`공연정보: venue=${v.venue}; FAQ 15089962`,'공연장·시설 운영부서'));}
    const ids=new Set();for(const f of DATA.faqs){if(!f.title||!f.answer)rows.push(makeIssue('FAQ_REQUIRED_FIELD','수집 검토','FAQ 필수 항목 누락',`레코드 ${f.id}: 제목/답변 확인 필요`,`FAQ ${f.id}`));if(ids.has(f.id))rows.push(makeIssue('FAQ_DUPLICATE','수집 검토','FAQ ID 중복',`중복 식별자 ${f.id}`,`FAQ ${f.id}`));ids.add(f.id);}
    for(const e of DATA.events){if(!e.title||!e.venue||!/^(\d{4}-\d{2}-\d{2})$/.test(e.start)||e.end<e.start)rows.push(makeIssue('EVENT_INVALID','수집 검토','공연 필수항목/날짜 비정상',`공연 ${e.id}: 행사명·장소·날짜 데이터 검토`,`공연 ${e.id}`));}
    if(!DATA.meta.faqUpdatedAt)rows.push(makeIssue('FAQ_SOURCE_PENDING','원문 대조','FAQ 원본 CSV 수집 이력 없음','기관 웹 확인본은 있으나 포털 15089962 원본 CSV 적용 성공 시각이 확인되지 않습니다.','FAQ 15089962','데이터 담당자'));
    if(!DATA.meta.eventUpdatedAt)rows.push(makeIssue('EVENT_API_PENDING','원문 대조','공연 API 자동 수집 이력 없음','공식 페이지 확인본은 있으나 3037877 XML 연동 성공 시각이 확인되지 않습니다.','공연 3037877','데이터 담당자'));
    if(!DATA.parking)rows.push(makeIssue('PARKING_NO_SNAPSHOT','수집 검토','주차 API 성공 스냅샷 없음','공식 API 엔드포인트는 확인됨. Actions 실행 후 스냅샷 기록 확인이 필요합니다.','주차 공개목록 64','데이터 담당자'));
    else {const mins=(Date.now()-new Date(DATA.parking.collectedAt).getTime())/60000;if(!Number.isFinite(mins)||mins>90||mins<0)rows.push(makeIssue('PARKING_STALE','수집 검토','주차 수집값 갱신 지연',`최근 수집 ${localDate(DATA.parking.collectedAt)}; 90분 기준 초과 혹은 시각 오류`,'주차 API parking_sum','데이터 담당자'));}
    if(!DATA.meta.asOf||Date.now()-new Date(DATA.meta.asOf).getTime()>30*86400000)rows.push(makeIssue('SNAPSHOT_STALE','정기 점검','공연/FAQ 확인본 30일 이상 경과','스냅샷 확인 시각을 확인하고 내용 변경 여부를 대조합니다.','공연/FAQ 확인본','데이터 담당자'));
    return {rows,venues};
  }
  function operator(){const checked=audit();issues=checked.rows;$('metric-events').textContent=DATA.events.length+'건';$('metric-faqs').textContent=DATA.faqs.length+'건';$('metric-issues').textContent=issues.length+'건';$('metric-venues').textContent=checked.venues.length+'곳';
    $('data-health').replaceChildren();const rows=[['FAQ 근거 상태',`${DATA.faqs.length}건 · ${DATA.meta.faqSource||'확인 필요'} · 원본 반영 ${DATA.meta.faqUpdatedAt?localDate(DATA.meta.faqUpdatedAt):'미완료'}`],['공연 근거 상태',`${DATA.events.length}건 · ${DATA.meta.eventSource||'확인 필요'} · API 반영 ${DATA.meta.eventUpdatedAt?localDate(DATA.meta.eventUpdatedAt):'미완료'}`],['주차 실제 수집',DATA.parking?`parking_sum: ${DATA.parking.parking_sum} · ${localDate(DATA.parking.collectedAt)} · 잔여면수로 해석 불가`:'공식 API 공개 확인 · 배포 스냅샷 실제 수집 미완료'],['공연·FAQ 확인본',localDate(DATA.meta.asOf)]];
    for(const [heading,description] of rows){const line=el('div','data-line');line.append(el('strong','',heading),el('p','',description));$('data-health').append(line);}
    const target=$('issue-list');target.replaceChildren();for(const x of issues){const card=el('article','issue');card.append(el('span','severity',x.severity),el('b','',x.title),el('p','',x.detail),el('div','evidence',`${x.rule} · ${x.sourceId} · 제안 담당: ${x.owner}`));target.append(card);}if(!issues.length)target.append(el('p','empty','현재 규칙에 의해 발견된 확인 과제가 없습니다. 현장 안전 검증 완료를 의미하지 않습니다.'));
    const venues=$('venue-audit');venues.replaceChildren();for(const v of checked.venues){const line=el('div','data-line');line.append(el('strong','',v.venue),el('p','',`공연 ${v.eventCount}건 · 행사장명+접근성 키워드가 함께 등장하는 FAQ ${v.evidenceCount}건 · ${v.evidenceCount?'내용 사실 확인 필요':'추가 구조화 정보 필요'}`));venues.append(line);}
  }
  function parseCsv(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(x=>x.trim()))rows.push(row);row=[];}else field+=c;}
    if(quoted)throw Error('따옴표로 닫히지 않은 CSV 데이터');row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;}
  function faqFromRows(rows){if(rows.length<2)throw Error('CSV 데이터 행이 없습니다');const headers=rows[0].map(x=>x.replace(/^\uFEFF/,'').trim());if(!['제목','내용'].every(x=>headers.includes(x)))throw Error('제목·내용 컬럼이 필요한 FAQ CSV가 아닙니다');const value=(row,field)=>str(row[headers.indexOf(field)]).trim();const records=[];
    rows.slice(1).forEach((row,i)=>{const title=value(row,'제목'),answer=value(row,'내용');if(!title||!answer||[title,answer].some(x=>x.includes('미사경정')))return;const cat=value(row,'카테고리')||'공식 FAQ';const words=[title,answer,cat].join(' ');const tags=Object.keys(TERMS).filter(tag=>TERMS[tag].some(word=>words.includes(word)));
      const id=value(row,'일련번호')||value(row,'순번')||str(i+1);records.push({id:'csv-'+id,category:cat,title,answer,registeredAt:value(row,'등록일'),tags:tags.length?tags:['general'],url:LINKS.faq});});if(!records.length)throw Error('표시할 올림픽공원 FAQ가 없습니다');return records;}
  async function importFaq(file){if(!file)return;try{const bytes=await file.arrayBuffer();let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(_){text=new TextDecoder('euc-kr',{fatal:true}).decode(bytes);}let imported;
    imported=faqFromRows(parseCsv(text));
    DATA.faqs=imported;DATA.meta.faqSource='브라우저에서 읽은 공공데이터포털 FAQ CSV';DATA.meta.faqUpdatedAt=new Date().toISOString();$('import-status').textContent=`원본 CSV ${imported.length}건 불러옴 · 이 브라우저에서만 적용 (서버 저장 없음)`;showFaqs();showPlan();operator();
  }catch(error){if(error instanceof TypeError){$('import-status').textContent='CSV 인코딩을 확인해 주세요. (UTF-8 지원)';}else $('import-status').textContent='불러오기 실패: '+error.message;}}
  function save(filename,type,contents){const obj=new Blob(['\ufeff'+contents],{type});const url=URL.createObjectURL(obj);const a=el('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);}
  const csv=x=>'"'+str(x).replace(/"/g,'""')+'"';
  function copy(text){if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(()=>alert('복사했습니다.')).catch(()=>prompt('내용을 복사하세요.',text));}else prompt('내용을 복사하세요.',text);}
  function setup(){if(!$('visit-form'))return;$('data-status').textContent=DATA.meta.mode||'데이터 상태 미확인';$('data-time').textContent='공식 확인본: '+localDate(DATA.meta.asOf);$('visit-date').value=today;populateEvents();showFaqs();showPlan();operator();
    ['citizen','operator'].forEach(t=>$('tab-'+t).addEventListener('click',()=>tab(t)));
    $('purpose').addEventListener('change',()=>{$('event-row').classList.toggle('hidden',$('purpose').value!=='event');showPlan();});
    $('visit-form').addEventListener('submit',e=>{e.preventDefault();showPlan();$('results').scrollIntoView({behavior:'smooth',block:'center'});});
    $('faq-search').addEventListener('input',showFaqs);
    $('import-faq').addEventListener('change',e=>{const file=e.target.files?.[0];importFaq(file);});
    $('download-brief').addEventListener('click',()=>save('올팍동행_근거형_방문안내서.txt','text/plain;charset=utf-8',briefText));
    $('copy-brief').addEventListener('click',()=>copy(briefText));
    $('download-issues').addEventListener('click',()=>{const head=['규칙ID','우선순위','검토항목','발견 근거','근거 레코드','담당 제안','생성일'];const rows=issues.map(x=>[x.rule,x.severity,x.title,x.detail,x.sourceId,x.owner,today]);save('올팍동행_근거형_품질점검.csv','text/csv;charset=utf-8',[head,...rows].map(r=>r.map(csv).join(',')).join('\r\n'));});
    $('copy-notice').addEventListener('click',()=>copy('올림픽공원 이용 전 행사장·출입구·이동편의 정보를 공식 출처에서 확인하세요. 올팍동행은 확인된 FAQ와 확인되지 않은 이동 구간을 구분합니다.'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
