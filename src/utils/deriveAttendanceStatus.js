import { computeWindowStatus } from "./attendanceWindow";

// record: 1 dòng điểm danh của SV cho buổi này (có thể null nếu chưa quét)
// session: { thoi_gian_bat_dau, mo_tu, dong_den, tre_sau_phut }
// nowMs: để test/đồng bộ UI, mặc định Date.now()
export function deriveAttendanceStatus(record, session, nowMs = Date.now()) {
  // Nếu đã có bản ghi -> theo đúng trạng thái đã lưu
  if (record?.trang_thai === "dung_gio") return "ontime";
  if (record?.trang_thai === "tre") return "late";

  // Chưa có bản ghi -> quyết định theo cửa thời gian hiện tại
  const onTimeMin = Math.round(
    (new Date(session.mo_tu).getTime() -
      new Date(session.thoi_gian_bat_dau).getTime()) /
      60000
  );
  const lateMin = Number.isFinite(session.tre_sau_phut)
    ? session.tre_sau_phut
    : Math.round(
        (new Date(session.dong_den).getTime() -
          new Date(session.mo_tu).getTime()) /
          60000
      );

  const { phase } = computeWindowStatus(
    { startISO: session.thoi_gian_bat_dau, onTimeMin, lateMin },
    nowMs
  );

  if (phase === "before") return "before"; // Chưa mở
  if (phase === "ontime") return "pending"; // Đang mở pha đúng giờ mà SV chưa quét
  if (phase === "late") return "pending"; // Đang mở pha trễ mà SV chưa quét
  return "absent"; // Đã đóng -> VẮNG
}

// UI chip ngắn gọn
export function labelForStatus(s) {
  return s === "ontime"
    ? "Đúng giờ"
    : s === "late"
    ? "Trễ"
    : s === "absent"
    ? "Vắng"
    : s === "before"
    ? "Chưa đến giờ"
    : /* pending */ "Chưa điểm danh";
}
