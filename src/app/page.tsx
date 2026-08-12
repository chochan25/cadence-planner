"use client";

import { ChevronDown, Mic, MicOff, ThumbsDown, ThumbsUp } from "lucide-react";
import Image from "next/image";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useLocalPlans } from "@/hooks/use-local-plans";
import {
  fetchCalendarExport,
  fetchMorningBriefPreview,
  fetchPlanFromApi,
  fetchRealtimeSession,
  type PlanRequestPayload,
} from "@/lib/client-api";
import { durationLabelToMinutes } from "@/lib/duration";
import { recentFeedback, type SavedPlan } from "@/lib/local-plans";
import {
  type FeedbackItem,
  type PlanResponseBody,
  type PlanScheduleItem,
} from "@/lib/plan";
import { timelineAccent } from "@/lib/schedule-accent";
import { cn } from "@/lib/utils";

const cycleOptions = [
  { value: "menstrual", label: "Menstrual" },
  { value: "follicular", label: "Follicular" },
  { value: "ovulatory", label: "Ovulatory" },
  { value: "luteal", label: "Luteal" },
  { value: "none", label: "N/A / Not applicable" },
] as const;

type CyclePhaseValue = (typeof cycleOptions)[number]["value"];

function cycleDisplayLabel(storedPhase: string): string {
  if (storedPhase === "na") return "N/A / Not applicable";
  const o = cycleOptions.find((c) => c.value === storedPhase);
  return o?.label ?? storedPhase;
}

function formatHistoryCardTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function parseHourFromTimeLabel(label: string): number | null {
  const m = label.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  if (!Number.isFinite(hour)) return null;
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "am" && hour === 12) hour = 0;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (!meridiem && hour > 23) return null;
  return hour;
}

