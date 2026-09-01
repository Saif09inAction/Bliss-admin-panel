"use client";

import { X } from "lucide-react";
import type { SalaryStaffDetail } from "@/lib/salary-detail";
import { formatDurationMinutes } from "@/lib/salary-detail";
import { formatDisplayDate } from "@/lib/csv";

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

type Props = {
  staffName: string;
  detail: SalaryStaffDetail;
  onClose: () => void;
  onPay?: () => void;
};

export default function SalaryStaffDetailPanel({ staffName, detail, onClose, onPay }: Props) {
  const d = detail;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
        <div
          className="surface flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4 sm:p-5">
            <div>
              <h3 className="font-display text-xl font-bold capitalize">{staffName}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {d.periodLabel}
                {d.isCurrentPeriod ? " · current period" : " · past period"}
              </p>
            </div>
            <button type="button" className="btn btn-ghost p-2" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {d.carryForward.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
                  Carried forward (unpaid previous periods)
                </p>
                <div className="mt-2 space-y-1.5">
                  {d.carryForward.map((line) => (
                    <div
                      key={`${line.periodStart}-${line.periodEnd}`}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-amber-900">{line.label}</span>
                      <span className="font-semibold text-amber-900">
                        {money(line.unpaid)}
                        <span className="ml-1 text-xs font-normal opacity-70">
                          (earned {money(line.earned)} − paid {money(line.paid)})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 border-t border-amber-200 pt-2 text-sm font-bold text-amber-900">
                  Carry forward total: {money(d.carryForwardTotal)}
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Full days" value={String(d.attendance.fullDays)} />
              <Stat label="Half days" value={String(d.attendance.halfDays)} />
              <Stat label="Absent" value={String(d.attendance.absentDays)} />
              <Stat label="Holidays" value={String(d.attendance.holidayDays)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-jade-deep">
                  Earnings breakdown
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <Row
                    label={`Full days (${d.earnings.fullDayCount})`}
                    value={money(d.earnings.fullDayAmount)}
                  />
                  <Row
                    label={`Half days (${d.earnings.halfDayCount})`}
                    value={money(d.earnings.halfDayAmount)}
                  />
                  <Row label="Gross earned" value={money(d.earnings.grossEarned)} bold />
                  <Row
                    label={`Rate per day`}
                    value={money(d.earned.perDayRate)}
                    muted
                  />
                  <Row
                    label={`Rate per hour`}
                    value={money(d.earned.perHourRate)}
                    muted
                  />
                  <Row
                    label={`Total hours worked`}
                    value={`${d.attendance.totalWorkingHours} hrs`}
                    muted
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-danger">
                  Deductions
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <Row
                    label={`Late (${formatDurationMinutes(d.deductions.lateMinutes)})`}
                    value={`−${money(d.deductions.lateAmount)}`}
                    danger
                  />
                  <Row
                    label={`Early leave (${formatDurationMinutes(d.deductions.earlyMinutes)})`}
                    value={`−${money(d.deductions.earlyAmount)}`}
                    danger
                  />
                  <Row
                    label="Total deducted"
                    value={`−${money(d.deductions.total)}`}
                    danger
                    bold
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-[var(--surface-mist)] p-4 text-sm">
              <Row label="Earned this period (net)" value={money(d.earned.earnedNet)} />
              <Row label="Paid this period" value={money(d.paid)} />
              <Row label="Due this period" value={money(d.periodDue)} />
              {d.carryForwardTotal > 0 && (
                <Row label="Carry forward" value={money(d.carryForwardTotal)} />
              )}
              <div className="mt-2 flex justify-between border-t border-[var(--border)] pt-2 font-bold">
                <span>Total due</span>
                <span className="text-warning">{money(d.totalDue)}</span>
              </div>
            </div>

            {d.earned.days.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Day-by-day
                </p>
                <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                  <table className="data-table text-sm">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Day</th>
                        <th>Hours</th>
                        <th>Earned</th>
                        <th>Late</th>
                        <th>Early</th>
                        <th>Cut</th>
                        <th>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.earned.days.map((day) => (
                        <tr key={day.date}>
                          <td>{formatDisplayDate(day.date)}</td>
                          <td>{day.dayFactor < 1 ? "Half" : "Full"}</td>
                          <td>{day.workingHours > 0 ? day.workingHours.toFixed(1) : "—"}</td>
                          <td>{money(day.dayGross)}</td>
                          <td className="text-danger">
                            {day.lateMinutes > 0 ? formatDurationMinutes(day.lateMinutes) : "—"}
                          </td>
                          <td className="text-danger">
                            {day.earlyMinutes > 0 ? formatDurationMinutes(day.earlyMinutes) : "—"}
                          </td>
                          <td className="text-danger">
                            {day.deduction > 0 ? `−${money(day.deduction)}` : "—"}
                          </td>
                          <td className="font-medium">{money(day.dayNet)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {d.payments.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Payments this period
                </p>
                <div className="space-y-1 rounded-xl border border-[var(--border)] p-3">
                  {d.payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-sm">
                      <span>
                        {formatDisplayDate(p.date)} · {money(p.amount)}
                      </span>
                      <span className="text-[var(--text-muted)]">{p.remarks || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t border-[var(--border)] p-4">
            <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
              Close
            </button>
            {onPay && d.totalDue > 0 && (
              <button type="button" className="btn btn-primary flex-1" onClick={onPay}>
                Pay {money(d.totalDue)}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  danger,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${bold ? "font-bold" : ""}`}>
      <span className={muted ? "text-[var(--text-muted)]" : ""}>{label}</span>
      <span className={danger ? "text-danger" : ""}>{value}</span>
    </div>
  );
}
