// 실행: npx tsx scripts/verify.ts
// 휴일 데이터와 연휴 계산을 공식 총계와 대조한다.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import { buildYear, topStreaks, planYear, rangeLabel, holidayNamesIn, DOW_KO, type HolidayFile } from '../src/lib/calendar.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const index = JSON.parse(readFileSync(join(root, 'public/holidays/index.json'), 'utf8')) as { years: number[]; default: number }

for (const year of index.years) {
  const file = JSON.parse(readFileSync(join(root, `public/holidays/${year}.json`), 'utf8')) as HolidayFile
  console.log(`\n=== ${year} (${file.source}) ===`)
  const days = buildYear(file, false)

  // 1) 날짜 형식·연도·중복
  const seen = new Set<string>()
  for (const h of file.holidays) {
    assert.match(h.date, /^\d{4}-\d{2}-\d{2}$/, h.date)
    assert.ok(h.date.startsWith(`${year}-`), `${h.date} 은 ${year}년이 아님`)
    assert.ok(!seen.has(h.date), `중복 ${h.date}`)
    seen.add(h.date)
    assert.ok(days.some((d) => d.iso === h.date), `존재하지 않는 날짜 ${h.date}`)
  }

  // 2) 공식 총계: 관공서 공휴일 = 일요일 + 일요일 아닌 휴일
  const sundays = days.filter((d) => d.dow === 0).length
  const nonSundayHolidays = file.holidays.filter((h) => days.find((d) => d.iso === h.date)!.dow !== 0).length
  const total = sundays + nonSundayHolidays
  console.log(`일요일 ${sundays} + 일요일 아닌 휴일 ${nonSundayHolidays} = 관공서 공휴일 ${total}일`)
  if (file.officialTotal) {
    assert.equal(sundays, file.officialTotal.sundays, '일요일 수 불일치')
    assert.equal(nonSundayHolidays, file.officialTotal.nonSundayHolidays, '일요일 아닌 휴일 수 불일치')
    assert.equal(total, file.officialTotal.publicHolidays, '관공서 공휴일 총계 불일치')
  }

  // 3) 2027 은 요일까지 고정 검증
  if (year === 2027) {
    assert.equal(days[0].dow, 5, '2027-01-01 은 금요일')
    assert.equal(days.length, 365)
    const expectDow: Record<string, number> = {
      '2027-02-06': 6, '2027-02-09': 2, '2027-05-01': 6, '2027-05-03': 1, '2027-05-13': 4,
      '2027-06-06': 0, '2027-07-19': 1, '2027-08-16': 1, '2027-09-14': 2, '2027-09-16': 4,
      '2027-10-04': 1, '2027-10-11': 1, '2027-12-25': 6, '2027-12-27': 1,
    }
    for (const [iso, dow] of Object.entries(expectDow)) {
      assert.equal(days.find((d) => d.iso === iso)!.dow, dow, `${iso} 요일`)
    }
  }

  // 4) 평일에 걸린 휴일 / 근무일 수
  const weekdayHolidays = days.filter((d) => !d.weekend && d.holiday)
  const weekends = days.filter((d) => d.weekend).length
  const workdays = days.filter((d) => !d.off).length
  console.log(`주말 ${weekends}일, 평일에 걸린 휴일 ${weekdayHolidays.length}일, 근무일 ${workdays}일`)
  console.log('  평일 휴일:', weekdayHolidays.map((d) => `${d.month}/${d.date}(${DOW_KO[d.dow]})`).join(' '))
  assert.equal(weekends + weekdayHolidays.length + workdays, days.length)
  if (year === 2027) {
    assert.equal(weekdayHolidays.length, 15)
    assert.equal(workdays, 246)
  }

  // 5) 연차 1~5개 최고 조합
  for (let k = 1; k <= 5; k++) {
    const top = topStreaks(days, k, 3)
    console.log(`연차 ${k}개:`)
    for (const s of top) {
      const leave = s.leaveDays.map((i) => `${days[i].month}/${days[i].date}`).join(', ')
      console.log(`  ${s.length}일  ${rangeLabel(days, s)}  연차 ${leave}  효율 ${s.efficiency.toFixed(1)}  [${holidayNamesIn(days, s).join(', ') || '주말'}]`)
      // 구간 안에 근무일이 정확히 k개, 양 끝 바깥은 근무일
      let w = 0
      for (let i = s.start; i <= s.end; i++) if (!days[i].off) w++
      assert.equal(w, k)
      if (s.start > 0) assert.ok(!days[s.start - 1].off)
      if (s.end < days.length - 1) assert.ok(!days[s.end + 1].off)
    }
    // 연차 k개의 최장은 k가 늘면 줄지 않는다
    if (k > 1) assert.ok(top[0].length >= topStreaks(days, k - 1, 1)[0].length)
  }
  if (year === 2027) {
    assert.equal(topStreaks(days, 1, 1)[0].length, 6, '연차 1개 최장 = 추석 6일')
    assert.equal(topStreaks(days, 2, 1)[0].length, 9, '연차 2개 최장 = 추석 9일')
    assert.equal(topStreaks(days, 3, 1)[0].length, 10, '연차 3개 최장 = 10일')
  }

  // 6) 연간 추천안
  const plan = planYear(days, 15)
  const used = plan.reduce((a, s) => a + s.leave, 0)
  const breakDays = plan.reduce((a, s) => a + s.length, 0)
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].start > plan[i - 1].end + 1, '추천 구간 겹침')
  assert.ok(used <= 15)
  console.log(`연차 15개 추천안: ${plan.length}개 연휴, 연차 ${used}개, 연휴 합계 ${breakDays}일`)
  for (const s of plan) console.log(`  ${s.length}일  ${rangeLabel(days, s)}  연차 ${s.leave}`)

  // 7) 5인 미만: 관공서 공휴일 제외
  const small = buildYear(file, true)
  const smallWeekdayHol = small.filter((d) => !d.weekend && d.holiday).length
  console.log(`5인 미만 기준 평일 휴일 ${smallWeekdayHol}일, 연차 3개 최장 ${topStreaks(small, 3, 1)[0].length}일`)
  assert.ok(small.every((d) => !d.holiday || d.holiday.scope === 'all'))
}

console.log('\nverify OK')
