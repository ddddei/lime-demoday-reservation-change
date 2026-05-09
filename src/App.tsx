import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  MoonStar,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

const API_BASE_URL =
  "https://script.google.com/macros/s/AKfycbwbZxXWK8KIw1ERaFm6B3zrV1ZSpfyRO1T7X51N0OpFwGobps4UIm8t9ROOIDao5HZ_/exec";

const ADMIN_PHONES = ["01029733421", "01049084901"];

const CONTACT_PHONE = "02-2066-8134";

const SPACES = [
  { id: "room-1", name: "회의실 1", capacity: "최대 12명", desc: "팀 회의, 교육, 모임 운영에 적합" },
  { id: "room-2", name: "회의실 2", capacity: "최대 8명", desc: "소규모 회의, 상담, 인터뷰에 적합" },
  { id: "room-3", name: "회의실 3", capacity: "최대 8명", desc: "소규모 회의, 스터디, 간단한 워크숍에 적합" },
] as const;

const DATES = [
  "2026-05-17",
  "2026-05-19",
  "2026-05-20",
  "2026-05-21",
  "2026-05-22",
] as const;

const SUNDAY_SLOTS = [
  "10:00-11:00",
  "11:00-12:00",
  "12:00-13:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
  "16:00-17:00",
] as const;

const WEEKDAY_SLOTS = [
  "10:00-11:00",
  "11:00-12:00",
  "12:00-13:00",
  "13:00-14:00",
  "14:00-15:00",
  "15:00-16:00",
  "16:00-17:00",
  "17:00-18:00",
  "18:00-19:00",
  "19:00-20:00",
  "20:00-21:00",
] as const;

type Reservation = {
  id: string;
  spaceId: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  status: string;
  createdAt?: string;
};

type ActiveUser = {
  name: string;
  phone: string;
  isVerified: boolean;
  isAdmin: boolean;
};

type ViewMode = "user" | "admin";

type FormState = {
  name: string;
  phone: string;
  spaceId: string;
  date: string;
  time: string;
};

type ApiResponse<T = unknown> = {
  success: boolean;
  message?: string;
  isAdmin?: boolean;
  reservations?: T;
  reservationId?: string;
};

type NoticeKind = "info" | "success" | "error";

const inputClassName =
  "w-full rounded-2xl border border-white/10 bg-[#11182d]/90 px-4 py-3.5 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-emerald-300/60 focus:bg-[#15203a] focus:ring-4 focus:ring-emerald-400/10";

