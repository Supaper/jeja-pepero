// 멤버 명단 공용 로더. 출처는 RTDB /members (관리자가 웹에서 관리).
// /members 가 비어 있으면 DEFAULT_MEMBERS 로 폴백(기존 동작 유지).
//
// /members/<이름>: { name, qt(큐티 집계 대상), active(수집 대상) }

export const DEFAULT_MEMBERS = [
  { name: "강성건", qt: true },
  { name: "서승민", qt: true },
  { name: "양지혜", qt: true },
  { name: "유정인", qt: true },
  { name: "이재황", qt: true },
  { name: "이소현", qt: true },
  { name: "임채환", qt: true },
  { name: "최연희", qt: true },
  { name: "최지인", qt: true },
  { name: "한상필", qt: true },
  { name: "한수종", qt: true },
  { name: "홍종성", qt: true },
  { name: "황미진", qt: true },
  { name: "백지연", qt: false },
];

/** RTDB /members 를 읽어 [{name, qt, active}] 반환. 없으면 기본값. */
export async function loadMembers(db) {
  const snap = await db.ref("members").get();
  if (snap.exists()) {
    const val = snap.val();
    const list = Object.entries(val)
      .map(([key, m]) => ({
        name: (m && m.name) || key,
        qt: !(m && m.qt === false),
        active: !(m && m.active === false),
      }))
      .filter((m) => m.name);
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    if (list.length) return list;
  }
  return DEFAULT_MEMBERS.map((m) => ({ name: m.name, qt: m.qt, active: true }));
}
