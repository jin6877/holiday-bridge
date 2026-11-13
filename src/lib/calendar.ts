// 순수 계산 모듈 — 브라우저와 scripts/verify.ts 가 함께 쓴다.

export type HolidayType = 'public' | 'substitute'
/** official = 관공서 공휴일(5인 이상 사업장 유급휴일), all = 사업장 규모와 무관하게 쉬는 날 */
export type HolidayScope = 'official' | 'all'

export interface Holiday {
  date: string
  name: string
  type: HolidayType
  scope: HolidayScope
}

export interface HolidayFile {
  year: number
  updatedAt: string
  source: string
  officialTotal?: { publicHolidays: number; sundays: number; nonSundayHolidays: number }
  holidays: Holiday[]
}

export interface Day {
  index: number
  iso: string
  month: number // 1~12
  date: number
  dow: number // 0=일 ~ 6=토
  weekend: boolean
  holiday: Holiday | null // 이 사업장 기준으로 쉬는 휴일
  rawHoliday: Holiday | null // 달력에 표시할 휴일(사업장 규모 무관)
  off: boolean // 연차 없이 원래 쉬는 날
}

export interface Streak {
  start: number
  end: number
  length: number
  leaveDays: number[] // 연차를 써야 하는 날(index)
  leave: number
  efficiency: number
}

const pad = (n: number) => String(n).padStart(2, '0')

export function isoOf(year: number, month: number, date: number) {
  return `${year}-${pad(month)}-${pad(date)}`
}

export function buildYear(file: HolidayFile, smallBusiness: boolean): Day[] {
  const byDate = new Map(file.holidays.map((h) => [h.date, h]))
  const days: Day[] = []
  const d = new Date(Date.UTC(file.year, 0, 1))
  let i = 0
  while (d.getUTCFullYear() === file.year) {
    const month = d.getUTCMonth() + 1
    const date = d.getUTCDate()
    const iso = isoOf(file.year, month, date)
    const dow = d.getUTCDay()
    const weekend = dow === 0 || dow === 6
    const raw = byDate.get(iso) ?? null
    const holiday = raw && (!smallBusiness || raw.scope === 'all') ? raw : null
    days.push({ index: i, iso, month, date, dow, weekend, holiday, rawHoliday: raw, off: weekend || holiday !== null })
    d.setUTCDate(date + 1)
    i++
  }
  return days
}

/**
 * 연차를 정확히 k개 써서 만드는 '최대' 연속 휴무 구간 전체.
 * 구간 안의 근무일은 전부 연차로 채우고, 구간 바로 바깥 양쪽은 근무일(또는 연도 경계)이다.
 * 이 조건이면 같은 k의 구간끼리는 서로 포함되지 않는다.
 */
export function maximalStreaks(days: Day[], k: number): Streak[] {
  const n = days.length
  const work: number[] = []
  days.forEach((d) => {
    if (!d.off) work.push(d.index)
  })
  const out: Streak[] = []
  // 근무일 work[a..a+k-1] 을 연차로 쓰면, 구간은 이전 근무일 다음날부터 다음 근무일 전날까지 늘어난다.
  for (let a = 0; a + k <= work.length; a++) {
    const start = a === 0 ? 0 : work[a - 1] + 1
    const end = a + k === work.length ? n - 1 : work[a + k] - 1
    const leaveDays = work.slice(a, a + k)
    const length = end - start + 1
    out.push({ start, end, length, leaveDays, leave: k, efficiency: length / k })
  }
  return out
}

export function topStreaks(days: Day[], k: number, limit = 5): Streak[] {
  return maximalStreaks(days, k)
    .sort((x, y) => y.length - x.length || x.start - y.start)
    .slice(0, limit)
}

/** 원래 쉬는 날 + 연차일로 만들어지는 연속 휴무 구간들 */
export function streaksWithLeave(days: Day[], leave: Set<number>, minLength = 3): Streak[] {
  const res: Streak[] = []
  let i = 0
  while (i < days.length) {
    if (days[i].off || leave.has(i)) {
      let j = i
      const used: number[] = []
      while (j < days.length && (days[j].off || leave.has(j))) {
        if (!days[j].off) used.push(j)
        j++
      }
      const length = j - i
      if (length >= minLength) {
        res.push({ start: i, end: j - 1, length, leaveDays: used, leave: used.length, efficiency: used.length ? length / used.length : Infinity })
      }
      i = j
    } else i++
  }
  return res
}

export const MIN_BREAK = 4 // '연휴'로 치는 최소 일수