export default function ReservationLandingPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [activeUser, setActiveUser] = useState<ActiveUser>({
    name: "",
    phone: "",
    isVerified: false,
    isAdmin: false,
  });
  const [viewMode, setViewMode] = useState<ViewMode>("user");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<NoticeKind>("info");
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    phone: "",
    spaceId: SPACES[0].id,
    date: DATES[0],
    time: SUNDAY_SLOTS[0],
  });

  const normalizedPhone = normalizePhone(form.phone);
  const activePhone = normalizePhone(activeUser.phone);
  const isAdmin = activeUser.isAdmin || ADMIN_PHONES.includes(activePhone);
  const showAdminPanel = viewMode === "admin" && isAdmin;

  const dateSlots = useMemo(() => getTimeSlotsForDate(form.date), [form.date]);
  const currentSpace = SPACES.find((space) => space.id === form.spaceId);
  const selectedReservation = reservations.find((item) => item.id === selectedReservationId) ?? null;

  const isDuplicate = useMemo(() => {
    return reservations.some(
      (item) =>
        item.spaceId === form.spaceId &&
        item.date === form.date &&
        item.time === form.time &&
        item.status === "예약완료" &&
        item.id !== selectedReservationId,
    );
  }, [form.spaceId, form.date, form.time, reservations, selectedReservationId]);

  const exceedsReservationLimit = useMemo(() => {
    return reservations.some(
      (item) =>
        normalizePhone(item.phone) === normalizedPhone &&
        item.status === "예약완료" &&
        item.id !== selectedReservationId,
    );
  }, [reservations, normalizedPhone, selectedReservationId]);

  const availableTimes = useMemo(() => {
    return dateSlots.map((slot) => {
      const found = reservations.find(
        (item) =>
          item.spaceId === form.spaceId &&
          item.date === form.date &&
          item.time === slot &&
          item.status === "예약완료" &&
          item.id !== selectedReservationId,
      );
      return { slot, found, taken: Boolean(found) };
    });
  }, [dateSlots, reservations, form.spaceId, form.date, selectedReservationId]);

  const availableCount = availableTimes.filter((item) => !item.taken).length;

  const myReservations = useMemo(() => {
    return reservations
      .filter((item) => normalizePhone(item.phone) === activePhone && item.status === "예약완료")
      .sort(compareReservations);
  }, [reservations, activePhone]);

  const adminReservations = useMemo(() => {
    return [...reservations]
      .filter((item) => item.status === "예약완료")
      .sort(compareReservations);
  }, [reservations]);

  const canSubmit = activeUser.isVerified && activePhone === normalizedPhone && activeUser.name === form.name.trim();

  useEffect(() => {
    void loadReservations();
  }, []);

  function showMessage(text: string, kind: NoticeKind = "info") {
    setMessage(text);
    setMessageKind(kind);
  }

  async function loadReservations() {
    setIsLoadingReservations(true);
    try {
      const data = await apiGet<ApiResponse<Reservation[]>>("reservations");
      if (data.success && Array.isArray(data.reservations)) {
        setReservations(data.reservations);
      } else {
        showMessage(data.message || "예약 현황을 불러오지 못했습니다.", "error");
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "예약 현황을 불러오지 못했습니다.", "error");
    } finally {
      setIsLoadingReservations(false);
    }
  }

  async function handleIdentityApply() {
    if (!form.name.trim() || normalizedPhone.length !== 11) {
      showMessage("이름과 전화번호 11자리를 정확히 입력해 주세요.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiPost<ApiResponse>({
        action: "verifyUser",
        name: form.name.trim(),
        phone: normalizedPhone,
      });

      if (!data.success) {
        showMessage(data.message || "이용자 확인에 실패했습니다.", "error");
        return;
      }

      const adminFlag = Boolean(data.isAdmin) || ADMIN_PHONES.includes(normalizedPhone);
      setActiveUser({
        name: form.name.trim(),
        phone: normalizedPhone,
        isVerified: true,
        isAdmin: adminFlag,
      });

      await loadReservations();
      showMessage(adminFlag ? "관리자 번호가 확인되었습니다." : "등록된 이용자 확인이 완료되었습니다.", "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "이용자 확인에 실패했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.name.trim() || normalizedPhone.length !== 11) {
      showMessage("이름과 전화번호 11자리를 정확히 입력해 주세요.", "error");
      return;
    }

    if (!canSubmit) {
      showMessage("먼저 '내 정보 확인'으로 본인 확인을 완료해 주세요.", "error");
      return;
    }

    if (isDuplicate) {
      showMessage("이미 선점된 시간입니다. 다른 시간대를 선택해 주세요.", "error");
      return;
    }

    if (exceedsReservationLimit) {
      showMessage("운영 기간 중 1인 1회만 예약할 수 있습니다.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedReservationId !== null) {
        const data = await apiPost<ApiResponse>({
          action: "updateReservation",
          id: selectedReservationId,
          name: form.name.trim(),
          phone: normalizedPhone,
          spaceId: form.spaceId,
          date: form.date,
          time: form.time,
        });

        if (!data.success) {
          showMessage(data.message || "예약 수정에 실패했습니다.", "error");
          return;
        }

        showMessage(data.message || "예약이 수정되었습니다.", "success");
        setSelectedReservationId(null);
      } else {
        const data = await apiPost<ApiResponse>({
          action: "createReservation",
          name: form.name.trim(),
          phone: normalizedPhone,
          spaceId: form.spaceId,
          date: form.date,
          time: form.time,
        });

        if (!data.success) {
          showMessage(data.message || "예약 생성에 실패했습니다.", "error");
          return;
        }

        showMessage(data.message || "예약이 완료되었습니다 🎉", "success");
      }

      await loadReservations();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "예약 처리 중 오류가 발생했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEdit(id: string) {
    const target = reservations.find((item) => item.id === id);
    if (!target) {
      showMessage("예약 정보를 찾지 못했습니다.", "error");
      return;
    }

    const targetPhone = normalizePhone(target.phone);
    if (!isAdmin && targetPhone !== activePhone) {
      showMessage("본인 예약만 수정할 수 있습니다.", "error");
      return;
    }

    setSelectedReservationId(id);
    setForm({
      name: target.name,
      phone: normalizePhone(target.phone),
      spaceId: target.spaceId,
      date: target.date,
      time: target.time,
    });
    showMessage(isAdmin ? "관리자 수정 모드입니다." : "내 예약 수정 모드입니다.", "info");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    const target = reservations.find((item) => item.id === id);
    if (!target) {
      showMessage("예약 정보를 찾지 못했습니다.", "error");
      return;
    }

    const targetPhone = normalizePhone(target.phone);
    if (!isAdmin && targetPhone !== activePhone) {
      showMessage("본인 예약만 취소할 수 있습니다.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiPost<ApiResponse>({
        action: "deleteReservation",
        id,
        phone: activePhone,
      });

      if (!data.success) {
        showMessage(data.message || "예약 취소에 실패했습니다.", "error");
        return;
      }

      if (selectedReservationId === id) {
        setSelectedReservationId(null);
      }

      showMessage(data.message || "예약이 취소되었습니다.", "success");
      await loadReservations();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "예약 취소 중 오류가 발생했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080d1c] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.18),transparent_32%),linear-gradient(180deg,#0b1020_0%,#070b16_100%)]" />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-14">
        <header className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-4 py-1.5 text-sm font-semibold text-emerald-200 backdrop-blur">
            <Sparkles className="h-4 w-4" />
            데모데이 모임 장소 예약
          </div>

          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-black leading-[1.18] tracking-[-0.04em] sm:text-5xl md:text-6xl md:leading-[1.13]">
            필요한 시간과 공간을
            <br />
            빠르게 예약하세요
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
            5월 17일 ~ 5월 22일 운영 · 일요일 10:00~17:00 · 화–금요일 10:00~21:00 · 월요일 휴관
            <br />
            운영 기간 중 1인 1회, 1시간만 예약 가능합니다.
          </p>

          <div className="mx-auto mt-5 max-w-2xl rounded-3xl border border-amber-300/20 bg-amber-300/10 px-5 py-4 text-sm leading-6 text-amber-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
            <p className="font-semibold">예약 취소는 본인 예약 내역에서 운영 기간 중 1회만 직접 가능합니다.</p>
            <p className="mt-1">
              이후 취소가 필요한 경우 <strong className="font-black text-amber-50">{CONTACT_PHONE}</strong>로 문의해 주세요.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Pill icon={<Clock3 className="h-4 w-4" />}>1시간 단위</Pill>
            <Pill icon={<MapPin className="h-4 w-4" />}>회의실 3개</Pill>
            <Pill icon={<MoonStar className="h-4 w-4" />}>선착순 예약</Pill>
          </div>
        </header>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.95fr] lg:items-start">
          <div className="space-y-6">
            <GlassCard
              eyebrow="STEP 1"
              title="예약자 확인"
              subtitle="등록된 이용자만 예약할 수 있습니다."
              side={
                activeUser.isVerified ? (
                  <StatusBadge tone="success">{isAdmin ? "관리자 인증" : "본인 확인 완료"}</StatusBadge>
                ) : (
                  <StatusBadge tone="muted">확인 필요</StatusBadge>
                )
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="이름" icon={<UserRound className="h-4 w-4" />}>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="이름을 입력해 주세요"
                    className={inputClassName}
                  />
                </Field>

                <Field label="전화번호" icon={<Phone className="h-4 w-4" />}>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: onlyDigits(e.target.value) }))}
                    placeholder="숫자만 입력해 주세요"
                    maxLength={11}
                    className={inputClassName}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <PrimaryButton type="button" onClick={() => void handleIdentityApply()} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  내 정보 확인
                </PrimaryButton>

                <GhostButton type="button" onClick={() => void loadReservations()} disabled={isLoadingReservations}>
                  {isLoadingReservations ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                  예약 현황 새로고침
                </GhostButton>
              </div>

              {isAdmin && (
                <GhostButton type="button" onClick={() => setViewMode((prev) => (prev === "admin" ? "user" : "admin"))}>
                  {showAdminPanel ? "예약자 화면으로 보기" : "관리자 화면 열기"}
                </GhostButton>
              )}

              <InfoMessage text={message} kind={messageKind} />
            </GlassCard>

            <GlassCard
              eyebrow="STEP 2"
              title="예약 신청"
              subtitle={currentSpace ? `${currentSpace.name} · ${currentSpace.capacity}` : undefined}
              side={<StatusBadge tone={availableCount > 0 ? "success" : "danger"}>{availableCount}개 가능</StatusBadge>}
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/70">
                <p>본인 예약 취소는 운영 기간 중 1회만 가능합니다.</p>
                <p className="mt-1">반드시 이용 가능한 시간을 신중히 확인한 뒤 신청해 주세요.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {SPACES.map((space) => {
                  const selected = form.spaceId === space.id;
                  return (
                    <button
                      key={space.id}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          spaceId: space.id,
                          time: getTimeSlotsForDate(prev.date)[0],
                        }))
                      }
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        selected
                          ? "border-emerald-300/50 bg-emerald-400/12 ring-4 ring-emerald-400/10"
                          : "border-white/10 bg-[#11182d]/70 hover:border-white/20 hover:bg-white/[0.06]"
                      }`}
                    >
                      <p className="text-sm font-bold text-white">{space.name}</p>
                      <p className="mt-1 text-xs font-semibold text-emerald-200">{space.capacity}</p>
                      <p className="mt-2 text-xs leading-5 text-white/50">{space.desc}</p>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="날짜 선택" icon={<CalendarDays className="h-4 w-4" />}>
                    <select
                      value={form.date}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        const nextSlots = getTimeSlotsForDate(nextDate);
                        setForm((prev) => ({ ...prev, date: nextDate, time: nextSlots[0] }));
                      }}
                      className={inputClassName}
                    >
                      {DATES.map((date) => (
                        <option key={date} value={date}>
                          {formatDate(date)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="선택 공간" icon={<MapPin className="h-4 w-4" />}>
                    <div className="rounded-2xl border border-white/10 bg-[#11182d]/90 px-4 py-3.5 text-sm text-white/80">
                      {currentSpace?.name} · {currentSpace?.capacity}
                    </div>
                  </Field>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white/85">시간 선택</p>
                    <p className="text-xs text-white/45">선택한 날짜 기준</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {availableTimes.map(({ slot, taken, found }) => {
                      const selected = form.time === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={taken}
                          onClick={() => setForm((prev) => ({ ...prev, time: slot }))}
                          className={`min-h-[76px] rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition active:scale-[0.98] ${
                            taken
                              ? "cursor-not-allowed border-white/8 bg-white/[0.03] text-white/35"
                              : selected
                                ? "border-emerald-300/60 bg-emerald-400/14 text-emerald-100 shadow-[0_12px_30px_rgba(16,185,129,0.12)] ring-4 ring-emerald-400/10"
                                : "border-white/10 bg-[#11182d]/80 text-white/80 hover:border-emerald-300/30 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div>{slot}</div>
                          <div className="mt-1 text-xs font-medium opacity-70">
                            {taken ? "선점 완료" : selected ? "선택됨" : "예약 가능"}
                          </div>
                          {taken && found && (
                            <div className="mt-1 text-xs opacity-60">
                              {showAdminPanel ? `${found.name} 예약` : `${maskName(found.name)} 예약`}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <PrimaryButton type="submit" disabled={isSubmitting || isDuplicate}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {selectedReservation ? "예약 수정 저장" : "예약하기"}
                  </PrimaryButton>

                  {selectedReservation ? (
                    <GhostButton
                      type="button"
                      onClick={() => {
                        setSelectedReservationId(null);
                        showMessage("수정 모드를 취소했습니다.", "info");
                      }}
                    >
                      수정 취소
                    </GhostButton>
                  ) : (
                    <GhostButton type="button" onClick={() => void loadReservations()} disabled={isLoadingReservations}>
                      현황 다시 확인
                    </GhostButton>
                  )}
                </div>
              </form>
            </GlassCard>
          </div>

          <div className="space-y-6 lg:sticky lg:top-6">
            <GlassCard
              eyebrow="LIVE"
              title="현재 예약 현황"
              subtitle={`${currentSpace?.name ?? "회의실"} · ${formatDate(form.date)}`}
              side={isLoadingReservations ? <StatusBadge tone="muted">불러오는 중</StatusBadge> : <StatusBadge tone="success">실시간</StatusBadge>}
            >
              {isLoadingReservations ? (
                <EmptyState>예약 현황을 불러오는 중입니다.</EmptyState>
              ) : (
                <div className="space-y-3">
                  {dateSlots.map((slot) => {
                    const found = reservations.find(
                      (item) =>
                        item.spaceId === form.spaceId &&
                        item.date === form.date &&
                        item.time === slot &&
                        item.status === "예약완료",
                    );
                    const isMine = !!found && normalizePhone(found.phone) === activePhone;

                    return (
                      <StatusRow
                        key={slot}
                        time={slot}
                        status={
                          !found
                            ? "예약 가능"
                            : showAdminPanel
                              ? `${found.name} · ${found.status}`
                              : isMine
                                ? `내 예약 · ${found.status}`
                                : `${maskName(found.name)} · 선점 완료`
                        }
                        active={!found}
                        actions={
                          found && isMine && !showAdminPanel ? (
                            <div className="flex flex-wrap gap-2">
                              <MiniButton onClick={() => handleEdit(found.id)}>수정</MiniButton>
                              <MiniGhostButton onClick={() => void handleDelete(found.id)}>취소</MiniGhostButton>
                            </div>
                          ) : found && showAdminPanel ? (
                            <div className="flex flex-wrap gap-2">
                              <MiniButton onClick={() => handleEdit(found.id)}>관리자 수정</MiniButton>
                              <MiniGhostButton onClick={() => void handleDelete(found.id)}>삭제</MiniGhostButton>
                            </div>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              )}
            </GlassCard>

            <GlassCard eyebrow="MY BOOKING" title="내 예약">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/65">
                본인 예약 취소는 운영 기간 중 1회만 가능합니다. 이후 취소가 필요한 경우 {CONTACT_PHONE}로 문의해 주세요.
              </div>

              {myReservations.length === 0 ? (
                <EmptyState>아직 예약이 없습니다. 예약 신청 영역에서 가능한 시간을 선택해 주세요.</EmptyState>
              ) : (
                <div className="space-y-3">
                  {myReservations.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-[#11182d]/80 px-4 py-4">
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-sm font-bold text-white">{getSpaceName(item.spaceId)}</p>
                          <p className="mt-1 text-xs text-white/50">
                            {formatDate(item.date)} · {item.time} · {item.name}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Tag>{item.status}</Tag>
                          <MiniButton onClick={() => handleEdit(item.id)}>수정</MiniButton>
                          <MiniGhostButton onClick={() => void handleDelete(item.id)}>취소</MiniGhostButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {showAdminPanel && (
              <GlassCard eyebrow="ADMIN" title="관리자 예약 관리">
                {adminReservations.length === 0 ? (
                  <EmptyState>현재 예약 내역이 없습니다.</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {adminReservations.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/10 bg-[#11182d]/80 px-4 py-4">
                        <div className="flex flex-col gap-3">
                          <div>
                            <p className="text-sm font-bold text-white">
                              {getSpaceName(item.spaceId)} · {formatDate(item.date)} · {item.time}
                            </p>
                            <p className="mt-1 text-xs text-white/50">
                              예약자 {item.name} · {formatPhone(normalizePhone(item.phone))}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <MiniButton onClick={() => handleEdit(item.id)}>수정</MiniButton>
                            <MiniGhostButton onClick={() => void handleDelete(item.id)}>삭제</MiniGhostButton>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

async function apiGet<T>(action: string, params?: Record<string, string>) {
  const url = new URL(API_BASE_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("_ts", String(Date.now()));

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("API 요청에 실패했습니다.");
  }

  return (await response.json()) as T;
}

async function apiPost<T>(payload: Record<string, unknown>) {
  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("API 요청에 실패했습니다.");
  }

  return (await response.json()) as T;
}

function GlassCard({
  eyebrow,
  title,
  subtitle,
  side,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? <p className="mb-1 text-xs font-black tracking-[0.16em] text-emerald-200/80">{eyebrow}</p> : null}
          <h2 className="text-xl font-black tracking-[-0.02em] text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-white/50">{subtitle}</p> : null}
        </div>
        {side}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
        <span className="text-emerald-200">{icon}</span>
        {label}
      </p>
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  type = "button",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3.5 font-black text-white shadow-[0_14px_30px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  type = "button",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3.5 font-bold text-white/85 transition hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
    >
      {children}
    </button>
  );
}

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/75 backdrop-blur">
      {icon}
      {children}
    </div>
  );
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: "success" | "danger" | "muted" }) {
  const className =
    tone === "success"
      ? "bg-emerald-400/12 text-emerald-200 border-emerald-300/20"
      : tone === "danger"
        ? "bg-rose-400/12 text-rose-200 border-rose-300/20"
        : "bg-white/[0.06] text-white/55 border-white/10";

  return <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${className}`}>{children}</span>;
}

function StatusRow({
  time,
  status,
  active = false,
  actions,
}: {
  time: string;
  status: string;
  active?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border px-4 py-4 ${active ? "border-emerald-300/20 bg-emerald-400/[0.06]" : "border-white/10 bg-[#11182d]/80"}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-white">{time}</div>
            <div className="mt-1 text-xs text-white/45">회의실 기준 현황</div>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-bold ${active ? "bg-emerald-500/15 text-emerald-200" : "bg-white/8 text-white/70"}`}>
            {status}
          </div>
        </div>
        {actions}
      </div>
    </div>
  );
}

function MiniButton({ children, onClick }: { children: React.ReactNode; onClick?: React.MouseEventHandler<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-white transition hover:bg-emerald-400 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function MiniGhostButton({ children, onClick }: { children: React.ReactNode; onClick?: React.MouseEventHandler<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-white/80 transition hover:bg-white/10 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-bold text-white/70">{children}</span>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-5 text-sm leading-6 text-white/55">
      {children}
    </div>
  );
}

function InfoMessage({ text, kind }: { text: string; kind: NoticeKind }) {
  if (!text) return null;

  const style =
    kind === "success"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : kind === "error"
        ? "border-rose-300/25 bg-rose-400/10 text-rose-100"
        : "border-white/10 bg-white/[0.05] text-white/80";

  const Icon = kind === "error" ? AlertCircle : CheckCircle2;

  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm leading-6 ${style}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function getSpaceName(spaceId: string) {
  return SPACES.find((space) => space.id === spaceId)?.name || "공간";
}

function getTimeSlotsForDate(dateString: string): string[] {
  const date = new Date(dateString);
  const day = date.getDay();
  return day === 0 ? [...SUNDAY_SLOTS] : [...WEEKDAY_SLOTS];
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function normalizePhone(value: string | undefined | null) {
  return onlyDigits(value || "");
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function maskName(name: string) {
  if (!name) return "예약자";
  if (name.length === 1) return name;
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}*${name[name.length - 1]}`;
}

function compareReservations(a: Reservation, b: Reservation) {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const slots = getTimeSlotsForDate(a.date);
  return slots.indexOf(a.time) - slots.indexOf(b.time);
}

const DEV_TEST_CASES = [
  normalizePhone("010-8924-7928") === "01089247928",
  maskName("박지은") === "박*은",
  formatPhone("01029733421") === "010-2973-3421",
  formatPhone("01049084901") === "010-4908-4901",
  getTimeSlotsForDate("2026-05-17").length === 7,
  getTimeSlotsForDate("2026-05-19").length === 11,
  getSpaceName("room-2") === "회의실 2",
];

if (typeof window !== "undefined" && DEV_TEST_CASES.some((passed) => !passed)) {
  console.warn("ReservationLandingPage self-check failed.");
}