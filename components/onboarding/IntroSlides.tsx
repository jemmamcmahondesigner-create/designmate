"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { AuthMark } from "@/components/auth/AuthMark";
import { Button } from "@/components/ui/ds";
import { DesignTraceName } from "./DesignTraceName";
import "./onboarding.css";

// 🖼️ SWAP IMAGES HERE — replace src values when final images are ready. One entry per slide.
const SLIDE_IMAGES = [
  { src: "/images/onboarding/slide-2.jpg", alt: "" },
  { src: "/images/onboarding/slide-3.jpg", alt: "" },
  { src: "/images/onboarding/slide-4.jpg", alt: "" },
  { src: "/images/onboarding/slide-5.jpg", alt: "" },
  { src: "/images/onboarding/slide-6.jpg", alt: "" },
] as const;

const IMAGE_FALLBACK_BACKGROUND =
  "radial-gradient(ellipse at 30% 50%, #a0384f 0%, #6b1e2e 40%, #2a0812 100%)";

const MAX_TRAIL_POINTS = 40;
const TRAIL_MIN_DISTANCE_PX = 24;
const TRAIL_SQUARE_SIZE = 16;
const TRAIL_SQUARE_OFFSET = TRAIL_SQUARE_SIZE / 2;

const HEADING_FONT_MULTI = "clamp(28px, 3.5vw, 48px)";
const HEADING_FONT_WELCOME = "clamp(28px, 3.5vw, 48px)";
const SUB_FONT = "clamp(16px, 2vw, 28px)";

const INTRO_LOADING_MS = 3000;
const INTRO_LOGO_BOUNCE_MS = 1200;
const INTRO_WELCOME_ANIM_MS = 800;
const INTRO_WELCOME_SETTLE_MS = 1000;
/** Logo bounce at 3000ms; heading fade starts after bounce (4200ms). */
const INTRO_HEADING_FADE_START_MS = INTRO_LOADING_MS + INTRO_LOGO_BOUNCE_MS;
/** Split at 4200 + 800 + 1000 = 6000ms. */
const INTRO_SPLIT_START_MS =
  INTRO_HEADING_FADE_START_MS + INTRO_WELCOME_ANIM_MS + INTRO_WELCOME_SETTLE_MS;
/** Right-panel + heading horizontal slide duration (Phase 3). */
const INTRO_SPLIT_ANIM_MS = 950;
/** Delay before starting heading slide (avoids layout jerk). */
const INTRO_HEADING_SLIDE_DELAY_MS = 16;
/** Switch to STATE B after heading slide delay completes. */
const INTRO_SPLIT_TO_STATE_B_MS = INTRO_HEADING_SLIDE_DELAY_MS + INTRO_SPLIT_ANIM_MS;
const INTRO_CONTENT_PAUSE_MS = 600;
const INTRO_EXIT_MS = 500;

