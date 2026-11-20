// 체험판 예시 자료. 모든 기관·이름·연락처·내용은 지어낸 값이다.
const DEMO_TEMPLATES = [
  // [내용, 대분류, 중분류, 소분류, 원인대, 원인상세, 조치]
  ['3층 남자화장실 소변기 물이 계속 흐름', '기계', '위생', '대소변기', '보수', '고장', '플러시밸브 부품 교체'],
  ['2층 여자화장실 대변기 막힘', '기계', '위생', '대소변기', '보수', '단순장애', '관통기로 막힘 해소'],
  ['5층 화장실 비데 작동 안 됨', '기계', '위생', '비데', '보수', '고장', '비데 전원부 점검 후 재가동'],
  ['탕비실 수전에서 물이 샘', '기계', '위생', '수전', '보수', '노후', '수전 카트리지 교체'],
  ['사무실 에어컨 바람이 미지근함', '기계', '냉난방', '냉방', '보수', '단순장애', '필터 청소 및 설정온도 조정'],
  ['회의실 난방이 안 들어옴', '기계', '냉난방', '난방', '보수', '고장', '난방 밸브 개방 및 배관 공기 빼기'],
  ['지하 주차장 환기 냄새 심함', '기계', '냉난방', '환기', '지원', '개선요청', '환기팬 가동 시간 조정'],
  ['복도 소화기 압력 게이지가 빨간색', '기계', '기계소방', '소화기', '보수', '노후', '소화기 교체'],
  ['4층 사무실 형광등 깜빡임', '전기', '전등', '점등불량', '보수', '노후', 'LED 등기구 교체'],
  ['계단 조명 스위치 눌러도 안 켜짐', '전기', '전등', '스위치불량', '보수', '고장', '스위치 교체'],
  ['사무실 콘센트 전기가 안 들어옴', '전기', '전열', '사무실기기', '보수', '단순장애', '분전함 차단기 복구'],
  ['비상구 유도등 불이 꺼져 있음', '전기', '전기소방', '유도등', '보수', '고장', '유도등 배터리 교체'],
  ['민원실 전화기 신호음 없음', '통신', '행정통신', '전화', '보수', '단순장애', '전화선 재연결'],
  ['3층 회의실 마이크 소리 안 나옴', '통신', '방송', '공용회의실', '보수', '단순장애', '앰프 입력 설정 복구'],
  ['출입게이트 카드 인식이 안 됨', '통신', '방범', '출입통제', '보수', '고장', '리더기 재설정'],
  ['와이파이 접속이 자주 끊김', '통신', '통신기타', '와이파이', '보수', '단순장애', '무선 공유기 재부팅 및 채널 변경'],
  ['사무실 창문이 안 닫힘', '건축', '창호', '창문', '보수', '고장', '창호 롤러 교체'],
  ['블라인드 줄이 끊어짐', '건축', '창호', '블라인더', '보수', '파손', '블라인드 줄 교체'],
  ['출입문 손잡이 헐거움', '건축', '창호', '창호부속품', '보수', '노후', '손잡이 나사 조임'],
  ['천장에서 물이 떨어짐', '건축', '누수', '누수', '원인미상', '원인미상', '상부 배관 점검 및 천장재 교체'],
  ['복도 바닥 타일 깨짐', '건축', '내장재', '바닥', '보수', '파손', '타일 부분 교체'],
  ['주차장 카스토퍼 파손', '건축', '도로', '주차장', '보수', '파손', '카스토퍼 교체'],
  ['게시판 설치 요청', '건축', '건축기타', '게시판', '지원', '단순작업', '게시판 설치'],
  ['승강기 문 닫힐 때 소음', '승강기', '내부', '소음', '보수', '노후', '유지보수 업체 점검 요청 및 조치'],
  ['승강기 층 버튼 불이 안 들어옴', '승강기', '외부', '외부버튼', '보수', '고장', '버튼 램프 교체'],
];
const DEMO_OTHER = [
  ['주차 등록 방법 문의', '안내 완료'], ['청사 출입증 재발급 문의', '방호실 안내'], ['구내식당 운영 시간 문의', '안내 완료'],
  ['회의실 예약 방법 문의', '예약 시스템 안내'], ['민원인 주차 가능 여부 문의', '방문객 주차장 안내'], ['분실물 습득 신고', '방호실 보관 후 주인 인계'],
  ['청사 내 흡연 민원', '흡연 구역 안내문 부착'], ['택배 보관 문의', '안내 완료'], ['청사 견학 가능 여부 문의', '담당 부서 연결'],
  ['야간 출입 절차 문의', '방호실 안내'], ['우편물 수령 위치 문의', '안내 완료'], ['청사 내 행사 장소 사용 문의', '담당 부서 연결'],
];
const DEMO_ORGS = ['가나청', '다라원', '마바소', '사아국', '자차과', '카타센터'];
const DEMO_NAMES = ['김가상', '이예시', '박체험', '최시험', '정연습', '강보기', '조샘플', '윤임시'];
const DEMO_STAFF = ['이시설', '박기계', '최전기', '정통신'];
const DEMO_CHANNELS = ['전화', '전화', '전화', '하모니', 'IBS', '홈페이지', '카카오톡'];

function demoRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function demoRecords() {
  const rnd = demoRng(20261120);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const today = new Date();
  const out = [];
  const isWork = d => d.getDay() !== 0 && d.getDay() !== 6 && !DEFAULT_HOLIDAYS.includes(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let facNo = 0, othNo = 0;
  const start = new Date(today.getFullYear(), 0, 2);
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    if (!isWork(d)) continue;
    // 업무일 하루에 시설 0~2건, 시설 외 0~1건
    const nFac = rnd() < 0.35 ? (rnd() < 0.2 ? 2 : 1) : 0;
    for (let i = 0; i < nFac; i++) {
      const t = pick(DEMO_TEMPLATES);
      const dt = new Date(d); dt.setHours(8 + Math.floor(rnd() * 9), Math.floor(rnd() * 12) * 5);
      const daysAgo = (today - dt) / 86400000;
      let doneAt = '', status = '완료';
      if (daysAgo < 4 && rnd() < 0.6) status = '처리중';
      else {
        const done = new Date(dt);
        const r = rnd();
        if (r < 0.6) done.setMinutes(done.getMinutes() + 30 + Math.floor(rnd() * 150));
        else { let add = r < 0.88 ? 1 + Math.floor(rnd() * 3) : 4 + Math.floor(rnd() * 4); while (add > 0) { done.setDate(done.getDate() + 1); if (isWork(done)) add--; } done.setHours(9 + Math.floor(rnd() * 8)); }
        if (done > today) { status = '처리중'; } else doneAt = local(done);
      }
      facNo++;
      out.push({ kind: 'facility', no: `민A${pad(facNo, 6)}`, dt: local(dt), org: pick(DEMO_ORGS), name: pick(DEMO_NAMES), phone: `010-0000-${pad(Math.floor(rnd() * 10000), 4)}`,
        channel: pick(DEMO_CHANNELS), receiver: '접수가', staff: '', content: t[0], building: rnd() < 0.8 ? '청사동' : pick(['실험동', '별동']), campus: CLASS.campus,
        fieldL: t[1], fieldM: t[2], fieldS: t[3], causeL: t[4], causeS: t[5], status, doneAt,
        handler1: status === '완료' ? pick(DEMO_STAFF) : '', handler2: '', happy: status === '완료' && rnd() < 0.7 ? String(rnd() < 0.7 ? 5 : rnd() < 0.7 ? 4 : 3) : '',
        action: status === '완료' ? t[6] : '', note: '', issues: [], source: 'demo' });
    }
    if (rnd() < 0.2) {
      const t = pick(DEMO_OTHER);
      const dt = new Date(d); dt.setHours(9 + Math.floor(rnd() * 8), Math.floor(rnd() * 12) * 5);
      othNo++;
      out.push({ kind: 'other', no: String(othNo), dt: local(dt), org: pick(DEMO_ORGS), name: pick(DEMO_NAMES), phone: `010-0000-${pad(Math.floor(rnd() * 10000), 4)}`,
        channel: '', receiver: '', staff: pick(DEMO_STAFF), content: t[0], building: '', campus: '', fieldL: '', fieldM: '', fieldS: '', causeL: '', causeS: '',
        status: '완료', doneAt: '', handler1: '', handler2: '', happy: '', action: t[1], note: '', issues: [], source: 'demo' });
    }
  }
  // 접수 순서대로 번호를 다시 매기고, 최근 3건은 처리중으로 둔다(미처리 기능 체험용).
  const fac = out.filter(r => r.kind === 'facility').sort((a, b) => a.dt.localeCompare(b.dt));
  fac.forEach((r, i) => { r.no = `민A${pad(i + 1, 6)}`; });
  fac.slice(-3).forEach(r => { r.status = '처리중'; r.doneAt = ''; r.handler1 = ''; r.happy = ''; r.action = ''; });
  const oth = out.filter(r => r.kind === 'other').sort((a, b) => a.dt.localeCompare(b.dt));
  oth.forEach((r, i) => { r.no = String(i + 1); });
  return [...fac, ...oth];
}
// 처음 열었을 때 한 번만 예시 자료를 넣는다. 사용자가 전체 삭제한 뒤에는 다시 넣지 않는다.
async function seedDemo() {
  if (meta.demoSeeded || records.length) return;
  await addMany(demoRecords());
  await setMeta('demoSeeded', true);
}
async function resetDemo() {
  if (!confirm(`지금 저장된 ${records.length}건을 지우고 예시 자료로 바꿀까요?`)) return;
  await replaceAll(demoRecords());
  afterChange(); renderData(); toast(`예시 자료 ${records.length}건을 넣었습니다.`);
}
