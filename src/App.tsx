import { useEffect, useMemo, useState } from "react";
import type { FormEvent, MouseEventHandler, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const API_BASE_URL =
  "https://script.google.com/macros/s/AKfycbxpbmUoyAkJF1c82VsWruyeRCZNVqRrlZKPXjbmvk9xJD7wI8Enjln1c8dGCPnGGsxC/exec";

const ADMIN_PHONES = [
  "01029733421",
  "01049084901",
  "01045484592",
  "01044309870",
  "01033808374",
];

const SPACES = [
  { id: "room-1", name: "회의실 1", capacity: "최대 12명", desc: "팀 회의, 교육, 모임 운영에 적합" },
  { id: "room-2", name: "회의실 2", capacity: "최대 8명", desc: "소규모 회의, 상담, 인터뷰에 적합" },
  { id: "room-3", name: "회의실 3", capacity: "최대 8명", desc: "소규모 회의, 스터디, 간단한 워크숍에 적합" },
  { id: "multi-1", name: "다목적실 1", capacity: "다목적 공간", desc: "댄스 및 운동, 워크숍 등 다양한 활동을 위한 공간" },
] as const;

const DATES = [
  "2026-05-23",
  "2026-05-26",
  "2026-05-27",
  "2026-05-28",
  "2026-05-29",
] as const;

const EVENT_SLOTS = [
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

const MAX_PER_SPACE_PER_DAY = EVENT_SLOTS.length;

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

type DateSummary = {
  date: string;
  booked: number;
  remaining: number;
  bySpace: Array<{
    spaceId: string;
    name: string;
    booked: number;
    remaining: number;
  }>;
};

const inputClassName =
  "w-full rounded-xl border border-white/10 bg-[#101525] px-3.5 py-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-[#d7ff39]/60 focus:ring-4 focus:ring-[#d7ff39]/10";

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
    time: EVENT_SLOTS[0],
  });

  const normalizedPhone = normalizePhone(form.phone);
  const activePhone = normalizePhone(activeUser.phone);
  const isAdmin = activeUser.isAdmin || ADMIN_PHONES.includes(activePhone);
  const showAdminPanel = viewMode === "admin" && isAdmin;

  const dateSlots = useMemo(() => getTimeSlotsForDate(form.date), [form.date]);
  const currentSpace = SPACES.find((space) => space.id === form.spaceId);
  const selectedReservation = reservations.find((item) => item.id === selectedReservationId) ?? null;

  const activeReservations = useMemo(() => {
    return reservations.filter((item) => item.status === "예약완료");
  }, [reservations]);

  const totalBookedCount = activeReservations.length;

  const dateSummaries = useMemo<DateSummary[]>(() => {
    return DATES.map((date) => {
      const dateReservations = activeReservations.filter((item) => item.date === date);
      const bySpace = SPACES.map((space) => {
        const booked = dateReservations.filter((item) => item.spaceId === space.id).length;
        return {
          spaceId: space.id,
          name: space.name,
          booked,
          remaining: Math.max(0, MAX_PER_SPACE_PER_DAY - booked),
        };
      });

      const booked = dateReservations.length;
      const remaining = bySpace.reduce((sum, item) => sum + item.remaining, 0);

      return { date, booked, remaining, bySpace };
    });
  }, [activeReservations]);

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
    return [...activeReservations].sort(compareReservations);
  }, [activeReservations]);

  const canSubmit = isAdmin || (activeUser.isVerified && activePhone === normalizedPhone && activeUser.name === form.name.trim());

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

      if (adminFlag) {
        setViewMode("admin");
      }

      await loadReservations();
      showMessage(adminFlag ? "관리자 번호가 확인되었습니다." : "예약자 확인이 완료되었습니다.", "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "이용자 확인에 실패했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!form.name.trim() || normalizedPhone.length !== 11) {
      showMessage("이름과 전화번호 11자리를 정확히 입력해 주세요.", "error");
      return;
    }

    if (!canSubmit) {
      showMessage("먼저 '예약자 확인'을 완료해 주세요.", "error");
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
          actorPhone: activePhone,
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

        showMessage(data.message || "예약이 완료되었습니다.", "success");
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
    <div className="min-h-screen bg-[#05070d] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_16%_16%,rgba(205,255,28,0.10),transparent_24%),radial-gradient(circle_at_88%_8%,rgba(205,160,255,0.12),transparent_22%),linear-gradient(180deg,#060914_0%,#03050a_100%)]" />

      <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 lg:py-10">
        <header className="text-center">
          <p className="text-xs font-black tracking-[0.26em] text-[#d7ff39]">LIME ZEST ACADEMY</p>
          <p className="mx-auto mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold text-white/60">
            데모데이 일정 변경 예약
          </p>

          <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-black leading-[1.18] tracking-[-0.04em] sm:text-5xl">
            데모데이 일정이 변경되었습니다
            <br />
            새 일정에 맞춰 다시 예약해 주세요
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-white/62">
            기존 데모데이 일정과 다르니 반드시 변경된 날짜를 확인한 뒤 신청해 주세요.
            <br />
            예약 가능일은 5월 23일, 26일, 27일, 28일, 29일이며 모든 예약은 10:00~21:00 사이 1시간 단위로 가능합니다.
          </p>

          <section className="mx-auto mt-6 max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
            <div className="grid gap-px bg-white/10 sm:grid-cols-2">
              <CompactNotice title="우선 선택권자" label="PRIORITY" accent="lime">
                5월 10일 12:00~22:00 먼저 신청 · 이후에는 남은 슬롯 기준
              </CompactNotice>
              <CompactNotice title="일반 신청자" label="GENERAL" accent="purple">
                5월 11일 12:00~22:00부터 신청 · 남은 슬롯 선착순
              </CompactNotice>
            </div>
            <div className="border-t border-white/10 px-4 py-3 text-left text-xs leading-5 text-white/72 sm:px-5">
              <p className="font-bold text-[#eaff8a]">신청 시간 이후에는 우선 선택권이 보장되지 않습니다.</p>
              <p className="mt-1">
                우선 선택권자가 5월 10일 신청 시간 내 예약하지 못한 경우, 5월 11일 일반 신청 시간에 함께 신청할 수 있습니다.
              </p>
              <p className="mt-1">단, 5월 11일부터는 모든 신청자가 남은 슬롯 기준 선착순으로 예약합니다.</p>
              <div className="mt-3 rounded-xl border border-[#d8a7ff]/25 bg-[#d8a7ff]/10 px-3 py-2 text-[#f0ddff]">
                <p className="font-black">문의는 전화가 아닌 디스코드 채널로 남겨주세요.</p>
                <p className="mt-1 text-white/70">
                  직원들이 디스코드 문의를 확인하며 순차적으로 응대할 예정입니다.
                </p>
              </div>
            </div>
          </section>
        </header>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-black tracking-[0.18em] text-[#d7ff39]/80">SUMMARY</p>
              <h2 className="mt-1 text-lg font-black">전체 신청 현황</h2>
            </div>
            <div className="rounded-xl border border-[#d7ff39]/25 bg-[#d7ff39]/10 px-4 py-2 text-right">
              <p className="text-xs font-bold text-[#d7ff39]/80">총 신청자</p>
              <p className="text-2xl font-black text-[#eaff8a]">{totalBookedCount}명</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {dateSummaries.map((summary) => (
              <DateSummaryCard key={summary.date} summary={summary} />
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1fr] lg:items-start">
          <div className="space-y-5">
            <Card
              eyebrow="STEP 1"
              title="예약자 확인"
              subtitle="등록된 이용자만 예약할 수 있습니다."
              side={
                activeUser.isVerified ? (
                  <Badge tone="success">{isAdmin ? "관리자 인증" : "확인 완료"}</Badge>
                ) : (
                  <Badge tone="muted">확인 필요</Badge>
                )
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="이름">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="이름을 입력해 주세요"
                    className={inputClassName}
                  />
                </Field>

                <Field label="전화번호">
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: onlyDigits(e.target.value) }))}
                    placeholder="숫자만 입력해 주세요"
                    maxLength={11}
                    className={inputClassName}
                  />
                </Field>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <PrimaryButton type="button" onClick={() => void handleIdentityApply()} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  예약자 확인
                </PrimaryButton>

                <SecondaryButton type="button" onClick={() => void loadReservations()} disabled={isLoadingReservations}>
                  {isLoadingReservations ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  현황 새로고침
                </SecondaryButton>
              </div>

              {isAdmin && (
                <SecondaryButton type="button" onClick={() => setViewMode((prev) => (prev === "admin" ? "user" : "admin"))}>
                  {showAdminPanel ? "관리자 화면 닫기" : "관리자 예약 관리 열기"}
                </SecondaryButton>
              )}

              <InfoMessage text={message} kind={messageKind} />
            </Card>

            <Card
              eyebrow="STEP 2"
              title="예약 신청"
              subtitle={currentSpace ? `${currentSpace.name} · ${currentSpace.capacity}` : undefined}
              side={<Badge tone={availableCount > 0 ? "success" : "danger"}>{availableCount}개 가능</Badge>}
            >
              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white/62">
                원하는 공간과 시간을 선택해 주세요. 예약은 1인 1회, 1시간만 가능합니다.
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
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
                      className={`rounded-xl border px-3.5 py-3 text-left transition ${
                        selected
                          ? "border-[#d7ff39]/55 bg-[#d7ff39]/10"
                          : "border-white/10 bg-[#101525]/70 hover:border-white/20"
                      }`}
                    >
                      <p className="text-sm font-black text-white">{space.name}</p>
                      <p className="mt-1 text-xs font-bold text-[#d7ff39]/80">{space.capacity}</p>
                      <p className="mt-2 text-xs leading-5 text-white/46">{space.desc}</p>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="날짜 선택">
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

                  <Field label="선택 공간">
                    <div className="rounded-xl border border-white/10 bg-[#101525] px-3.5 py-3 text-sm text-white/78">
                      {currentSpace?.name} · {currentSpace?.capacity}
                    </div>
                  </Field>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white/82">시간 선택</p>
                    <p className="text-xs text-white/42">선택한 날짜 기준</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {availableTimes.map(({ slot, taken, found }) => {
                      const selected = form.time === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={taken}
                          onClick={() => setForm((prev) => ({ ...prev, time: slot }))}
                          className={`min-h-[64px] rounded-xl border px-3 py-3 text-left text-sm font-bold transition active:scale-[0.98] ${
                            taken
                              ? "cursor-not-allowed border-white/8 bg-white/[0.03] text-white/32"
                              : selected
                                ? "border-[#d7ff39]/60 bg-[#d7ff39]/12 text-[#eaff8a]"
                                : "border-white/10 bg-[#101525]/80 text-white/78 hover:border-[#d7ff39]/35"
                          }`}
                        >
                          <div>{slot}</div>
                          <div className="mt-1 text-xs font-medium opacity-68">
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

                <div className="grid gap-2 sm:grid-cols-2">
                  <PrimaryButton type="submit" disabled={isSubmitting || isDuplicate}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {selectedReservation ? "예약 수정 저장" : "예약하기"}
                  </PrimaryButton>

                  {selectedReservation ? (
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        setSelectedReservationId(null);
                        showMessage("수정 모드를 취소했습니다.", "info");
                      }}
                    >
                      수정 취소
                    </SecondaryButton>
                  ) : (
                    <SecondaryButton type="button" onClick={() => void loadReservations()} disabled={isLoadingReservations}>
                      현황 다시 확인
                    </SecondaryButton>
                  )}
                </div>
              </form>
            </Card>
          </div>

          <div className="space-y-5 lg:sticky lg:top-5">
            {showAdminPanel && (
              <Card eyebrow="ADMIN" title="관리자 예약 관리" side={<Badge tone="success">{adminReservations.length}건</Badge>}>
                {adminReservations.length === 0 ? (
                  <EmptyState>현재 예약 내역이 없습니다.</EmptyState>
                ) : (
                  <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
                    {adminReservations.map((item) => (
                      <AdminReservationItem key={item.id} item={item} onEdit={handleEdit} onDelete={(id) => void handleDelete(id)} />
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card
              eyebrow="LIVE"
              title="현재 예약 현황"
              subtitle={`${currentSpace?.name ?? "공간"} · ${formatDate(form.date)}`}
              side={isLoadingReservations ? <Badge tone="muted">불러오는 중</Badge> : <Badge tone="success">실시간</Badge>}
            >
              {isLoadingReservations ? (
                <EmptyState>예약 현황을 불러오는 중입니다.</EmptyState>
              ) : (
                <div className="space-y-2">
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
                              <MiniButton onClick={() => handleEdit(found.id)}>수정</MiniButton>
                              <MiniGhostButton onClick={() => void handleDelete(found.id)}>삭제</MiniGhostButton>
                            </div>
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              )}
            </Card>

            <Card eyebrow="MY BOOKING" title="내 예약">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white/58">
                문의는 전화가 아닌 디스코드 채널로 남겨주세요. 직원들이 디스코드 문의를 확인하며 순차적으로 안내드립니다.
              </div>

              {myReservations.length === 0 ? (
                <EmptyState>아직 예약이 없습니다. 가능한 시간을 선택해 주세요.</EmptyState>
              ) : (
                <div className="space-y-2">
                  {myReservations.map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/10 bg-[#101525]/80 px-4 py-3">
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-sm font-black text-white">{getSpaceName(item.spaceId)}</p>
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
            </Card>
          </div>
        </section>
      </main>
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

function CompactNotice({ title, label, accent, children }: { title: string; label: string; accent: "lime" | "purple"; children: ReactNode }) {
  const accentClass = accent === "lime" ? "text-[#d7ff39]" : "text-[#d8a7ff]";

  return (
    <div className="bg-[#0d1323] px-4 py-3 text-left">
      <p className={`text-[11px] font-black tracking-[0.18em] ${accentClass}`}>{label}</p>
      <h2 className="mt-1 text-base font-black text-white">{title}</h2>
      <p className="mt-2 text-sm text-white/64">{children}</p>
    </div>
  );
}

function DateSummaryCard({ summary }: { summary: DateSummary }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1323]/80 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-white/58">{formatDate(summary.date)}</p>
          <p className="mt-1 text-xl font-black text-white">{summary.booked}명</p>
        </div>
        <p className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] font-bold text-white/50">잔여 {summary.remaining}</p>
      </div>

      <div className="mt-3 space-y-1.5">
        {summary.bySpace.map((space) => (
          <div key={space.spaceId} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-white/46">{space.name}</span>
            <span className="font-bold text-[#d7ff39]/78">{space.remaining}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ eyebrow, title, subtitle, side, children }: { eyebrow?: string; title: string; subtitle?: string; side?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? <p className="mb-1 text-[11px] font-black tracking-[0.16em] text-[#d7ff39]/78">{eyebrow}</p> : null}
          <h2 className="text-lg font-black tracking-[-0.02em] text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-white/45">{subtitle}</p> : null}
        </div>
        {side}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-white/72">{label}</p>
      {children}
    </div>
  );
}

function PrimaryButton({ children, type = "button", onClick, disabled }: { children: ReactNode; type?: "button" | "submit"; onClick?: MouseEventHandler<HTMLButtonElement>; disabled?: boolean }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#d7ff39] px-4 py-3 text-sm font-black text-[#07100b] transition hover:bg-[#e6ff6e] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, type = "button", onClick, disabled }: { children: ReactNode; type?: "button" | "submit"; onClick?: MouseEventHandler<HTMLButtonElement>; disabled?: boolean }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-bold text-white/75 transition hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
    >
      {children}
    </button>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "success" | "danger" | "muted" }) {
  const className =
    tone === "success"
      ? "bg-[#d7ff39]/10 text-[#d7ff39] border-[#d7ff39]/22"
      : tone === "danger"
        ? "bg-rose-400/12 text-rose-200 border-rose-300/20"
        : "bg-white/[0.06] text-white/48 border-white/10";

  return <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${className}`}>{children}</span>;
}

function StatusRow({ time, status, active = false, actions }: { time: string; status: string; active?: boolean; actions?: ReactNode }) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${active ? "border-[#d7ff39]/18 bg-[#d7ff39]/7" : "border-white/10 bg-[#101525]/80"}`}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-white">{time}</div>
            <div className="mt-1 text-xs text-white/38">선택 공간 기준</div>
          </div>
          <div className={`rounded-full px-2.5 py-1 text-[11px] font-black ${active ? "bg-[#d7ff39]/15 text-[#d7ff39]" : "bg-white/8 text-white/65"}`}>
            {status}
          </div>
        </div>
        {actions}
      </div>
    </div>
  );
}

function AdminReservationItem({ item, onEdit, onDelete }: { item: Reservation; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#101525]/80 px-3.5 py-3">
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-sm font-black text-white">
            {getSpaceName(item.spaceId)} · {formatDate(item.date)} · {item.time}
          </p>
          <p className="mt-1 text-xs text-white/48">
            {item.name} · {formatPhone(normalizePhone(item.phone))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <MiniButton onClick={() => onEdit(item.id)}>수정</MiniButton>
          <MiniGhostButton onClick={() => onDelete(item.id)}>삭제</MiniGhostButton>
        </div>
      </div>
    </div>
  );
}

function MiniButton({ children, onClick }: { children: ReactNode; onClick?: MouseEventHandler<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-[#d7ff39] px-3 py-1.5 text-xs font-black text-[#07100b] transition hover:bg-[#e6ff6e] active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function MiniGhostButton({ children, onClick }: { children: ReactNode; onClick?: MouseEventHandler<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-white/72 transition hover:bg-white/10 active:scale-[0.98]"
    >
      {children}
    </button>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-bold text-white/62">{children}</span>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-4 text-sm leading-6 text-white/50">
      {children}
    </div>
  );
}

function InfoMessage({ text, kind }: { text: string; kind: NoticeKind }) {
  if (!text) return null;

  const style =
    kind === "success"
      ? "border-[#d7ff39]/20 bg-[#d7ff39]/10 text-[#eaff8a]"
      : kind === "error"
        ? "border-rose-300/25 bg-rose-400/10 text-rose-100"
        : "border-white/10 bg-white/[0.05] text-white/75";

  const Icon = kind === "error" ? AlertCircle : CheckCircle2;

  return (
    <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm leading-6 ${style}`}>
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

function getTimeSlotsForDate(_dateString: string): string[] {
  return [...EVENT_SLOTS];
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
  getTimeSlotsForDate("2026-05-23").length === 11,
  getTimeSlotsForDate("2026-05-26").length === 11,
  getSpaceName("room-2") === "회의실 2",
  getSpaceName("multi-1") === "다목적실 1",
];

if (typeof window !== "undefined" && DEV_TEST_CASES.some((passed) => !passed)) {
  console.warn("ReservationLandingPage self-check failed.");
}