/** STATE A (phases 1–2) + STATE B (phase 3+) — instant DOM switch at split. */
const INTRO_UI_CSS = `
@keyframes intro-logo-bounce-up {
  0%   { transform: translate(-50%, -50%) translateY(0px); }
  45%  { transform: translate(-50%, -50%) translateY(-112px); }
  65%  { transform: translate(-50%, -50%) translateY(-82px); }
  80%  { transform: translate(-50%, -50%) translateY(-96px); }
  90%  { transform: translate(-50%, -50%) translateY(-90px); }
  100% { transform: translate(-50%, -50%) translateY(-93px); }
}

/* ── STATE A: full-screen cream (loading → welcome-settle) ── */
.intro-state-a {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: #faf8f6;
}

.intro-state-a-logo {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 4;
  pointer-events: none;
}

[data-intro-ui-phase="welcome-appear"] .intro-state-a-logo {
  animation: intro-logo-bounce-up 1200ms cubic-bezier(0.34, 1.2, 0.64, 1) forwards;
}

[data-intro-ui-phase="welcome-settle"] .intro-state-a-logo {
  transform: translate(-50%, -50%) translateY(-93px);
}

[data-intro-ui-phase="split"] .intro-state-a-logo {
  opacity: 0;
  transform: translate(-50%, -50%) translateY(-93px);
  animation: none;
  transition: opacity 300ms ease;
}

.intro-state-a-heading {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 4;
  margin: 0;
  opacity: 0;
  transform: translate(-50%, calc(-50% + 20px));
  transition: opacity 800ms ease, transform 800ms ease;
  pointer-events: none;
  max-width: none;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.intro-state-a-heading.intro-heading-split-prepare {
  opacity: 1;
  transition: none;
  transform: translate(-50%, -50%);
}

.intro-state-a-heading.intro-heading-split-active {
  opacity: 1;
  transition: left 950ms cubic-bezier(0.4, 0, 0.2, 1), transform 950ms cubic-bezier(0.4, 0, 0.2, 1);
  left: 64px;
  transform: translate(0, -50%);
}

[data-intro-ui-phase="welcome-settle"] .intro-state-a-heading {
  opacity: 1;
  transform: translate(-50%, -50%);
}

/* ── STATE B: two-panel (split → content-ready) ── */
.intro-state-b {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.intro-state-b-left {
  flex: 0 0 50%;
  height: 100vh;
  min-width: 0;
  overflow: hidden;
  background: #faf8f6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transform: translateX(0);
}

[data-intro-ui-phase="exiting"] .intro-state-b-left {
  transform: translateX(-100%);
  transition: transform 500ms cubic-bezier(0.4, 0, 0.2, 1);
}

.intro-state-b-left-inner {
  width: 100%;
  padding-left: 64px;
  padding-right: 64px;
  box-sizing: border-box;
}

.intro-state-b-left h1 {
  font-size: 48px;
  width: 100%;
  max-width: none;
  min-width: 0;
  text-align: left;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.intro-state-b-right {
  flex: 0 0 50%;
  height: 100vh;
  min-width: 0;
  position: relative;
  overflow: hidden;
  background: #1a0810;
  transform: translateX(100%);
  opacity: 0;
  transition:
    transform 950ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 300ms ease;
}

.intro-state-b-right.is-open,
.intro-state-b-right.is-open-immediate {
  transform: translateX(0);
  opacity: 1;
}

.intro-state-b-right.is-open-immediate {
  transition: none;
}

[data-intro-ui-phase="exiting"] .intro-state-b-right.is-open-immediate {
  transform: translateX(100%);
  opacity: 1;
  transition: transform 500ms cubic-bezier(0.4, 0, 0.2, 1);
}

.intro-split-right-peek {
  position: fixed;
  top: 0;
  right: 0;
  width: 50vw;
  height: 100vh;
  z-index: 3;
  overflow: hidden;
  background: #1a0810;
  transform: translateX(100%);
  opacity: 0;
  transition:
    transform 950ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 300ms ease;
}

.intro-split-right-peek.is-open {
  transform: translateX(0);
  opacity: 1;
}

.intro-state-b-overlay {
  position: absolute;
  top: 50%;
  left: 64px;
  right: 64px;
  transform: translateY(-50%);
  z-index: 1;
  margin: 0;
  opacity: 0;
  pointer-events: none;
  text-align: left;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

[data-intro-ui-phase="content-ready"] .intro-state-b-overlay {
  opacity: 1;
  transition: opacity 500ms ease;
}

.intro-content-fade {
  opacity: 0;
  transition: opacity 500ms ease;
}

[data-intro-ui-phase="content-ready"] .intro-content-fade {
  opacity: 1;
}
`;

type TransitionState = "idle" | "wiping-in" | "revealing";

type IntroPhase =
  | "loading"
  | "welcome-appear"
  | "welcome-settle"
  | "split"
  | "content-ready"
  | "exiting";

type IntroSlidesProps = {
  reducedMotion: boolean;
  exiting?: boolean;
  onComplete: () => void;
};

