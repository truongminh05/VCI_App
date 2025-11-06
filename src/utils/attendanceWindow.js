// utils/attendanceWindow.js
export function computeWindowStatus(
  { startISO, onTimeMin, lateMin },
  nowMs = Date.now()
) {
  if (!startISO)
    return { phase: "before", onEnd: null, lateEnd: null, closedAt: null };
  const start = new Date(startISO).getTime();
  const onEnd = start + (onTimeMin || 0) * 60_000; // kết thúc “đúng giờ”
  const lateEnd = onEnd + (lateMin || 0) * 60_000; // kết thúc “trễ”
  const t = typeof nowMs === "number" ? nowMs : new Date(nowMs).getTime();

  if (Number.isNaN(start))
    return { phase: "invalid", onEnd: null, lateEnd: null, closedAt: null };
  if (t < start) return { phase: "before", onEnd, lateEnd, closedAt: lateEnd };
  if (t < onEnd) return { phase: "ontime", onEnd, lateEnd, closedAt: lateEnd };
  if (t < lateEnd) return { phase: "late", onEnd, lateEnd, closedAt: lateEnd };
  return { phase: "closed", onEnd, lateEnd, closedAt: lateEnd };
}