function deepWorkPatternSummary(plans: SavedPlan[]): string {
  const deepWorkItems = plans.flatMap((plan) =>
    plan.schedule.filter(
      (item) =>
        item.type.toLowerCase().includes("deep") ||
        item.task.toLowerCase().includes("deep work"),
    ),
  );
  if (deepWorkItems.length === 0) {
    return "No deep work pattern yet.";
  }

  const buckets = { morning: 0, afternoon: 0, evening: 0 };
  for (const item of deepWorkItems) {
    const hour = parseHourFromTimeLabel(item.time);
    if (hour == null) continue;
    if (hour < 12) buckets.morning += 1;
    else if (hour < 17) buckets.afternoon += 1;
    else buckets.evening += 1;
  }

  const entries = Object.entries(buckets) as Array<[keyof typeof buckets, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [topBucket, topCount] = entries[0];
  if (topCount <= 0) return "Deep work exists, but timing is mixed.";
  const label =
    topBucket === "morning"
      ? "mostly in the morning"
      : topBucket === "afternoon"
        ? "mostly in the afternoon"
        : "mostly in the evening";
  return `${label} (${topCount}/${deepWorkItems.length} blocks).`;
}

function readSliderValue(change: readonly number[] | number) {
  if (typeof change === "number") return change;
  return change[0] ?? 5;
}

type PlanInputsSnapshot = {
  sleep: number;
  energy: number;
  clarity: number;
  cyclePhase: string | null;
};

/**
 * Returns adaptation bullet copy derived from the inputs that produced the
 * current plan. Empty array means "no adaptations to call out" — caller should
 * skip rendering the banner.
 */
function buildAdaptationMessages(input: PlanInputsSnapshot): string[] {
  const messages: string[] = [];
  if (input.sleep < 5) {
    messages.push("Deep work moved to afternoon (sleep debt detected)");
  }
  if (input.cyclePhase === "luteal" || input.cyclePhase === "menstrual") {
    messages.push(`Recovery blocks added (${input.cyclePhase} phase)`);
  }
  if (input.energy < 4) {
    messages.push("Workout downgraded to gentle walk (low energy)");
  }
  return messages;
}

const PERSONA_PRESETS = [
  {
    id: "maya",
    title: "👩 Maya - Working Mom",
    subtitle: "Slept 4hrs, luteal phase, exhausted",
    sleep: 4,
    energy: 3,
    clarity: 4,
    cyclePhase: "luteal" as const,
    tasks:
      "School drop-off and pickup, 9am product sync, finish client deck, grocery run, prep dinner, 20min stretch",
  },
  {
    id: "james",
    title: "👨 James - Startup Founder",
    subtitle: "Slept 7hrs, well-rested, high energy",
    sleep: 7,
    energy: 8,
    clarity: 8,
    cyclePhase: "none" as const,
    tasks:
      "Investor deck, standup, code review, gym, dinner with partner",
  },
  {
    id: "priya",
    title: "👩‍🎓 Priya - Student",
    subtitle: "Slept 3hrs, exam stress, menstrual",
    sleep: 3,
    energy: 2,
    clarity: 3,
    cyclePhase: "menstrual" as const,
    tasks:
      "Revise biochemistry chapters 4-6, practice exam questions, attend lab, email professor, group-study call, early wind-down",
  },
] as const;

type VoiceCheckInStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "applied"
  | "error";

type CheckInToolCall = {
  argumentsJson: string;
  callId: string | null;
};

const CHECKIN_TOOL_NAME = "set_checkin_inputs";
const VOICE_EXTRACTION_TIMEOUT_MS = 8000;

function feedbackKey(time: string, task: string): string {
  return `${time}::${task}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readVoiceRating(value: unknown): number | null {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(raw)) return null;
  return Math.min(10, Math.max(1, Math.round(raw)));
}

function normalizeVoiceCyclePhase(value: unknown): CyclePhaseValue | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "n/a" || normalized === "na" || normalized === "none") {
    return "none";
  }
  const option = cycleOptions.find((item) => item.value === normalized);
  return option?.value ?? null;
}

function readVoiceTasks(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const lines = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return lines.length > 0 ? lines.join("\n") : null;
  }
  return null;
}

function parseCheckInArguments(argumentsJson: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(argumentsJson);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function realtimeCallKey(value: Record<string, unknown>): string | null {
  if (typeof value.call_id === "string") return `call:${value.call_id}`;
  if (typeof value.item_id === "string") return `item:${value.item_id}`;
  if (isRecord(value.item)) return realtimeCallKey(value.item);
  return null;
}

function realtimeCallId(value: Record<string, unknown>): string | null {
  if (typeof value.call_id === "string") return value.call_id;
  if (isRecord(value.item) && typeof value.item.call_id === "string") {
    return value.item.call_id;
  }
  return null;
}

function realtimeToolName(value: Record<string, unknown>): string | null {
  if (typeof value.name === "string") return value.name;
  if (isRecord(value.item) && typeof value.item.name === "string") {
    return value.item.name;
  }
  return null;
}

function realtimeToolArguments(value: Record<string, unknown>): string | null {
  if (typeof value.arguments === "string") return value.arguments;
  if (isRecord(value.item) && typeof value.item.arguments === "string") {
    return value.item.arguments;
  }
  return null;
}

function toolCallFromRealtimeItem(item: unknown): CheckInToolCall | null {
  if (
    !isRecord(item) ||
    item.type !== "function_call" ||
    item.name !== CHECKIN_TOOL_NAME ||
    typeof item.arguments !== "string"
  ) {
    return null;
  }

  return {
    argumentsJson: item.arguments,
    callId: typeof item.call_id === "string" ? item.call_id : null,
  };
}

function extractCheckInToolCalls(
  event: unknown,
  bufferedArguments?: Map<string, string>,
): CheckInToolCall[] {
  if (!isRecord(event)) return [];

  if (event.type === "response.function_call_arguments.done") {
    const name = realtimeToolName(event);
    const key = realtimeCallKey(event);
    const argumentsJson =
      realtimeToolArguments(event) ?? (key ? bufferedArguments?.get(key) : null);
    if (name && name !== CHECKIN_TOOL_NAME) return [];
    if (!argumentsJson) return [];
    return [
      {
        argumentsJson,
        callId: realtimeCallId(event),
      },
    ];
  }

  if (
    event.type === "response.output_item.done" ||
    event.type === "conversation.item.created"
  ) {
    const call = toolCallFromRealtimeItem(event.item);
    return call ? [call] : [];
  }

  if (event.type !== "response.done" || !isRecord(event.response)) {
    return [];
  }

  const output = event.response.output;
  if (!Array.isArray(output)) return [];

  return output.flatMap((item): CheckInToolCall[] => {
    const call = toolCallFromRealtimeItem(item);
    return call ? [call] : [];
  });
}

/** Only allow http(s); strips common trailing punctuation from the match. */
function safeHttpHref(raw: string): string | null {
  const trimmed = raw.replace(/[),.;:!?]+$/g, "");
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Turn raw https?://… substrings into real anchors (model output is otherwise plain text). */
function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(\bhttps?:\/\/[^\s<]+)/gi);
  return (
    <>
      {parts.map((part, i) => {
        const href = safeHttpHref(part);
        if (href) {
          const display = part.replace(/[),.;:!?]+$/g, "");
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium underline underline-offset-2 hover:opacity-90"
            >
              {display}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

function canUseBrowserSpeech(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.speechSynthesis.speak === "function"
  );
}

function summarizeSpeakApiError(body: string, status: number): string {
  try {
    const j = JSON.parse(body) as {
      error?: unknown;
      detail?: unknown;
      message?: unknown;
    };

    if (typeof j.error === "string" && j.error.trim()) {
      return j.error.trim().slice(0, 420);
    }

    const detail = j.detail;
    if (detail != null && typeof detail === "object" && !Array.isArray(detail)) {
      const o = detail as Record<string, unknown>;
      const code = o.status != null ? String(o.status) : "";
      const msg = o.message != null ? String(o.message) : "";
      const combined = [code, msg].filter(Boolean).join(": ");
      if (combined) return combined.slice(0, 420);
      return JSON.stringify(detail).slice(0, 420);
    }

    if (typeof detail === "string") {
      return detail.slice(0, 420);
    }

    const flat =
      j.message != null
        ? String(j.message)
        : j.error != null
          ? String(j.error)
          : "";

    if (flat) return flat.slice(0, 420);
  } catch {
    /* noop */
  }
  return `Speech request failed (HTTP ${status}).`;
}

/** Best-effort Web Speech playback; picks an English voice when the list is ready. */
function speakWithBrowserSynth(text: string) {
  const syn = window.speechSynthesis;
  syn.cancel();
  let spoken = false;

  const run = () => {
    if (spoken) return;
    spoken = true;
    syn.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98;
    const vs = syn.getVoices();
    const en =
      vs.find((v) => /^en(-|$)/i.test(v.lang)) ??
      vs.find((v) => v.lang.toLowerCase().startsWith("en")) ??
      vs[0];
    if (en) u.voice = en;
    syn.speak(u);
  };
  if (syn.getVoices().length > 0) {
    run();
    return;
  }
  const onVoices = () => {
    syn.removeEventListener("voiceschanged", onVoices);
    run();
  };
  syn.addEventListener("voiceschanged", onVoices);
  queueMicrotask(() => {
    if (syn.getVoices().length > 0) {
      syn.removeEventListener("voiceschanged", onVoices);
      run();
    } else if (!spoken) {
      run();
      syn.removeEventListener("voiceschanged", onVoices);
    }
  });
}

function LinkifiedBlock({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.split("\n");
  return (
    <span className={className}>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 ? <br /> : null}
          <LinkifiedText text={line} />
        </React.Fragment>
      ))}
    </span>
  );
}

function RatingSlider(props: {
  id: string;
  label: string;
  description: string;
  value: number;
  onValueChange: (value: number) => void;
}) {
  const { id, label, description, value, onValueChange } = props;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={id} className="text-foreground">
            {label}
          </Label>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        </div>
        <span
          aria-live="polite"
          className="text-muted-foreground tabular-nums text-sm font-medium tracking-tight"
        >
          {value}
          <span className="sr-only">out of ten</span>
        </span>
      </div>
      <Slider
        id={id}
        min={1}
        max={10}
        step={1}
        value={[value]}
        onValueChange={(next) =>
          onValueChange(readSliderValue(next as readonly number[] | number))
        }
      />
      <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>1</span>
        <span>10</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [sleepQuality, setSleepQuality] = React.useState(5);
  const [bodyEnergy, setBodyEnergy] = React.useState(5);
  const [mentalClarity, setMentalClarity] = React.useState(5);
  const [cyclePhase, setCyclePhase] = React.useState<CyclePhaseValue | null>(
    null,
  );
  const [tasks, setTasks] = React.useState("");
  const [plan, setPlan] = React.useState<PlanResponseBody | null>(null);
  const [planInputs, setPlanInputs] =
    React.useState<PlanInputsSnapshot | null>(null);
  const [planError, setPlanError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [morningBriefLoading, setMorningBriefLoading] = React.useState(false);
  const [morningBriefError, setMorningBriefError] = React.useState<string | null>(
    null,
  );
  const [morningBriefOpen, setMorningBriefOpen] = React.useState(false);
  const [morningBriefSubject, setMorningBriefSubject] = React.useState("");
  const [morningBriefHtml, setMorningBriefHtml] = React.useState("");
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([]);
  const [currentPlanId, setCurrentPlanId] = React.useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = React.useState<{
    message: string;
    tone: "positive" | "negative" | "info";
  } | null>(null);
  const [speakLoading, setSpeakLoading] = React.useState(false);
  const [speakError, setSpeakError] = React.useState<string | null>(null);
  const [speakAwaitingTap, setSpeakAwaitingTap] = React.useState(false);
  const [speakSynthAwaitingTap, setSpeakSynthAwaitingTap] =
    React.useState(false);
  const [speakHint, setSpeakHint] = React.useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] =
    React.useState<VoiceCheckInStatus>("idle");
  const [voiceMessage, setVoiceMessage] = React.useState<string | null>(null);
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [exportingCalendar, setExportingCalendar] = React.useState(false);
  const [exportCalendarError, setExportCalendarError] = React.useState<
    string | null
  >(null);
  const [insightReferenceNow] = React.useState(() => Date.now());
  const speakObjectUrlRef = React.useRef<string | null>(null);
  const speakAwaitingTapRef = React.useRef(false);
  const speakSynthAwaitingTapRef = React.useRef(false);
  const pendingSynthTextRef = React.useRef<string | null>(null);
  const speakAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const speakCtxRef = React.useRef<AudioContext | null>(null);
  const voiceAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const voicePeerRef = React.useRef<RTCPeerConnection | null>(null);
  const voiceDataChannelRef = React.useRef<RTCDataChannel | null>(null);
  const voiceStreamRef = React.useRef<MediaStream | null>(null);
  const voiceAppliedRef = React.useRef(false);
  const voiceResponseRequestedRef = React.useRef(false);
  const voiceAttemptRef = React.useRef(0);
  const voiceExtractionTimeoutRef = React.useRef<number | null>(null);
  const voiceArgumentBuffersRef = React.useRef<Map<string, string>>(
    new Map<string, string>(),
  );

  const { plans: localPlans, savePlan, saveFeedback } = useLocalPlans();
  const recentPlans = localPlans?.slice(0, 7) ?? null;
  const allPlans = localPlans;
  const savedFeedback = React.useMemo(
    () => recentFeedback(localPlans ?? []),
    [localPlans],
  );
  const [expandedHistoryId, setExpandedHistoryId] = React.useState<
    string | null
  >(null);

  const stopVoiceCheckIn = React.useCallback(
    (nextStatus?: VoiceCheckInStatus) => {
      voiceAttemptRef.current += 1;
      if (voiceExtractionTimeoutRef.current !== null) {
        window.clearTimeout(voiceExtractionTimeoutRef.current);
        voiceExtractionTimeoutRef.current = null;
      }
      voiceResponseRequestedRef.current = false;
      voiceArgumentBuffersRef.current.clear();

      const channel = voiceDataChannelRef.current;
      voiceDataChannelRef.current = null;
      try {
        if (channel && channel.readyState !== "closed") channel.close();
      } catch {
        /* noop */
      }

      const peer = voicePeerRef.current;
      voicePeerRef.current = null;
      try {
        if (peer && peer.connectionState !== "closed") peer.close();
      } catch {
        /* noop */
      }

      const stream = voiceStreamRef.current;
      voiceStreamRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());

      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause();
        voiceAudioRef.current.srcObject = null;
      }

      if (nextStatus) setVoiceStatus(nextStatus);
    },
    [],
  );

  const historyCards = React.useMemo(() => {
    if (!recentPlans) return [];
    return [...recentPlans]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);
  }, [recentPlans]);

  const insights = React.useMemo(() => {
    if (!allPlans) return null;
    const sevenDaysAgo = insightReferenceNow - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = allPlans.filter((p) => p.createdAt >= sevenDaysAgo);
    const averageSleep =
      thisWeek.length > 0
        ? thisWeek.reduce((sum, p) => sum + p.sleep, 0) / thisWeek.length
        : null;
    const estimatedPhase = allPlans[0]?.cyclePhase ?? null;
    const totalPlans = allPlans.length;
    return {
      averageSleep,
      estimatedPhase,
      deepWorkPattern: deepWorkPatternSummary(allPlans),
      totalPlans,
    };
  }, [allPlans, insightReferenceNow]);

  React.useEffect(() => {
    return () => {
      if (speakObjectUrlRef.current) {
        URL.revokeObjectURL(speakObjectUrlRef.current);
        speakObjectUrlRef.current = null;
      }
      speakAwaitingTapRef.current = false;
      speakSynthAwaitingTapRef.current = false;
      pendingSynthTextRef.current = null;
      if (
        typeof window !== "undefined" &&
        "speechSynthesis" in window
      ) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  React.useEffect(() => {
    return () => stopVoiceCheckIn();
  }, [stopVoiceCheckIn]);

  React.useEffect(() => {
    if (speakObjectUrlRef.current) {
      URL.revokeObjectURL(speakObjectUrlRef.current);
      speakObjectUrlRef.current = null;
    }
    speakAwaitingTapRef.current = false;
    speakSynthAwaitingTapRef.current = false;
    pendingSynthTextRef.current = null;
    queueMicrotask(() => {
      setSpeakAwaitingTap(false);
      setSpeakSynthAwaitingTap(false);
      setSpeakHint(null);
      setSpeakError(null);
    });
  }, [plan]);

  const downvotedKeys = React.useMemo(
    () =>
      new Set(
        feedback
          .filter((item) => item.sentiment === "negative")
          .map((item) => feedbackKey(item.time, item.task)),
      ),
    [feedback],
  );
  const upvotedKeys = React.useMemo(
    () =>
      new Set(
        feedback
          .filter((item) => item.sentiment === "positive")
          .map((item) => feedbackKey(item.time, item.task)),
      ),
    [feedback],
  );

  React.useEffect(() => {
    if (!feedbackToast) return;
    const timer = setTimeout(() => setFeedbackToast(null), 3000);
    return () => clearTimeout(timer);
  }, [feedbackToast]);

  function clearVoiceExtractionTimeout() {
    if (voiceExtractionTimeoutRef.current === null) return;
    window.clearTimeout(voiceExtractionTimeoutRef.current);
    voiceExtractionTimeoutRef.current = null;
  }

  function armVoiceExtractionTimeout() {
    clearVoiceExtractionTimeout();
    voiceExtractionTimeoutRef.current = window.setTimeout(() => {
      if (voiceAppliedRef.current) return;
      setVoiceStatus("error");
      setVoiceError(
        "I heard you, but couldn't extract inputs. Try one more sentence with numbers.",
      );
      stopVoiceCheckIn();
    }, VOICE_EXTRACTION_TIMEOUT_MS);
  }

  function requestVoiceCheckInResponse(channel: RTCDataChannel) {
    if (
      voiceResponseRequestedRef.current ||
      channel.readyState !== "open" ||
      voiceAppliedRef.current
    ) {
      return;
    }

    voiceResponseRequestedRef.current = true;
    setVoiceStatus("processing");
    setVoiceMessage("Processing your check-in...");
    armVoiceExtractionTimeout();
    channel.send(
      JSON.stringify({
        type: "response.create",
        response: {
          output_modalities: ["text"],
          max_output_tokens: 512,
        },
      }),
    );
  }

  function applyVoiceCheckInInputs(args: Record<string, unknown>): boolean {
    const filled: string[] = [];

    const sleep = readVoiceRating(args.sleep);
    if (sleep !== null) {
      setSleepQuality(sleep);
      filled.push("sleep");
    }

    const energy = readVoiceRating(args.energy);
    if (energy !== null) {
      setBodyEnergy(energy);
      filled.push("energy");
    }

    const clarity = readVoiceRating(args.clarity);
    if (clarity !== null) {
      setMentalClarity(clarity);
      filled.push("clarity");
    }

    const phase = normalizeVoiceCyclePhase(args.cyclePhase);
    if (phase !== null) {
      setCyclePhase(phase);
      filled.push("cycle phase");
    }

    const nextTasks = readVoiceTasks(args.tasks);
    if (nextTasks !== null) {
      setTasks(nextTasks);
      filled.push("tasks");
    }

    if (filled.length === 0) {
      setVoiceError("I could not map that check-in to the form yet.");
      setVoiceStatus("error");
      return false;
    }

    setVoiceError(null);
    setVoiceStatus("applied");
    setVoiceMessage(
      `Filled ${filled.join(", ")} from your voice check-in. Review and edit before generating your plan.`,
    );
    return true;
  }

  function handleCheckInToolCall(call: CheckInToolCall, channel: RTCDataChannel) {
    if (voiceAppliedRef.current) return;
    voiceAppliedRef.current = true;
    clearVoiceExtractionTimeout();

    const parsed = parseCheckInArguments(call.argumentsJson);
    const applied = parsed ? applyVoiceCheckInInputs(parsed) : false;

    if (!parsed) {
      setVoiceError("Voice check-in returned unreadable form inputs.");
      setVoiceStatus("error");
    }

    if (call.callId && channel.readyState === "open") {
      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: JSON.stringify({ ok: applied }),
          },
        }),
      );
    }

    window.setTimeout(() => stopVoiceCheckIn(applied ? "applied" : "error"), 250);
  }

  async function handleVoiceCheckIn() {
    const voiceBusy =
      voiceStatus === "connecting" ||
      voiceStatus === "listening" ||
      voiceStatus === "processing";

    if (voiceBusy) {
      stopVoiceCheckIn("idle");
      setVoiceMessage("Voice check-in stopped.");
      setVoiceError(null);
      return;
    }

    if (
      typeof window === "undefined" ||
      typeof RTCPeerConnection === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setVoiceStatus("error");
      setVoiceError("This browser cannot start a WebRTC voice check-in.");
      return;
    }

    setVoiceStatus("connecting");
    setVoiceMessage(null);
    setVoiceError(null);
    voiceAppliedRef.current = false;
    voiceResponseRequestedRef.current = false;
    voiceArgumentBuffersRef.current.clear();
    clearVoiceExtractionTimeout();
    const attemptId = voiceAttemptRef.current + 1;
    voiceAttemptRef.current = attemptId;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (voiceAttemptRef.current !== attemptId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      voiceStreamRef.current = stream;

      const session = await fetchRealtimeSession();
      if (voiceAttemptRef.current !== attemptId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!session.ok) {
        throw new Error(session.error);
      }

      const peer = new RTCPeerConnection();
      voicePeerRef.current = peer;

      peer.ontrack = (event) => {
        if (voiceAudioRef.current) {
          voiceAudioRef.current.srcObject = event.streams[0];
        }
      };

      peer.addEventListener("connectionstatechange", () => {
        if (voicePeerRef.current !== peer) return;
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "disconnected"
        ) {
          setVoiceStatus("error");
          setVoiceError("Voice check-in disconnected.");
          stopVoiceCheckIn();
        }
      });

      for (const track of stream.getAudioTracks()) {
        peer.addTrack(track, stream);
      }

      const channel = peer.createDataChannel("oai-events");
      voiceDataChannelRef.current = channel;

      channel.addEventListener("open", () => {
        setVoiceStatus("listening");
        setVoiceMessage("Listening. Pause after your check-in to fill the form.");
      });

      channel.addEventListener("message", (event) => {
        let serverEvent: unknown;
        try {
          serverEvent = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (isRecord(serverEvent)) {
          if (serverEvent.type === "input_audio_buffer.speech_stopped") {
            setVoiceStatus("processing");
            setVoiceMessage("Processing your check-in...");
            armVoiceExtractionTimeout();
            window.setTimeout(() => requestVoiceCheckInResponse(channel), 350);
          }

          if (serverEvent.type === "input_audio_buffer.committed") {
            requestVoiceCheckInResponse(channel);
          }

          if (serverEvent.type === "response.created") {
            setVoiceStatus("processing");
            setVoiceMessage("Processing your check-in...");
            armVoiceExtractionTimeout();
          }

          if (
            serverEvent.type === "response.function_call_arguments.delta" &&
            typeof serverEvent.delta === "string"
          ) {
            const key = realtimeCallKey(serverEvent);
            if (key) {
              const current = voiceArgumentBuffersRef.current.get(key) ?? "";
              voiceArgumentBuffersRef.current.set(key, current + serverEvent.delta);
            }
          }

          if (serverEvent.type === "error") {
            const message =
              isRecord(serverEvent.error) &&
              typeof serverEvent.error.message === "string"
                ? serverEvent.error.message
                : "Voice check-in failed.";
            setVoiceStatus("error");
            setVoiceError(message);
            stopVoiceCheckIn();
            return;
          }
        }

        const calls = extractCheckInToolCalls(
          serverEvent,
          voiceArgumentBuffersRef.current,
        );
        if (calls.length > 0) {
          handleCheckInToolCall(calls[0], channel);
        }
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (voiceAttemptRef.current !== attemptId) return;

      if (!offer.sdp) {
        throw new Error("Could not create a WebRTC offer.");
      }

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.data.clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });

      const answerSdp = await sdpResponse.text();
      if (voiceAttemptRef.current !== attemptId) return;
      if (!sdpResponse.ok) {
        throw new Error(
          answerSdp.trim() || `Realtime call failed (${sdpResponse.status})`,
        );
      }

      await peer.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });
    } catch (err) {
      if (voiceAttemptRef.current !== attemptId) return;
      stopVoiceCheckIn();
      setVoiceStatus("error");
      setVoiceError(
        err instanceof Error
          ? err.message.slice(0, 300)
          : "Could not start voice check-in.",
      );
    }
  }

  function handleThumbsDown(item: PlanScheduleItem) {
    const key = feedbackKey(item.time, item.task);
    const wasDownvoted = feedback.some(
      (entry) =>
        feedbackKey(entry.time, entry.task) === key &&
        entry.sentiment === "negative",
    );

    const withoutItem = feedback.filter(
      (entry) => feedbackKey(entry.time, entry.task) !== key,
    );
    const nextFeedback = wasDownvoted
      ? withoutItem
      : [
          ...withoutItem,
          {
            task: item.task,
            time: item.time,
            type: item.type,
            sentiment: "negative" as const,
          },
        ];
    setFeedback(nextFeedback);
    if (currentPlanId) saveFeedback(currentPlanId, nextFeedback);
    setFeedbackToast({
      message: wasDownvoted
        ? "Feedback cleared"
        : "Feedback saved in this browser — next plan will adapt",
      tone: wasDownvoted ? "info" : "negative",
    });
  }

  function handleThumbsUp(item: PlanScheduleItem) {
    const key = feedbackKey(item.time, item.task);
    const wasUpvoted = feedback.some(
      (entry) =>
        feedbackKey(entry.time, entry.task) === key &&
        entry.sentiment === "positive",
    );

    const withoutItem = feedback.filter(
      (entry) => feedbackKey(entry.time, entry.task) !== key,
    );
    const nextFeedback = wasUpvoted
      ? withoutItem
      : [
          ...withoutItem,
          {
            task: item.task,
            time: item.time,
            type: item.type,
            sentiment: "positive" as const,
          },
        ];
    setFeedback(nextFeedback);
    if (currentPlanId) saveFeedback(currentPlanId, nextFeedback);
    setFeedbackToast({
      message: wasUpvoted
        ? "Feedback cleared"
        : "Feedback saved in this browser — next plan will adapt",
      tone: wasUpvoted ? "info" : "positive",
    });
  }

  async function handleGeneratePlan(
    override?: Pick<
      PlanRequestPayload,
      "sleep" | "energy" | "clarity" | "cyclePhase" | "tasks" | "feedback"
    >,
  ) {
    const sleep = override?.sleep ?? sleepQuality;
    const energy = override?.energy ?? bodyEnergy;
    const clarity = override?.clarity ?? mentalClarity;
    const phase = override?.cyclePhase ?? cyclePhase;
    const nextTasks = override?.tasks ?? tasks;
    const nextFeedback = override?.feedback ?? savedFeedback;

    setPlanError(null);
    setExportCalendarError(null);
    setSubmitting(true);
    try {
      const result = await fetchPlanFromApi({
        sleep,
        energy,
        clarity,
        cyclePhase: phase,
        tasks: nextTasks,
        feedback: nextFeedback.length > 0 ? nextFeedback : undefined,
      });
      if (!result.ok) {
        setPlanError(result.error);
        return;
      }
      const payload = result.data;
      const createdAt = Date.now();
      setPlan(payload);
      setPlanInputs({
        sleep,
        energy,
        clarity,
        cyclePhase: phase,
      });
      setFeedback([]);
      const savedPlanId = savePlan({
        createdAt,
        sleep,
        energy,
        clarity,
        cyclePhase: phase ?? "none",
        tasks: nextTasks,
        rationale: payload.rationale,
        schedule: payload.schedule.map((item) => ({
          time: item.time,
          task: item.task,
          type: item.type,
          duration: durationLabelToMinutes(item.duration),
        })),
        feedback: [],
      });
      setCurrentPlanId(savedPlanId);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExportCalendar() {
    if (!plan || exportingCalendar) return;
    setExportCalendarError(null);
    setExportingCalendar(true);
    try {
      const result = await fetchCalendarExport(plan.schedule);
      if (!result.ok) {
        setExportCalendarError(result.error);
        return;
      }

      const blob = new Blob([result.data.fileContents], {
        type: "text/calendar;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.data.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setExportingCalendar(false);
    }
  }

  async function handleSendMorningBrief() {
    if (!plan) return;
    setMorningBriefError(null);
    setMorningBriefLoading(true);
    try {
      const result = await fetchMorningBriefPreview({
        createdAt: Date.now(),
        tasks,
        schedule: plan.schedule,
        rationale: plan.rationale,
      });
      if (!result.ok) {
        setMorningBriefError(result.error);
        return;
      }
      setMorningBriefSubject(result.data.subject);
      setMorningBriefHtml(result.data.html);
      setMorningBriefOpen(true);
    } finally {
      setMorningBriefLoading(false);
    }
  }

  async function handlePersonaSelect(
    persona: (typeof PERSONA_PRESETS)[number],
  ) {
    setSleepQuality(persona.sleep);
    setBodyEnergy(persona.energy);
    setMentalClarity(persona.clarity);
    setCyclePhase(persona.cyclePhase);
    setTasks(persona.tasks);
    setFeedback([]);
    await handleGeneratePlan({
      sleep: persona.sleep,
      energy: persona.energy,
      clarity: persona.clarity,
      cyclePhase: persona.cyclePhase,
      tasks: persona.tasks,
    });
  }

  async function handlePlayRationale(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    // Workaround: browser TTS (same second-tap gesture requirement as HTMLAudio).
    if (speakSynthAwaitingTapRef.current && pendingSynthTextRef.current) {
      const synthText = pendingSynthTextRef.current;
      setSpeakHint(null);
      setSpeakError(null);
      speakWithBrowserSynth(synthText);
      speakSynthAwaitingTapRef.current = false;
      pendingSynthTextRef.current = null;
      setSpeakSynthAwaitingTap(false);
      return;
    }

    // Second gesture: play() runs in same synchronous turn as tap (fixes Safari /
    // Chrome blocking play() after await fetch() consumed user activation).
    if (speakAwaitingTapRef.current && speakObjectUrlRef.current) {
      const url = speakObjectUrlRef.current;
      setSpeakHint(null);
      setSpeakError(null);
      const el = speakAudioRef.current;
      try {
        const onEnded = () => {
          if (speakObjectUrlRef.current === url) {
            URL.revokeObjectURL(url);
            speakObjectUrlRef.current = null;
          }
        };
        if (el) {
          el.pause();
          el.onended = onEnded;
          el.src = url;
          el.volume = 1;
          void el
            .play()
            .then(() => {
              speakAwaitingTapRef.current = false;
              setSpeakAwaitingTap(false);
            })
            .catch((err: unknown) => {
              setSpeakError(
                err instanceof Error ? err.message.slice(0, 300) : "Play failed.",
              );
            });
        } else {
          const a = new Audio(url);
          a.onended = onEnded;
          void a
            .play()
            .then(() => {
              speakAwaitingTapRef.current = false;
              setSpeakAwaitingTap(false);
            })
            .catch((err: unknown) => {
              setSpeakError(
                err instanceof Error
                  ? err.message.slice(0, 300)
                  : "Play failed.",
              );
            });
        }
      } catch (e) {
        setSpeakError(
          e instanceof Error ? e.message.slice(0, 300) : "Could not play audio.",
        );
      }
      return;
    }

    setSpeakLoading(true);
    setSpeakError(null);
    setSpeakHint(null);
    speakAwaitingTapRef.current = false;
    setSpeakAwaitingTap(false);
    speakSynthAwaitingTapRef.current = false;
    pendingSynthTextRef.current = null;
    setSpeakSynthAwaitingTap(false);
    try {
      const Ctor =
        typeof window !== "undefined"
          ? window.AudioContext ??
            (
              window as unknown as {
                webkitAudioContext?: typeof AudioContext;
              }
            ).webkitAudioContext ??
            null
          : null;
      if (Ctor) {
        try {
          if (!speakCtxRef.current) speakCtxRef.current = new Ctor();
          void speakCtxRef.current.resume().catch(() => {});
        } catch {
          /* noop */
        }
      }

      if (speakObjectUrlRef.current) {
        URL.revokeObjectURL(speakObjectUrlRef.current);
        speakObjectUrlRef.current = null;
      }

      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      const resCt = res.headers.get("content-type") ?? "";

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        const humanErr = summarizeSpeakApiError(errBody, res.status);
        if (canUseBrowserSpeech()) {
          try {
            void window.speechSynthesis.getVoices();
          } catch {
            /* noop */
          }
          pendingSynthTextRef.current = trimmed;
          speakSynthAwaitingTapRef.current = true;
          setSpeakSynthAwaitingTap(true);
          const errShort =
            humanErr.length > 200 ? `${humanErr.slice(0, 200)}…` : humanErr;
          setSpeakHint(
            `Couldn't use cloud text-to-speech (${errShort}). Tap once more — this page will read the rationale aloud in your browser.`,
          );
          return;
        }

        setSpeakError(humanErr);
        return;
      }

      const blob = await res.blob();
      if (!blob.size) {
        setSpeakError("Empty audio response from the server.");
        return;
      }

      const typedBlob = new Blob([blob], {
        type: resCt.includes("mpeg") ? resCt : "audio/mpeg",
      });

      const url = URL.createObjectURL(typedBlob);
      speakObjectUrlRef.current = url;
      speakAwaitingTapRef.current = true;
      setSpeakAwaitingTap(true);
      setSpeakHint("Audio ready — tap the button once more to play.");
    } catch (e) {
      speakAwaitingTapRef.current = false;
      setSpeakAwaitingTap(false);
      speakSynthAwaitingTapRef.current = false;
      pendingSynthTextRef.current = null;
      setSpeakSynthAwaitingTap(false);
      setSpeakHint(null);
      setSpeakError(
        e instanceof Error
          ? e.message.slice(0, 300)
          : "Could not play audio.",
      );
      if (speakObjectUrlRef.current) {
        URL.revokeObjectURL(speakObjectUrlRef.current);
        speakObjectUrlRef.current = null;
      }
    } finally {
      setSpeakLoading(false);
    }
  }

  function handleScrollToTuneInputs() {
    document
      .getElementById("tune-inputs")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const phaseLabel =
    cycleOptions.find((o) => o.value === cyclePhase)?.label ?? "";
  const voiceBusy =
    voiceStatus === "connecting" ||
    voiceStatus === "listening" ||
    voiceStatus === "processing";
  const voiceStatusText =
    voiceError ??
    voiceMessage ??
    (voiceStatus === "connecting"
      ? "Connecting..."
      : voiceStatus === "listening"
        ? "Listening."
        : voiceStatus === "processing"
          ? "Processing..."
          : null);

  return (
    <main className="relative min-h-dvh">
      {/* Hidden element for playback (playsInline improves iOS; avoids some autoplay quirks). */}
      <audio ref={speakAudioRef} className="sr-only" preload="none" playsInline />
      <audio ref={voiceAudioRef} className="sr-only" autoPlay playsInline />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.12),transparent)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.09),transparent)]"
      />

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      >
        {feedbackToast ? (
          <div
            className={cn(
              "pointer-events-auto inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur",
              "bg-background/95 supports-[backdrop-filter]:bg-background/70",
              feedbackToast.tone === "positive" &&
                "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
              feedbackToast.tone === "negative" &&
                "border-destructive/50 text-destructive",
              feedbackToast.tone === "info" &&
                "border-border text-foreground",
            )}
          >
            {feedbackToast.tone === "positive" ? (
              <ThumbsUp aria-hidden className="size-4" />
            ) : feedbackToast.tone === "negative" ? (
              <ThumbsDown aria-hidden className="size-4" />
            ) : null}
            <span>{feedbackToast.message}</span>
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:py-16">
        <div className="self-start px-6 py-4">
          <Image
            src="/cadence-logo.svg"
            alt="Cadence logo"
            width={140}
            height={44}
            className="h-auto w-[140px]"
            priority
          />
        </div>
        <header className="mx-auto max-w-4xl space-y-4 text-center">
          <h1 className="font-heading text-foreground text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Your day, shaped by how you actually feel.
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
            Most planners treat every Monday the same. This one adapts to your
            sleep, energy, cycle, and feedback - so your schedule fits the
            person you are today, not yesterday.
          </p>
          <Button
            type="button"
            size="lg"
            className="mx-auto mt-2 rounded-xl bg-black px-8 text-base text-white hover:bg-black/90"
            onClick={handleScrollToTuneInputs}
          >
            Plan my day →
          </Button>
        </header>

        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-border/70 border-b">
            <CardTitle>Try a persona</CardTitle>
            <CardDescription>
              Tap a persona to prefill the form and generate a plan instantly.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PERSONA_PRESETS.map((persona) => (
                <Button
                  key={persona.id}
                  type="button"
                  variant="outline"
                  className="h-14 justify-start px-3 text-left"
                  disabled={submitting}
                  onClick={() => void handlePersonaSelect(persona)}
                >
                  <span className="block w-full truncate text-xs leading-tight sm:text-[11px]">
                    <span className="text-foreground font-semibold">
                      {persona.title}
                    </span>
                    <span className="text-muted-foreground"> - </span>
                    <span className="text-muted-foreground">
                      {persona.subtitle}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card
          id="tune-inputs"
          className="border-border/80 mx-auto w-full max-w-xl scroll-mt-24 shadow-sm"
        >
          <CardHeader className="border-border/70 border-b">
            <CardTitle>Tune your inputs</CardTitle>
            <CardDescription>
              Adjust how you&apos;re showing up today, then generate a schedule
              tailored to your state.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-10 pt-8">
            <div className="border-border/80 bg-muted/30 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">
                  Voice check-in
                </p>
                {voiceStatusText ? (
                  <p
                    role={voiceError ? "alert" : "status"}
                    aria-live="polite"
                    className={cn(
                      "mt-1 text-xs leading-relaxed",
                      voiceError ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {voiceStatusText}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant={voiceBusy ? "secondary" : "outline"}
                className="w-full sm:w-auto"
                disabled={submitting && !voiceBusy}
                onClick={() => void handleVoiceCheckIn()}
              >
                {voiceBusy ? (
                  <MicOff aria-hidden className="size-4" />
                ) : (
                  <Mic aria-hidden className="size-4" />
                )}
                {voiceBusy ? "Stop check-in" : "Voice check-in"}
              </Button>
            </div>

            <section className="space-y-8" aria-labelledby="wellbeing-heading">
              <h2
                id="wellbeing-heading"
                className="text-foreground font-medium tracking-tight"
              >
                How you&apos;re showing up today
              </h2>

              <div className="space-y-10">
                <RatingSlider
                  id="sleep-quality"
                  label="Sleep quality"
                  description="Roughly how restored you feel compared to usual."
                  value={sleepQuality}
                  onValueChange={setSleepQuality}
                />
                <RatingSlider
                  id="body-energy"
                  label="Body energy"
                  description="Overall physical stamina and zest for motion."
                  value={bodyEnergy}
                  onValueChange={setBodyEnergy}
                />
                <RatingSlider
                  id="mental-clarity"
                  label="Mental clarity"
                  description="Focus, sharpness, and ease deciding what matters."
                  value={mentalClarity}
                  onValueChange={setMentalClarity}
                />
              </div>
            </section>

            <section className="space-y-4" aria-labelledby="cycle-heading">
              <div className="space-y-1">
                <h2
                  id="cycle-heading"
                  className="text-foreground font-medium tracking-tight"
                >
                  Cycle phase
                </h2>
                <p className="text-muted-foreground text-xs">
                  Helps tailor intensity and pacing in the generated plan.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cycle-phase" className="sr-only">
                  Cycle phase
                </Label>
                <Select value={cyclePhase} onValueChange={setCyclePhase}>
                  <SelectTrigger id="cycle-phase" className="h-11 w-full min-w-0">
                    <SelectValue placeholder="Choose your current phase…" />
                  </SelectTrigger>
                  <SelectContent>
                    {cycleOptions.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground min-h-[1lh] text-xs">
                  {phaseLabel ? `Selected: ${phaseLabel}` : "\u00a0"}
                </p>
              </div>
            </section>

            <section className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="today-tasks" className="text-foreground">
                  Today&apos;s tasks
                </Label>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Dump everything on your plate — commas, bullets, or freeform.
                </p>
              </div>
              <Textarea
                id="today-tasks"
                value={tasks}
                onChange={(e) => setTasks(e.target.value)}
                placeholder="e.g., Ship Convex schema review, groceries, reply to Dana about Friday…"
                className="min-h-36 resize-y md:min-h-40 md:text-base"
              />
            </section>
          </CardContent>

          <CardFooter className="border-border/70 mt-4 flex-col items-stretch gap-4 border-t px-6 py-6 sm:px-8">
            <Button
              type="button"
              size="lg"
              className="focus-visible:ring-offset-background w-full sm:w-auto sm:min-w-[12rem]"
              disabled={submitting}
              onClick={() => void handleGeneratePlan()}
            >
              <span>{submitting ? "Generating…" : "Generate plan"}</span>
              {feedback.length > 0 ? (
                <span
                  aria-label={`${feedback.length} feedback ${feedback.length === 1 ? "item" : "items"} will be applied`}
                  title={`${feedback.length} feedback ${feedback.length === 1 ? "item" : "items"} will be applied`}
                  className="bg-primary-foreground/20 text-primary-foreground ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums"
                >
                  {feedback.length}
                </span>
              ) : null}
            </Button>
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={morningBriefLoading || !plan}
                onClick={() => void handleSendMorningBrief()}
              >
                {morningBriefLoading
                  ? "Preparing brief..."
                  : "Preview Morning Brief"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={exportingCalendar || !plan}
                onClick={() => void handleExportCalendar()}
              >
                {exportingCalendar
                  ? "Exporting calendar…"
                  : "Export to Calendar"}
              </Button>
            </div>
            {morningBriefError ? (
              <p
                role="alert"
                className="text-destructive text-sm leading-relaxed"
              >
                {morningBriefError}
              </p>
            ) : null}
            {exportCalendarError ? (
              <p
                role="alert"
                className="text-destructive text-sm leading-relaxed"
              >
                {exportCalendarError}
              </p>
            ) : null}
            {feedback.length > 0 ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {feedback.length} saved rating
                {feedback.length === 1 ? "" : "s"} — they&apos;ll be considered
                when generating the next plan.
              </p>
            ) : null}
            {planError ? (
              <p
                role="alert"
                className="text-destructive text-sm leading-relaxed"
              >
                {planError}
              </p>
            ) : null}
          </CardFooter>
        </Card>

        {plan ? (
          <Card className="border-border/80 mx-auto w-full max-w-xl shadow-md">
            <CardHeader className="border-border/70 border-b">
              <CardTitle>Today&apos;s suggested schedule</CardTitle>
              <CardDescription>
                Coloured by block type · times are illustrative — tweak to fit
                your day.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-10 pt-8">
              {planInputs &&
              buildAdaptationMessages(planInputs).length > 0 ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-xl border border-amber-500/50 bg-amber-100/70 px-4 py-3 text-amber-950 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-50"
                >
                  <p className="text-sm leading-relaxed font-bold">
                    <span aria-hidden className="mr-1.5">
                      ⚡
                    </span>
                    <span className="uppercase tracking-wide">Adapted: </span>
                    {buildAdaptationMessages(planInputs).join(". ")}.
                  </p>
                </div>
              ) : null}

              <ol className="space-y-4" aria-label="Schedule timeline">
                {plan.schedule.map((item, index) => {
                  const accent = timelineAccent(item.type);
                  const key = feedbackKey(item.time, item.task);
                  const isDownvoted = downvotedKeys.has(key);
                  const isUpvoted = upvotedKeys.has(key);
                  return (
                    <li
                      key={`${item.time}-${item.task}-${index}`}
                      className={cn(
                        "flex gap-3 overflow-hidden rounded-xl border py-4 pr-3 pl-0 sm:pr-4",
                        accent.surface,
                        isUpvoted &&
                          "ring-1 ring-emerald-500/50 ring-offset-1 ring-offset-background",
                        isDownvoted &&
                          "ring-1 ring-destructive/60 ring-offset-1 ring-offset-background",
                      )}
                    >
                      <div
                        className={cn("w-1 shrink-0 rounded-full", accent.bar)}
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-6">
                        <div className="text-muted-foreground shrink-0 text-xs tabular-nums font-semibold tracking-tight uppercase sm:w-36 sm:pt-0.5">
                          {item.time}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                                accent.pill,
                              )}
                            >
                              {item.type.replace(/_/g, " ")}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {item.duration}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "text-foreground text-[0.9375rem] leading-snug font-medium",
                              isDownvoted && "line-through opacity-70",
                            )}
                          >
                            <LinkifiedBlock text={item.task} />
                          </p>
                        </div>
                      </div>
                      <div
                        className="flex shrink-0 items-start gap-1 pt-0.5"
                        role="group"
                        aria-label={`Rate ${item.task}`}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={
                            isUpvoted
                              ? `Remove positive feedback for ${item.task}`
                              : `Thumbs up: ${item.task}`
                          }
                          aria-pressed={isUpvoted}
                          className={cn(
                            isUpvoted
                              ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => handleThumbsUp(item)}
                        >
                          <ThumbsUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant={isDownvoted ? "destructive" : "ghost"}
                          size="icon-sm"
                          aria-label={
                            isDownvoted
                              ? `Remove negative feedback for ${item.task}`
                              : `Thumbs down: ${item.task}`
                          }
                          aria-pressed={isDownvoted}
                          className={cn(
                            !isDownvoted &&
                              "text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => handleThumbsDown(item)}
                        >
                          <ThumbsDown aria-hidden />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="border-border border-t pt-8">
                <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
                  Rationale
                </p>
                <p className="text-foreground/90 italic leading-relaxed">
                  <LinkifiedBlock text={plan.rationale} />
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  disabled={speakLoading}
                  onClick={() => void handlePlayRationale(plan.rationale)}
                >
                  {speakLoading
                    ? "Generating audio…"
                    : speakSynthAwaitingTap
                      ? "🔊 Tap for browser voice"
                      : speakAwaitingTap
                        ? "▶ Tap to play audio"
                        : "🔊 Play rationale"}
                </Button>
                {speakHint ? (
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {speakHint}
                  </p>
                ) : null}
                {speakError ? (
                  <p
                    role="alert"
                    className="text-destructive mt-2 text-sm leading-relaxed"
                  >
                    {speakError}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="border-border/80 mx-auto w-full max-w-xl shadow-sm">
          <CardHeader className="border-border/70 border-b pb-4">
            <CardTitle className="text-lg">What I know about you</CardTitle>
            <CardDescription>
              Built from plans stored privately in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-6 text-sm">
            {insights === null ? (
              <p className="text-muted-foreground">Loading insights...</p>
            ) : (
              <>
                <p>
                  <span className="font-medium">Average sleep this week:</span>{" "}
                  {insights.averageSleep == null
                    ? "Not enough data yet"
                    : `${insights.averageSleep.toFixed(1)} / 10`}
                </p>
                <p>
                  <span className="font-medium">Current estimated cycle phase:</span>{" "}
                  {insights.estimatedPhase
                    ? cycleDisplayLabel(insights.estimatedPhase)
                    : "Not enough data yet"}
                </p>
                <p>
                  <span className="font-medium">Your pattern:</span>{" "}
                  {insights.deepWorkPattern}
                </p>
                <p>
                  <span className="font-medium">Total plans generated:</span>{" "}
                  {insights.totalPlans}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 mx-auto w-full max-w-xl shadow-sm">
          <CardHeader className="border-border/70 border-b pb-4">
            <CardTitle className="text-lg">History</CardTitle>
            <CardDescription>
              Your last 5 saved plans — each new plan appears at the top.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {localPlans === null ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                Loading history…
              </p>
            ) : historyCards.length === 0 ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                After you generate a plan, it appears here with the latest one
                first.
              </p>
            ) : (
              <ul className="space-y-3" aria-label="Plan history">
                {historyCards.map((p) => {
                  const expanded = expandedHistoryId === p.id;
                  const summary = `Sleep: ${p.sleep}, ${cycleDisplayLabel(p.cyclePhase)}`;
                  const taskCount = p.schedule.length;
                  return (
                    <li key={p.id} className="list-none">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        className={cn(
                          "border-border/80 bg-card hover:bg-muted/40 flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors",
                          expanded && "bg-muted/30 border-border",
                        )}
                        onClick={() =>
                          setExpandedHistoryId(expanded ? null : p.id)
                        }
                      >
                        <div className="flex w-full items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-foreground text-sm font-semibold tracking-tight">
                              {formatHistoryCardTime(p.createdAt)}
                            </p>
                            <p className="text-muted-foreground text-xs leading-snug">
                              {summary}
                            </p>
                            <p className="text-muted-foreground text-xs tabular-nums">
                              {taskCount}{" "}
                              {taskCount === 1 ? "task" : "tasks"}
                            </p>
                          </div>
                          <ChevronDown
                            aria-hidden
                            className={cn(
                              "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform",
                              expanded && "rotate-180",
                            )}
                          />
                        </div>
                      </button>
                      {expanded ? (
                        <div className="border-border/60 mt-3 ml-1 border-l-2 pl-4">
                          <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
                            Schedule
                          </p>
                          <ol className="space-y-3" aria-label="Saved schedule">
                            {p.schedule.map((item, index) => {
                              const accent = timelineAccent(item.type);
                              return (
                                <li
                                  key={`${p.id}-${item.time}-${index}`}
                                  className={cn(
                                    "flex gap-3 overflow-hidden rounded-xl border py-3 pr-4 pl-0",
                                    accent.surface,
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "w-1 shrink-0 rounded-full",
                                      accent.bar,
                                    )}
                                    aria-hidden
                                  />
                                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:gap-5">
                                    <div className="text-muted-foreground shrink-0 text-xs tabular-nums font-semibold tracking-tight uppercase sm:w-32 sm:pt-0.5">
                                      {item.time}
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className={cn(
                                            "rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
                                            accent.pill,
                                          )}
                                        >
                                          {item.type.replace(/_/g, " ")}
                                        </span>
                                        <span className="text-muted-foreground text-xs tabular-nums">
                                          {item.duration} min
                                        </span>
                                      </div>
                                      <p className="text-foreground text-[0.875rem] leading-snug font-medium">
                                        <LinkifiedBlock text={item.task} />
                                      </p>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                          {p.rationale.trim() ? (
                            <div className="border-border mt-5 border-t pt-5">
                              <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                                Rationale
                              </p>
                              <p className="text-foreground/90 text-sm leading-relaxed italic">
                                <LinkifiedBlock text={p.rationale} />
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {morningBriefOpen ? (
        <div
          className="bg-background/75 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Morning brief email preview"
          onClick={() => setMorningBriefOpen(false)}
        >
          <div
            className="bg-card border-border w-full max-w-4xl rounded-xl border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-border flex items-start justify-between gap-4 border-b p-5">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  Email preview
                </p>
                <h2 className="text-foreground text-lg font-semibold">
                  {morningBriefSubject}
                </h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  This is a privacy-safe preview. No email is sent from the
                  public portfolio demo.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMorningBriefOpen(false)}
              >
                Close
              </Button>
            </div>
            <div className="p-5">
              <iframe
                title="Morning brief preview"
                srcDoc={morningBriefHtml}
                className="bg-background h-[70vh] w-full rounded-lg border"
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