type SlideConfig = {
  imageOnLeft: boolean;
  showImageOverlay: boolean;
  text: ReactNode;
};

function SlideHeading({ children }: { children: ReactNode }) {
  return (
    <h1
      className="m-0 font-extrabold"
      style={{
        fontSize: HEADING_FONT_MULTI,
        lineHeight: 1.15,
        letterSpacing: "-1.44px",
        color: "var(--text-heading, #6b1e2e)",
      }}
    >
      {children}
    </h1>
  );
}

function SlideSub({ children }: { children: ReactNode }) {
  return (
    <p
      className="m-0 mt-6 font-light"
      style={{
        fontSize: SUB_FONT,
        lineHeight: 1.35,
        letterSpacing: "-0.84px",
        color: "var(--text-secondary, #6b5e55)",
      }}
    >
      {children}
    </p>
  );
}

function WelcomeHeading({ centered = false }: { centered?: boolean }) {
  return (
    <h1
      className={`m-0 font-extrabold ${centered ? "onboarding-welcome-heading-centered" : "onboarding-welcome-heading-split"}`}
      style={{
        fontSize: "48px",
        lineHeight: 1.15,
        letterSpacing: "-1.44px",
        color: "var(--text-heading, #6b1e2e)",
      }}
    >
      Welcome to <DesignTraceName />
    </h1>
  );
}

function ImageOverlayText({ className }: { className?: string }) {
  return (
    <h1
      className={`m-0 text-white ${className ?? ""}`}
      style={{
        fontSize: 48,
        fontWeight: 400,
        lineHeight: 1.15,
        letterSpacing: "-1.44px",
        textShadow: "0 2px 12px rgba(0,0,0,0.4)",
        whiteSpace: "normal",
        wordWrap: "break-word",
        overflowWrap: "break-word",
        flexShrink: 0,
      }}
    >
      <span style={{ fontWeight: 400 }}>your </span>
      <span style={{ fontWeight: 400, color: "#ebc5ed" }}>ai </span>
      <span style={{ fontWeight: 700 }}>design memory</span>
    </h1>
  );
}

const SLIDES: SlideConfig[] = [
  {
    imageOnLeft: false,
    showImageOverlay: true,
    text: <WelcomeHeading />,
  },
  {
    imageOnLeft: true,
    showImageOverlay: false,
    text: (
      <>
        <SlideHeading>Capture the thinking behind your work</SlideHeading>
        <SlideSub>
          Keep rationale, feedback and context connected as designs evolve.
        </SlideSub>
      </>
    ),
  },
  {
    imageOnLeft: false,
    showImageOverlay: false,
    text: (
      <>
        <SlideHeading>Turn scattered feedback into structured memory</SlideHeading>
        <SlideSub>
          Track what was discussed, what changed, and why it mattered.
        </SlideSub>
      </>
    ),
  },
  {
    imageOnLeft: true,
    showImageOverlay: false,
    text: (
      <>
        <SlideHeading>
          <span className="font-light" style={{ color: "#a0384f" }}>
            Trace{" "}
          </span>
          decisions back to the problem
        </SlideHeading>
        <SlideSub>
          See the path from user need, to trade-off, to final direction.
        </SlideSub>
      </>
    ),
  },
  {
    imageOnLeft: false,
    showImageOverlay: false,
    text: (
      <>
        <SlideHeading>
          Faster iteration.
          <br />
          Clearer decisions.
          <br />
          Shared memory.
        </SlideHeading>
        <SlideSub>
          <DesignTraceName textColor="#6b5e55" /> keeps your team aligned as the work evolves.
        </SlideSub>
      </>
    ),
  },
];

const SLIDE_COUNT = SLIDES.length;

