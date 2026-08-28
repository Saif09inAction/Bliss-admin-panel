"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { Clock, LogIn, LogOut, MapPin } from "lucide-react";
import { getDb } from "@/lib/firebase";
import { useAuth, isSupervisorSession } from "@/lib/auth-context";
import type { Attendance, AttendanceSettings } from "@/lib/types";
import { todayStr, nowTimeStr } from "@/lib/csv";
import {
  computeEarlyLeaveMinutes,
  computeLateMinutes,
  defaultSettings,
  effectiveDayStatus,
  formatDisplayTime,
  formatEarlyLeaveDuration,
  formatLateDuration,
  formatWorkingHours,
  parseAttendance,
  resolveShiftSettings,
  statusLabel,
  timeToMinutes,
} from "@/lib/attendance-utils";
import PageToolbar from "@/components/admin/PageToolbar";

function computeWorkingHours(signIn?: string, signOut?: string): number {
  const inM = timeToMinutes(signIn);
  const outM = timeToMinutes(signOut);
  if (inM == null || outM == null) return 0;
  return Math.max(0, (outM - inM) / 60);
}

export default function MyAttendancePage() {
  const { session } = useAuth();
  const [record, setRecord] = useState<Attendance | null>(null);
  const [settings, setSettings] = useState<AttendanceSettings>(defaultSettings());
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState("");
  const [gpsError, setGpsError] = useState<string | null>(null);

  const today = todayStr();
  const phone = session?.phone ?? "";

  useEffect(() => {
    if (!phone) return;
    const unsubSettings = onSnapshot(doc(getDb(), "settings", "attendance"), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setSettings({
          dailySignInTime: (d.dailySignInTime as string) || "09:00",
          dailySignOutTime: (d.dailySignOutTime as string) || "18:00",
        });
      }
    });
    const attId = `${phone}_${today}`;
    const unsubAtt = onSnapshot(doc(getDb(), "attendance", attId), (snap) => {
      if (snap.exists()) {
        setRecord(parseAttendance(snap.id, snap.data() as Record<string, unknown>));
      } else {
        setRecord(null);
      }
      setLoading(false);
    });
    return () => {
      unsubSettings();
      unsubAtt();
    };
  }, [phone, today]);

  const shift = useMemo(() => {
    if (!session || !isSupervisorSession(session)) return settings;
    return resolveShiftSettings(
      {
        dailySignInTime: session.dailySignInTime,
        dailySignOutTime: session.dailySignOutTime,
      },
      settings
    );
  }, [session, settings]);

  const dayStatus = effectiveDayStatus(record ?? undefined, today, shift);
  const lateMin = computeLateMinutes(record?.signInTime, shift.dailySignInTime);
  const earlyMin = computeEarlyLeaveMinutes(record?.signOutTime, shift.dailySignOutTime);

  function getCoordinates(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve(`${pos.coords.latitude},${pos.coords.longitude}`);
        },
        (err) => {
          if (err.code === 1) {
            reject(new Error("Location permission denied. Please allow location access to mark attendance."));
          } else {
            reject(new Error("Failed to fetch location. Please ensure location services/GPS are enabled on your device."));
          }
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  async function clockIn() {
    if (!session) return;
    setActing(true);
    setMsg("Fetching location…");
    setGpsError(null);
    try {
      const gps = await getCoordinates();
      const signInTime = nowTimeStr();
      const lateMinutes = computeLateMinutes(signInTime, shift.dailySignInTime);
      const status = lateMinutes > 0 ? "LATE" : "ON_TIME";
      const id = `${phone}_${today}`;
      await setDoc(doc(getDb(), "attendance", id), {
        id,
        employeeId: phone,
        date: today,
        signInTime,
        status,
        lateMinutes,
        workingHours: 0,
        punchSource: "supervisor_web",
        signInGps: gps,
        signInAddress: `Web coordinates: ${gps}`,
      });
      setMsg("Logged in with location — attendance marked.");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to log in.";
      setGpsError(errMsg);
      setMsg("");
    } finally {
      setActing(false);
    }
  }

  async function clockOut() {
    if (!session || !record?.signInTime) return;
    setActing(true);
    setMsg("Fetching location…");
    setGpsError(null);
    try {
      const gps = await getCoordinates();
      const signOutTime = nowTimeStr();
      const lateMinutes = computeLateMinutes(record.signInTime, shift.dailySignInTime);
      const earlyMinutes = computeEarlyLeaveMinutes(signOutTime, shift.dailySignOutTime);
      let status: string;
      if (earlyMinutes > 0) status = "LEFT_EARLY";
      else if (lateMinutes > 0) status = "LATE";
      else status = "PRESENT";
      const workingHours = computeWorkingHours(record.signInTime, signOutTime);
      const id = `${phone}_${today}`;
      await setDoc(
        doc(getDb(), "attendance", id),
        {
          signOutTime,
          status,
          lateMinutes,
          workingHours,
          punchSource: "supervisor_web",
          signOutGps: gps,
          signOutAddress: `Web coordinates: ${gps}`,
        },
        { merge: true }
      );
      setMsg("Logged out with location — attendance updated.");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to log out.";
      setGpsError(errMsg);
      setMsg("");
    } finally {
      setActing(false);
    }
  }

  if (!session || !isSupervisorSession(session)) {
    return <p className="text-sm text-[var(--text-muted)]">Supervisor login required.</p>;
  }

  return (
    <div className="space-y-5">
      <PageToolbar title="My attendance" />

      <div className="surface space-y-4 p-5">
        <p className="text-sm text-[var(--text-muted)]">
          Mark your day by logging in when you start and logging out when you finish. Late and early
          minutes are calculated like staff (based on your shift).
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Shift
            </p>
            <p className="mt-1 font-medium">
              {formatDisplayTime(shift.dailySignInTime)} – {formatDisplayTime(shift.dailySignOutTime)}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Today
            </p>
            <p className="mt-1 font-medium">{statusLabel(dayStatus)}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                <LogIn size={14} />
                In: {record?.signInTime ? formatDisplayTime(record.signInTime) : "—"}
              </span>
              <span className="flex items-center gap-1.5">
                <LogOut size={14} />
                Out: {record?.signOutTime ? formatDisplayTime(record.signOutTime) : "—"}
              </span>
              {record?.signInTime && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {formatWorkingHours(record.workingHours || computeWorkingHours(record.signInTime, record.signOutTime))}
                </span>
              )}
            </div>
            {lateMin > 0 && <p className="text-sm text-amber-700">{formatLateDuration(lateMin)}</p>}
            {earlyMin > 0 && (
              <p className="text-sm text-orange-700">{formatEarlyLeaveDuration(earlyMin)}</p>
            )}

            {gpsError && (
              <div className="rounded-xl border border-danger/30 bg-red-50 p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <MapPin size={18} className="text-danger shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-danger">Location Required</p>
                    <p className="text-xs text-danger mt-0.5">{gpsError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setGpsError(null);
                    if (!record?.signInTime) {
                      clockIn();
                    } else {
                      clockOut();
                    }
                  }}
                  className="btn btn-sm bg-danger text-white hover:bg-red-600 font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 w-fit"
                >
                  <MapPin size={12} />
                  Grant Location & Try Again
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {!record?.signInTime && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={acting}
                  onClick={clockIn}
                >
                  <LogIn size={16} />
                  {acting ? "Saving…" : "Log in (start day)"}
                </button>
              )}
              {record?.signInTime && !record?.signOutTime && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={acting}
                  onClick={clockOut}
                >
                  <LogOut size={16} />
                  {acting ? "Saving…" : "Log out (end day)"}
                </button>
              )}
            </div>
          </div>
        )}

        {msg && <p className="text-sm text-[var(--text-muted)]">{msg}</p>}
      </div>
    </div>
  );
}
