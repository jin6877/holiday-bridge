import { useEffect, useMemo, useState } from 'react'
import {
  buildYear,
  decodePlan,
  encodePlan,
  holidayNamesIn,
  labelOf,
  planYear,
  rangeLabel,
  streaksWithLeave,
  topStreaks,
  DOW_KO,
  type Day,
  type HolidayFile,
  type Streak,
} from './lib/calendar'

const STORE_KEY = 'holiday-bridge:v1'
const mmdd = (d: Day) => d.iso.slice(5, 7) + d.iso.slice(8, 10)

interface Saved {
  year: number
  total: number
  small: boolean
  leave: Record<number, string[]> // 연도별 MMDD
}

function loadSaved(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Saved>
  } catch {
    return {}
  }
}

export default function App() {
  const [years, setYears] = useState<number[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [file, setFile] = useState<HolidayFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [small, setSmall] = useState(false)
  const [total, setTotal] = useState(15)
  const [leaveByYear, setLeaveByYear] = useState<Record<number, string[]>>({})
  const [k, setK] = useState(3)
  const [pick, setPick] = useState(0)
  const [copied, setCopied] = useState(false)
  const [ready, setReady] = useState(false)

  // 초기 상태: 공유 URL > localStorage > 기본값
  useEffect(() => {
    fetch('/holidays/index.json')
      .then((r) => r.json() as Promise<{ years: number[]; default: number }>)
      .then((idx) => {
        setYears(idx.years)
        const saved = loadSaved()
        const shared = decodePlan(window.location.search)
        let y = shared?.year ?? saved.year ?? idx.default
        if (!idx.years.includes(y)) y = idx.default
        setYear(y)
        setTotal(shared?.total ?? saved.total ?? 15)
        setSmall(shared ? !!shared.small : !!saved.small)
        const leave = { ...(saved.leave ?? {}) }
        if (shared?.leave) leave[y] = shared.leave
        setLeaveByYear(leave)
        setReady(true)
      })
      .catch(() => setError('휴일 데이터를 불러오지 못했습니다. 새로고침해 주세요.'))
  }, [])

  useEffect(() => {
    if (year === null) return
    setFile(null)
    fetch(`/holidays/${year}.json`)
      .then((r) => r.json() as Promise<HolidayFile>)
      .then(setFile)
      .catch(() => setError(`${year}년 휴일 데이터를 불러오지 못했습니다.`))
  }, [year])

  useEffect(() => {
    if (!ready || year === null) return
    const s: Saved = { year, total, small, leave: leaveByYear }
    localStorage.setItem(STORE_KEY, JSON.stringify(s))
  }, [ready, year, total, small, leaveByYear])

  const days = useMemo(() => (file ? buildYear(file, small) : []), [file, small])

  const leave = useMemo(() => {
    const set = new Set<number>()
    if (!days.length || year === null) return set
    const want = new Set(leaveByYear[year] ?? [])
    for (const d of days) if (!d.off && want.has(mmdd(d))) set.add(d.index)
    return set
  }, [days, leaveByYear, year])

  const setLeave = (next: Set<number>) => {
    if (year === null) return
    setLeaveByYear((prev) => ({ ...prev, [year]: [...next].sort((a, b) => a - b).map((i) => mmdd(days[i])) }))
  }

  const ranking = useMemo(() => (days.length ? topStreaks(days, k, 5) : []), [days, k])
  const best = ranking[Math.min(pick, ranking.length - 1)]
  const plan = useMemo(() => (days.length ? planYear(days, total) : []), [days, total])
  const recommended = useMemo(() => new Set(plan.flatMap((s) => s.leaveDays)), [plan])
  const breaks = useMemo(() => (days.length ? streaksWithLeave(days, leave, 3).filter((s) => s.leave > 0) : []), [days, leave])

  const used = leave.size
  const remaining = total - used
  const offTotal = days.filter((d) => d.off).length + used
  const longest = breaks.reduce((a, s) => Math.max(a, s.length), 0)

  const addStreak = (s: Streak) => {
    const next = new Set(leave)
    s.leaveDays.forEach((i) => next.add(i))
    setLeave(next)
  }
  const removeStreak = (s: Streak) => {
    const next = new Set(leave)
    s.leaveDays.forEach((i) => next.delete(i))
    setLeave(next)
  }
  const toggleDay = (d: Day) => {
    if (d.off) return
    const next = new Set(leave)
    if (next.has(d.index)) next.delete(d.index)
    else next.add(d.index)
    setLeave(next)
  }

  const share = async () => {
    if (year === null) return
    const url = `${window.location.origin}${window.location.pathname}?${encodePlan({ year, total, small, leave: leaveByYear[year] ?? [] })}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('아래 링크를 복사하세요', url)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2200)
  }

  if (error) return <p className="p-10 text-center text-lg">{error}</p>
  if (!file || !days.length || !best) return <p className="p-10 text-center text-ink-soft">달력을 펼치는 중…</p>

  const allIn = best.leaveDays.every((i) => leave.has(i))

  return (
    <div className="min-h-screen pb-28">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 pt-6 sm:px-8">
        <h1 className="mr-auto font-display text-xl tracking-tight">
          holiday-bridge
          <span className="ml-2 align-middle font-body text-sm font-normal text-ink-soft">연차 꿀조합 플래너</span>
        </h1>
        <label className="flex items-center gap-2 text-sm">
          연도
          <select
            className="num rounded-[3px] border border-rule bg-paper px-2 py-1 text-base"
            value={year ?? ''}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-sat" checked={small} onChange={(e) => setSmall(e.target.checked)} />
          5인 미만 사업장
        </label>
      </header>

      {small && (
        <p className="mx-auto mt-3 max-w-6xl px-5 text-sm text-ink-soft sm:px-8">
          5인 미만 사업장은 관공서 공휴일이 유급휴일로 의무화되어 있지 않아 주말과 노동절(근로자의 날 유급휴일)만 쉰다고 보고 계산합니다. 실제 휴무는 회사 규정에 따라 다릅니다.
        </p>
      )}

      {/* 히어로: 탁상달력 한 장 */}
      <main className="mx-auto mt-6 max-w-6xl px-5 sm:px-8">
        <section aria-labelledby="hero-title" className="relative bg-paper shadow-[0_18px_0_-10px_var(--color-sky-deep)]">
          <div className="rings h-4 bg-ink" aria-hidden />
          <div className="px-5 pb-8 pt-7 sm:px-10">
            <h2 id="hero-title" className="flex flex-wrap items-center gap-x-4 gap-y-2 font-display text-4xl leading-none sm:text-6xl">
              <span>연차</span>
              <span className="inline-flex items-center border-2 border-ink">
                <button
                  type="button"
                  aria-label="연차 하나 줄이기"
                  className="px-3 py-1 text-3xl text-ink-soft hover:text-ink disabled:opacity-30 sm:text-4xl"
                  disabled={k <= 1}
                  onClick={() => {
                    setK(k - 1)
                    setPick(0)
                  }}
                >
                  −
                </button>
                <span className="num min-w-[1.2ch] text-center text-5xl font-bold sm:text-7xl" aria-live="polite">
                  {k}
                </span>
                <button
                  type="button"
                  aria-label="연차 하나 늘리기"
                  className="px-3 py-1 text-3xl text-ink-soft hover:text-ink disabled:opacity-30 sm:text-4xl"
                  disabled={k >= 5}
                  onClick={() => {
                    setK(k + 1)
                    setPick(0)
                  }}
                >
                  +
                </button>
              </span>
              <span>개로</span>
              <span className="text-hol">
                <span className="num font-bold">{best.length}</span>일 쉰다
              </span>
            </h2>
            <p className="mt-4 text-ink-soft">
              {labelOf(days[best.start])}부터 {labelOf(days[best.end])}까지. {holidayNamesIn(days, best).join(', ') || '주말'}에 연차 {k}개를 이어 붙이면 연차 하나가 {best.efficiency.toFixed(1)}일이 됩니다.
            </p>

            <DateStrip days={days} streak={best} key={`${k}-${best.start}-${small}`} />

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => (allIn ? removeStreak(best) : addStreak(best))}
                className={`px-5 py-3 text-base font-bold ${allIn ? 'border-2 border-ink bg-paper' : 'bg-ink text-paper hover:bg-[#2c3a5c]'}`}
              >
                {allIn ? '내 플랜에서 빼기' : '이 조합 내 플랜에 담기'}
              </button>
              <span className="text-sm text-ink-soft">담으면 아래 달력에 노란 테이프로 붙습니다.</span>
            </div>

            <h3 className="mt-10 text-sm text-ink-soft">연차 {k}개로 만드는 다른 조합</h3>
            <ol className="mt-2 divide-y divide-rule border-y border-rule">
              {ranking.map((s, i) => (
                <li key={s.start}>
                  <button
                    type="button"
                    onClick={() => setPick(i)}
                    aria-pressed={s === best}
                    className={`grid w-full grid-cols-[4.2rem_1fr_auto] items-baseline gap-3 py-3 text-left sm:grid-cols-[4.8rem_14rem_1fr_auto] ${s === best ? 'bg-tape-pale' : 'hover:bg-sky/50'}`}
                  >
                    <span className="num whitespace-nowrap pl-3 text-2xl font-bold">{s.length}일</span>
                    <span>{rangeLabel(days, s)}</span>
                    <span className="hidden text-sm text-ink-soft sm:block">
                      연차 {s.leaveDays.map((d) => labelOf(days[d])).join(', ')}
                    </span>
                    <span className="num pr-3 text-sm text-ink-soft">×{s.efficiency.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Planner
          days={days}
          total={total}
          setTotal={setTotal}
          plan={plan}
          breaks={breaks}
          remaining={remaining}
          leave={leave}
          onApplyPlan={() => setLeave(new Set(plan.flatMap((s) => s.leaveDays)))}
          onClear={() => setLeave(new Set())}
          onAdd={addStreak}
          onRemove={removeStreak}
        />

        <YearGrid days={days} leave={leave} recommended={recommended} breaks={breaks} onToggle={toggleDay} year={file.year} />

        <footer className="mt-14 space-y-2 text-sm text-ink-soft">
          <p>
            출처: {file.source}. 데이터 갱신일 {file.updatedAt}. 임시공휴일은 발표되면 반영합니다.
          </p>
          <p>5인 이상 사업장은 관공서 공휴일과 대체공휴일이 유급휴일입니다(근로기준법). 연차는 근무일(월~금, 휴일 제외)에만 쓰는 것으로 계산합니다.</p>
        </footer>
      </main>

      {/* 하단 고정: 남은 연차 */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-ink bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3 sm:px-8">
          <p className="flex items-baseline gap-2">
            <span className="text-sm text-ink-soft">남은 연차</span>
            <span className={`num text-2xl font-bold ${remaining < 0 ? 'text-hol' : ''}`}>{remaining}</span>
            <span className="num text-sm text-ink-soft">/ {total}</span>
          </p>
          <p className="flex items-baseline gap-2">
            <span className="text-sm text-ink-soft">올해 쉬는 날</span>
            <span className="num text-xl font-bold">{offTotal}</span>
            <span className="text-sm text-ink-soft">일</span>
          </p>
          <p className="hidden items-baseline gap-2 sm:flex">
            <span className="text-sm text-ink-soft">최장 연휴</span>
            <span className="num text-xl font-bold">{longest}</span>
            <span className="text-sm text-ink-soft">일</span>
          </p>
          <button type="button" onClick={share} className="ml-auto bg-tape px-4 py-2 font-bold text-ink hover:bg-[#ffc60a]">
            {copied ? '링크를 복사했어요' : '플랜 링크 복사'}
          </button>
        </div>
        {remaining < 0 && <p className="mx-auto max-w-6xl px-5 pb-2 text-sm text-hol sm:px-8">보유 연차보다 {-remaining}개 더 담았습니다. 조합을 빼거나 연차 총량을 늘려 주세요.</p>}
      </div>
    </div>
  )
}

function dayColor(d: Day) {
  if (d.holiday || d.dow === 0) return 'text-hol'
  if (d.dow === 6) return 'text-sat'
  return 'text-ink'
}

function DateStrip({ days, streak }: { days: Day[]; streak: Streak }) {
  const from = Math.max(0, streak.start - 1)
  const to = Math.min(days.length - 1, streak.end + 1)
  const cells = days.slice(from, to + 1)
  const leaveSet = new Set(streak.leaveDays)
  const firstIn = streak.start - from
  const n = cells.length
  return (
    <div className="mt-7 overflow-x-auto pb-2">
      <div className="relative w-max" role="list" aria-label="연휴 날짜">
        {/* 연휴 구간 위로 붙인 테이프 */}
        <div
          aria-hidden
          className="tape tape-press absolute top-[38%] h-[30%]"
          style={{ left: `${(firstIn / n) * 100}%`, width: `${(streak.length / n) * 100}%` }}
        />
        <div className="relative flex">
          {cells.map((d) => {
            const inside = d.index >= streak.start && d.index <= streak.end
            const isLeave = leaveSet.has(d.index)
            return (
              <div
                role="listitem"
                key={d.iso}
                className={`flex w-14 flex-col items-center border-l border-rule py-2 first:border-l-0 sm:w-16 ${inside ? '' : 'opacity-35'}`}
                aria-label={`${labelOf(d)} ${isLeave ? '연차' : d.holiday ? d.holiday.name : d.weekend ? '주말' : '근무일'}`}
              >
                <span className={`text-xs ${dayColor(d)}`}>{d.date === 1 || d.index === from ? `${d.month}월` : ' '}</span>
                <span className={`num text-3xl font-bold leading-tight sm:text-4xl ${dayColor(d)}`}>{d.date}</span>
                <span className={`text-sm ${dayColor(d)}`}>{DOW_KO[d.dow]}</span>
                <span className="mt-1 h-4 max-w-full truncate px-0.5 text-[11px] text-ink-soft">
                  {isLeave ? <b className="text-ink">연차</b> : d.holiday ? d.holiday.name.replace(' 대체공휴일', ' 대체') : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Planner(props: {
  days: Day[]
  total: number
  setTotal: (n: number) => void
  plan: Streak[]
  breaks: Streak[]
  remaining: number
  leave: Set<number>
  onApplyPlan: () => void
  onClear: () => void
  onAdd: (s: Streak) => void
  onRemove: (s: Streak) => void
}) {
  const { days, total, setTotal, plan, breaks, leave } = props
  const planUsed = plan.reduce((a, s) => a + s.leave, 0)
  const planDays = plan.reduce((a, s) => a + s.length, 0)
  return (
    <section aria-labelledby="planner-title" className="mt-16 grid gap-10 lg:grid-cols-2">
      <div>
        <h2 id="planner-title" className="font-display text-3xl">
          1년 연차 배분
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="total" className="text-ink-soft">
            올해 내 연차
          </label>
          <input
            id="total"
            type="number"
            min={0}
            max={60}
            value={total}
            onChange={(e) => setTotal(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
            className="num w-20 border-2 border-ink bg-paper px-2 py-1 text-xl font-bold"
          />
          <span className="text-ink-soft">개</span>
        </div>
        <p className="mt-4 leading-relaxed">
          휴일이 낀 연휴만 골라 연차 <b className="num">{planUsed}</b>개로 <b className="num">{plan.length}</b>번, 모두 <b className="num">{planDays}</b>일을 쉬는 추천안입니다.
          {total - planUsed > 0 && ` 남는 연차 ${total - planUsed}개는 원하는 날에 쓰세요.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={props.onApplyPlan} className="bg-ink px-4 py-2 font-bold text-paper hover:bg-[#2c3a5c]">
            추천안으로 채우기
          </button>
          <button type="button" onClick={props.onClear} className="border-2 border-ink px-4 py-2 font-bold" disabled={!leave.size}>
            모두 비우기
          </button>
        </div>
        <ul className="mt-6 border-t border-rule">
          {plan.map((s) => {
            const inPlan = s.leaveDays.every((i) => leave.has(i))
            return (
              <li key={s.start} className="flex items-center gap-3 border-b border-rule py-2.5">
                <span className="num w-14 whitespace-nowrap text-xl font-bold">{s.length}일</span>
                <span className="flex-1">
                  {rangeLabel(days, s)}
                  <span className="ml-2 text-sm text-ink-soft">{holidayNamesIn(days, s).join(', ')}</span>
                </span>
                <span className="num text-sm text-ink-soft">연차 {s.leave}</span>
                <button
                  type="button"
                  onClick={() => (inPlan ? props.onRemove(s) : props.onAdd(s))}
                  className={`w-14 py-1 text-sm font-bold ${inPlan ? 'bg-tape' : 'border border-ink'}`}
                  aria-label={`${rangeLabel(days, s)} ${inPlan ? '빼기' : '담기'}`}
                >
                  {inPlan ? '담음' : '담기'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <h2 className="font-display text-3xl">내 플랜</h2>
        {breaks.length === 0 ? (
          <p className="mt-4 leading-relaxed text-ink-soft">
            아직 담은 연차가 없습니다. 추천안으로 채우거나, 위 조합을 담거나, 아래 달력에서 평일을 눌러 연차를 지정하세요.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {breaks.map((s) => (
              <li key={s.start} className="flex items-center gap-4 bg-paper px-4 py-3">
                <span className="num w-14 text-3xl font-bold leading-none">{s.length}</span>
                <span className="flex-1">
                  <span className="block">{rangeLabel(days, s)}</span>
                  <span className="text-sm text-ink-soft">
                    연차 {s.leave}개{holidayNamesIn(days, s).length ? `, ${holidayNamesIn(days, s).join(', ')}` : ''}
                  </span>
                </span>
                <button type="button" onClick={() => props.onRemove(s)} className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink">
                  빼기
                </button>
              </li>
            ))}
          </ul>
        )}
        {leave.size > breaks.reduce((a, s) => a + s.leave, 0) && (
          <p className="mt-3 text-sm text-ink-soft">연휴로 이어지지 않는 단독 연차 {leave.size - breaks.reduce((a, s) => a + s.leave, 0)}개는 달력에서 확인하세요.</p>
        )}
      </div>
    </section>
  )
}

function YearGrid(props: {
  days: Day[]
  leave: Set<number>
  recommended: Set<number>
  breaks: Streak[]
  onToggle: (d: Day) => void
  year: number
}) {
  const { days, leave, recommended, breaks } = props
  const inBreak = new Set<number>()
  breaks.forEach((s) => {
    for (let i = s.start; i <= s.end; i++) inBreak.add(i)
  })
  const months = Array.from({ length: 12 }, (_, m) => days.filter((d) => d.month === m + 1))
  return (
    <section aria-labelledby="grid-title" className="mt-16">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <h2 id="grid-title" className="mr-auto font-display text-3xl">
          {props.year} 달력
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <li className="flex items-center gap-1.5">
            <span className="text-hol">●</span> 공휴일·일요일
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-sat">●</span> 토요일
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 bg-tape" /> 내 연차
          </li>
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-5 border border-dashed border-ink" /> 추천 연차
          </li>
        </ul>
      </div>
      <p className="mt-2 text-sm text-ink-soft">평일을 누르면 연차를 붙이거나 뗄 수 있습니다.</p>
      <div className="mt-6 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {months.map((md, m) => {
          const lead = md[0].dow
          const hols = md.filter((d) => d.rawHoliday)
          return (
            <div key={m} className="bg-paper">
              <div className="rings h-3 bg-ink" aria-hidden />
              <div className="px-3 pb-3 pt-2">
                <h3 className="num text-2xl font-bold">{m + 1}월</h3>
                <div className="mt-1 grid grid-cols-7 text-center text-xs">
                  {DOW_KO.map((w, i) => (
                    <span key={w} className={`py-0.5 ${i === 0 ? 'text-hol' : i === 6 ? 'text-sat' : 'text-ink-soft'}`}>
                      {w}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 text-center">
                  {Array.from({ length: lead }, (_, i) => (
                    <span key={`b${i}`} />
                  ))}
                  {md.map((d) => {
                    const isLeave = leave.has(d.index)
                    const isRec = !isLeave && recommended.has(d.index)
                    const bridged = !isLeave && inBreak.has(d.index)
                    const title = `${labelOf(d)} ${isLeave ? '연차' : d.rawHoliday ? d.rawHoliday.name : ''}`.trim()
                    const cls = `num relative my-[1px] h-8 text-[15px] ${dayColor(d)} ${isLeave ? 'bg-tape font-bold' : bridged ? 'bg-tape-pale' : ''} ${
                      isRec ? 'outline-dashed outline-1 -outline-offset-2 outline-ink' : ''
                    } ${d.rawHoliday && !d.holiday ? 'line-through decoration-1' : ''}`
                    return d.off ? (
                      <span key={d.iso} className={cls} title={title}>
                        <span className="leading-8">{d.date}</span>
                      </span>
                    ) : (
                      <button key={d.iso} type="button" className={`${cls} hover:bg-sky`} title={title} aria-pressed={isLeave} aria-label={`${title}${isRec ? ' 추천' : ''}`} onClick={() => props.onToggle(d)}>
                        {d.date}
                      </button>
                    )
                  })}
                </div>
                <ul className="mt-2 min-h-[1.25rem] space-y-0.5 text-xs text-ink-soft">
                  {hols.map((d) => (
                    <li key={d.iso}>
                      <span className="num text-hol">{d.date}</span> {d.rawHoliday!.name}
                      {d.rawHoliday && !d.holiday && ' (5인 미만 미적용)'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