function ImagePanelContent({
  activeSlideIndex,
  showOverlay,
  overlayWrapperClassName,
}: {
  activeSlideIndex: number;
  showOverlay: boolean;
  /** Wrapper around overlay copy (intro uses layout-specific positioning). */
  overlayWrapperClassName?: string;
}) {
  const [failedIndices, setFailedIndices] = useState<Set<number>>(() => new Set());

  return (
    <>
      {SLIDE_IMAGES.map((image, index) => {
        const isActive = index === activeSlideIndex;
        const failed = failedIndices.has(index);

        if (failed) {
          return (
            <div
              key={image.src}
              className="absolute inset-0 h-full w-full"
              style={{
                background: IMAGE_FALLBACK_BACKGROUND,
                opacity: isActive ? 1 : 0,
                pointerEvents: "none",
              }}
              aria-hidden={!isActive}
            />
          );
        }

        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={image.src}
            src={image.src}
            alt={image.alt}
            className="onboarding-slide-image absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: isActive ? 1 : 0,
              pointerEvents: "none",
            }}
            aria-hidden={!isActive}
            onError={() => {
              setFailedIndices((prev) => new Set(prev).add(index));
            }}
          />
        );
      })}
      {showOverlay ? (
        <div className={overlayWrapperClassName ?? "intro-overlay-copy"}>
          <ImageOverlayText />
        </div>
      ) : null}
    </>
  );
}

function ImagePanelColumn({
  slideIndex,
  showOverlay,
  overlayWrapperClassName,
  wipeAnchor,
  wipeWidth,
  onWipeTransitionEnd,
}: {
  slideIndex: number;
  showOverlay: boolean;
  overlayWrapperClassName?: string;
  wipeAnchor: "left" | "right";
  wipeWidth: "0%" | "100%";
  onWipeTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="relative h-full min-w-0 flex-1 basis-0 overflow-hidden">
      <div className="relative h-full w-full overflow-hidden bg-[#1a0810]">
        <ImagePanelContent
          activeSlideIndex={slideIndex}
          showOverlay={showOverlay}
          overlayWrapperClassName={overlayWrapperClassName}
        />
        <div
          className={`onboarding-wipe onboarding-wipe-anchor-${wipeAnchor}`}
          style={{ width: wipeWidth }}
          onTransitionEnd={onWipeTransitionEnd}
        />
      </div>
    </div>
  );
}