/**
 * 연간 추천안: 연차 총량 budget 안에서 서로 겹치지 않는 최대 구간들을 골라
 * 연차 대비 덤으로 얻는 휴일(연휴 일수 − 연차)의 합을 최대화하고, 같으면 더 긴 연휴를 고른다. (구간 끝 기준 정렬 + 예산 배낭 DP)
 */
export function planYear(days: Day[], budget: number, maxPerBreak = 9): Streak[] {
  const cands: Streak[] = []
  // 휴일이 낀 연휴만 후보로 삼는다(주말 + 연차만으로 된 구간은 언제든 만들 수 있으므로).
  // 휴일이 하나도 없는 달력(5인 미만 등)이면 주말 연휴도 허용.
  const hasHoliday = days.some((d) => d.holiday)
  const withHoliday = (s: Streak) => {
    for (let i = s.start; i <= s.end; i++) if (days[i].holiday) return true
    return false
  }
  for (let k = 1; k <= Math.min(budget, maxPerBreak); k++) {
    for (const s of maximalStreaks(days, k)) {
      if (s.length >= MIN_BREAK && (!hasHoliday || withHoliday(s))) cands.push(s)
    }
  }
  cands.sort((a, b) => a.end - b.end || a.start - b.start)
  const m = cands.length
  // p[i] = cands[i] 시작 전날보다 먼저 끝나는 마지막 후보(겹침·맞닿음 방지)
  const p: number[] = new Array(m)
  for (let i = 0; i < m; i++) {
    let lo = 0
    let hi = i - 1
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (cands[mid].end < cands[i].start - 1) {
        ans = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    p[i] = ans
  }
  const B = budget
  // dp[i+1][b] = 앞의 i+1개 후보로 연차 b개 이하를 써서 얻는 최대 점수
  // 점수 = (연휴 일수 − 연차) * 1000 + 연휴 일수
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(B + 1).fill(0))
  for (let i = 0; i < m; i++) {
    const c = cands[i]
    const score = (c.length - c.leave) * 1000 + c.length
    for (let b = 0; b <= B; b++) {
      let best = dp[i][b]
      if (c.leave <= b) {
        const v = dp[p[i] + 1][b - c.leave] + score
        if (v > best) best = v
      }
      dp[i + 1][b] = best
    }
  }
  const chosen: Streak[] = []
  let i = m - 1
  let b = B
  while (i >= 0) {
    const c = cands[i]
    if (dp[i + 1][b] !== dp[i][b] && c.leave <= b) {
      chosen.push(c)
      b -= c.leave
      i = p[i]
    } else i--
  }
  return chosen.reverse()
}

export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']

export function labelOf(d: Day) {
  return `${d.month}/${d.date}(${DOW_KO[d.dow]})`
}

export function rangeLabel(days: Day[], s: { start: number; end: number }) {
  return `${labelOf(days[s.start])} ~ ${labelOf(days[s.end])}`
}

/** 구간 안의 휴일 이름(중복 제거) — 조합 설명용 */
export function holidayNamesIn(days: Day[], s: { start: number; end: number }) {
  const names: string[] = []
  for (let i = s.start; i <= s.end; i++) {
    const h = days[i].holiday
    if (!h) continue
    const base = h.name.replace(/ (전날|다음날|대체공휴일)$/, '')
    if (!names.includes(base)) names.push(base)
  }
  return names
}

// ---- 공유 URL 인코딩: ?y=2027&t=15&s=1&d=0104.0910 ----
export interface PlanState {
  year: number
  total: number
  small: boolean
  leave: string[] // MMDD
}

export function encodePlan(p: PlanState) {
  const q = new URLSearchParams()
  q.set('y', String(p.year))
  q.set('t', String(p.total))
  if (p.small) q.set('s', '1')
  if (p.leave.length) q.set('d', [...p.leave].sort().join('.'))
  return q.toString()
}

export function decodePlan(search: string): Partial<PlanState> | null {
  const q = new URLSearchParams(search)
  if (!q.has('y') && !q.has('d')) return null
  const out: Partial<PlanState> = {}
  const y = Number(q.get('y'))
  if (Number.isInteger(y) && y > 2000) out.year = y
  const t = Number(q.get('t'))
  if (Number.isInteger(t) && t >= 0 && t <= 60) out.total = t
  out.small = q.get('s') === '1'
  const d = q.get('d')
  out.leave = d ? d.split('.').filter((x) => /^\d{4}$/.test(x)).slice(0, 60) : []
  return out
}