export function IntroSlides({ reducedMotion, exiting = false, onComplete }: IntroSlidesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const trailPointsRef = useRef<{ x: number; y: number }[]>([]);
  const pendingSlideRef = useRef<number | null>(null);

  const [slideIndex, setSlideIndex] = useState(0);
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const [wipeWidth, setWipeWidth] = useState<"0%" | "100%">("0%");
  const [wipeAnchor, setWipeAnchor] = useState<"left" | "right">("left");
  const [copyVisible, setCopyVisible] = useState(false);
  const [copyFadingOut, setCopyFadingOut] = useState(false);
  const [introPhase, setIntroPhase] = useState<IntroPhase>("loading");
  const [splitRightPanelOpen, setSplitRightPanelOpen] = useState(false);
  const [splitLayoutReady, setSplitLayoutReady] = useState(false);
  const [headingSlideStarted, setHeadingSlideStarted] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const introExitTimerRef = useRef<number | null>(null);

  const slide = SLIDES[slideIndex];
  const isLastSlide = slideIndex === SLIDE_COUNT - 1;
  const isTransitioning = transitionState !== "idle";
  const buttonsOnDarkPanel = !slide.imageOnLeft;

  useEffect(() => {
    if (reducedMotion) return;
    const img = new Image();
    img.src = SLIDE_IMAGES[0]?.src ?? "";
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    const logoBounceTimer = window.setTimeout(() => {
      setIntroPhase("welcome-appear");
    }, INTRO_LOADING_MS);
    const headingFadeTimer = window.setTimeout(() => {
      setIntroPhase("welcome-settle");
    }, INTRO_HEADING_FADE_START_MS);
    const splitTimer = window.setTimeout(() => {
      setIntroPhase("split");
    }, INTRO_SPLIT_START_MS);
    const contentReadyAt =
      INTRO_SPLIT_START_MS + INTRO_SPLIT_ANIM_MS + INTRO_CONTENT_PAUSE_MS;
    const contentTimer = window.setTimeout(() => {
      setIntroPhase("content-ready");
    }, contentReadyAt);

    return () => {
      window.clearTimeout(logoBounceTimer);
      window.clearTimeout(headingFadeTimer);
      window.clearTimeout(splitTimer);
      window.clearTimeout(contentTimer);
    };
  }, [reducedMotion]);

  useEffect(() => {
    return () => {
      if (introExitTimerRef.current !== null) {
        window.clearTimeout(introExitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (introPhase !== "split") {
      setSplitRightPanelOpen(false);
      setSplitLayoutReady(false);
      return;
    }
    setSplitLayoutReady(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSplitRightPanelOpen(true));
    });
    const layoutTimer = window.setTimeout(() => {
      setSplitLayoutReady(true);
    }, INTRO_SPLIT_TO_STATE_B_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(layoutTimer);
    };
  }, [introPhase]);

  useEffect(() => {
    if (introPhase !== "split" || splitLayoutReady) {
      setHeadingSlideStarted(false);
      return;
    }
    setHeadingSlideStarted(false);
    const t = window.setTimeout(() => setHeadingSlideStarted(true), INTRO_HEADING_SLIDE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [introPhase, splitLayoutReady]);

  useEffect(() => {
    if (reducedMotion) {
      onComplete();
    }
  }, [reducedMotion, onComplete]);

  const completeIntro = useCallback(() => {
    if (isCompleting) return;
    setIsCompleting(true);
    if (reducedMotion) {
      onComplete();
      return;
    }
    window.setTimeout(() => {
      onComplete();
    }, 300);
  }, [isCompleting, onComplete, reducedMotion]);

  const startCopyEnter = useCallback(() => {
    setCopyFadingOut(false);
    setCopyVisible(false);
    requestAnimationFrame(() => {
      setCopyVisible(true);
    });
  }, []);

  useEffect(() => {
    if (slideIndex === 0 && !reducedMotion && introPhase === "content-ready") {
      startCopyEnter();
    }
  }, [slideIndex, reducedMotion, introPhase, startCopyEnter]);

  const handleWipeTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLDivElement>) => {
      if (reducedMotion || event.propertyName !== "width") return;

      if (transitionState === "wiping-in" && wipeWidth === "100%") {
        const nextIndex = pendingSlideRef.current;
        if (nextIndex === null) return;

        const nextSlide = SLIDES[nextIndex];
        setSlideIndex(nextIndex);
        pendingSlideRef.current = null;

        setTransitionState("revealing");
        setWipeAnchor(nextSlide.imageOnLeft ? "left" : "right");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setWipeWidth("0%"));
        });
        return;
      }

      if (transitionState === "revealing" && wipeWidth === "0%") {
        setTransitionState("idle");
        startCopyEnter();
      }
    },
    [reducedMotion, transitionState, wipeWidth, startCopyEnter],
  );

  const goToSlide = useCallback(
    (nextIndex: number) => {
      if (isTransitioning || isCompleting) return;

      const currentSlide = SLIDES[slideIndex];

      if (reducedMotion) {
        setSlideIndex(nextIndex);
        setCopyVisible(true);
        return;
      }

      pendingSlideRef.current = nextIndex;
      setCopyFadingOut(true);
      setTransitionState("wiping-in");
      setWipeAnchor(currentSlide.imageOnLeft ? "right" : "left");
      setWipeWidth("0%");
      if (slideIndex === 0) {
        setSlideIndex(nextIndex);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setWipeWidth("100%"));
      });
    },
    [isTransitioning, isCompleting, reducedMotion, slideIndex],
  );

  const handleNext = useCallback(() => {
    if (isLastSlide) {
      completeIntro();
      return;
    }
    if (slideIndex === 0 && introPhase === "content-ready") {
      setIntroPhase("exiting");
      introExitTimerRef.current = window.setTimeout(() => {
        introExitTimerRef.current = null;
        goToSlide(1);
      }, INTRO_EXIT_MS);
      return;
    }
    if (introPhase === "exiting") {
      return;
    }
    goToSlide(slideIndex + 1);
  }, [isLastSlide, completeIntro, goToSlide, slideIndex, introPhase]);

  const resizeCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const { width, height } = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const drawTrail = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    const points = trailPointsRef.current;
    if (points.length === 0) return;

    const imageOnLeft = slide.imageOnLeft;
    const midX = window.innerWidth / 2;

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i]!;
      const prevPoint = i > 0 ? points[i - 1]! : point;
      const alpha = points.length === 1 ? 1 : i / (points.length - 1);

      const overImagePanel = imageOnLeft ? point.x < midX : point.x >= midX;
      const px = point.x - rect.left;
      const py = point.y - rect.top;

      if (overImagePanel) {
        ctx.fillStyle = `rgba(250, 248, 246, ${alpha})`;
      } else {
        ctx.fillStyle = `rgba(160, 56, 79, ${alpha})`;
      }

      const angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.fillRect(-TRAIL_SQUARE_OFFSET, -TRAIL_SQUARE_OFFSET, TRAIL_SQUARE_SIZE, TRAIL_SQUARE_SIZE);
      ctx.restore();
    }
  }, [slide.imageOnLeft]);

  const scheduleTrailDraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      drawTrail();
    });
  }, [drawTrail]);

  useEffect(() => {
    if (reducedMotion) return;

    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reducedMotion, resizeCanvas]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const points = trailPointsRef.current;
      const last = points[points.length - 1];
      if (last) {
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        if (dx * dx + dy * dy < TRAIL_MIN_DISTANCE_PX * TRAIL_MIN_DISTANCE_PX) {
          return;
        }
      }
      points.push({ x: e.clientX, y: e.clientY });
      if (points.length > MAX_TRAIL_POINTS) {
        points.shift();
      }
      scheduleTrailDraw();
    },
    [scheduleTrailDraw],
  );

  useEffect(() => {
    if (reducedMotion) return;

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [reducedMotion, handleMouseMove]);

  useEffect(() => {
    trailPointsRef.current = [];
    drawTrail();
  }, [slideIndex, drawTrail]);

  useEffect(() => {
    if (transitionState !== "revealing" || reducedMotion) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setWipeWidth("0%"));
    });
  }, [transitionState, slideIndex, reducedMotion]);

  if (reducedMotion) {
    return null;
  }

  const copyClassName = [
    copyFadingOut ? "onboarding-copy-fade-out" : "",
    !copyFadingOut && copyVisible && slideIndex !== 0 ? "onboarding-copy-enter" : "",
    !copyFadingOut && !copyVisible && slideIndex !== 0 ? "onboarding-copy-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const isWelcomeIntroLayout = slideIndex === 0 && transitionState === "idle";
  const introStateA =
    introPhase === "loading" ||
    introPhase === "welcome-appear" ||
    introPhase === "welcome-settle" ||
    (introPhase === "split" && !splitLayoutReady);
  const introStateB =
    splitLayoutReady ||
    introPhase === "content-ready" ||
    introPhase === "exiting";
  const introSplitTransition =
    introPhase === "split" && !splitLayoutReady;
  const introControlsVisible =
    slideIndex > 0 ||
    introPhase === "content-ready" ||
    introPhase === "exiting";
  const introFooterFadeClass =
    slideIndex === 0 && introControlsVisible ? "intro-content-fade" : "";
  const introSlideButtonDisabled = isCompleting || introPhase === "exiting";
  const slideButtonDisabled = isTransitioning || isCompleting;

  const imageColumn = (
    <ImagePanelColumn
      key="intro-image-panel"
      slideIndex={slideIndex}
      showOverlay={slide.showImageOverlay}
      wipeAnchor={wipeAnchor}
      wipeWidth={wipeWidth}
      onWipeTransitionEnd={handleWipeTransitionEnd}
    />
  );

  const textColumn = (
    <div
      key="intro-text-panel"
      className="flex h-full min-w-0 flex-1 basis-0 items-center px-16"
      style={{ background: "var(--surface-page, #faf8f6)" }}
    >
      <div className={`w-full text-left ${copyClassName}`.trim()}>{slide.text}</div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={[
        "fixed inset-0 z-50 h-screen w-screen cursor-auto",
        exiting || isCompleting ? "onboarding-intro-exit" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <canvas
        ref={canvasRef}
        className="onboarding-cursor-trail-canvas"
        style={{ zIndex: 15 }}
        aria-hidden
      />

      <div
        className="h-full w-full"
        data-intro-ui-phase={isWelcomeIntroLayout ? introPhase : undefined}
      >
      {isWelcomeIntroLayout ? (
        <>
          <style dangerouslySetInnerHTML={{ __html: INTRO_UI_CSS }} />
          <>
            {introStateA ? (
              <div className="intro-state-a">
                <div className="intro-state-a-logo">
                  <AuthMark height={80} squareBlink={introPhase === "loading"} />
                </div>
                {introPhase !== "loading" ? (
                  <div
                    className={[
                      "intro-state-a-heading",
                      introSplitTransition
                        ? headingSlideStarted
                          ? "intro-heading-split-active"
                          : "intro-heading-split-prepare"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <WelcomeHeading />
                  </div>
                ) : null}
              </div>
            ) : null}
            {introSplitTransition ? (
              <div
                className={[
                  "intro-split-right-peek",
                  splitRightPanelOpen ? "is-open" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <ImagePanelContent activeSlideIndex={0} showOverlay={false} />
              </div>
            ) : null}
            {introStateB ? (
              <div className="intro-state-b">
                <div className="intro-state-b-left">
                  <div className="intro-state-b-left-inner">
                    <WelcomeHeading />
                  </div>
                </div>
                <div className="intro-state-b-right is-open-immediate">
                  <ImagePanelContent
                    activeSlideIndex={0}
                    showOverlay={slide.showImageOverlay}
                    overlayWrapperClassName="intro-state-b-overlay"
                  />
                </div>
              </div>
            ) : null}
          </>
        </>
      ) : (
        <div className="flex h-full w-full">
          {slide.imageOnLeft ? (
            <>
              {imageColumn}
              {textColumn}
            </>
          ) : (
            <>
              {textColumn}
              {imageColumn}
            </>
          )}
        </div>
      )}

      <div
        className={[
          "fixed bottom-8 right-8 z-50 flex flex-row items-center gap-2",
          introFooterFadeClass,
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          introControlsVisible
            ? undefined
            : { opacity: 0, pointerEvents: "none" }
        }
      >
        {!isLastSlide ? (
          <Button
            variant={buttonsOnDarkPanel ? "ghost-on-dark" : "ghost"}
            size="lg"
            label="Skip intro"
            disabled={isWelcomeIntroLayout ? introSlideButtonDisabled : slideButtonDisabled}
            onClick={completeIntro}
            style={
              buttonsOnDarkPanel
                ? { border: "none", boxShadow: "none" }
                : undefined
            }
          />
        ) : null}
        <Button
          variant={buttonsOnDarkPanel ? "primary-on-dark" : "primary"}
          size="lg"
          label={isLastSlide ? "Get Started" : "Next"}
          icon="trailing"
          iconName="chevron-right"
          disabled={isWelcomeIntroLayout ? introSlideButtonDisabled : slideButtonDisabled}
          onClick={handleNext}
          style={
            buttonsOnDarkPanel
              ? undefined
              : {
                  backgroundColor: "#6b1e2e",
                  borderColor: "#6b1e2e",
                  color: "#ffffff",
                }
          }
        />
      </div>
      </div>
    </div>
  );
}
